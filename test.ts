// node test.ts — fake gateway in both dialects; checks arms, tool-calling,
// the shape of BenchmarkData and the api. Never touches the network.
import assert from "node:assert";
import { createServer } from "node:http";
import { rmSync, readFileSync } from "node:fs";
import { api } from "./src/api.ts";
import { benchmark, listSuites, loadSuite, saveBenchmark } from "./src/runner.ts";
import { loadSkill, systemPrompt, routedOk } from "./src/skills.ts";
import * as store from "./src/store.ts";

// --- suites, casos y skills
assert.ok(listSuites().includes("outlayer"), `suites: ${listSuites()}`);
const suite = loadSuite();
assert.ok(suite.cases.length > 0 && suite.flows.length > 0);
assert.ok(suite.preamble.includes("OutLayer"), "the suite brings its own preamble");
const cases = suite.cases;
const skill = loadSkill("agent-custody");
const mono = loadSkill("outlayer"); // old skill, no references/
assert.ok(skill.refs.includes("intents-swap.md"));
assert.equal(mono.refs.length, 0);
const swap = cases.find((c) => c.ref === "intents-swap.md")!;

assert.ok(!systemPrompt("none", skill, swap.ref).includes("<skill>"));
assert.ok(systemPrompt("full", skill, swap.ref).length > systemPrompt("core", skill, swap.ref).length, "full is the monolith: core + every ref");
assert.ok(systemPrompt("routed", skill, swap.ref).includes('<reference name="intents-swap.md">'));
assert.ok(!systemPrompt("agentic", skill, swap.ref).includes("<reference"), "agentic is not served the ref");
assert.equal(systemPrompt("full", mono, "-"), systemPrompt("core", mono, "-"), "a skill with no refs is already its own monolith");
assert.equal(routedOk("!", null), true);
assert.equal(routedOk("!", "cli.md"), false);
assert.equal(routedOk("-", "cli.md"), null);

// --- fake gateway: first it asks for the reference, then answers with the match.
const fake = createServer((req, res) => {
  let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => {
    const anthropic = req.url!.includes("messages");
    const body = JSON.parse(b);
    const asked = JSON.stringify(body).includes("tool_call_id") || JSON.stringify(body).includes("tool_result");
    const wantsTool = Boolean(body.tools?.length) && !asked;
    const answer = `intents/swap/quote api.outlayer.ai/register msgs:${(body.messages?.length ?? 0) - 1}`;

    if (anthropic)
      return res.end(JSON.stringify({
        content: wantsTool
          ? [{ type: "tool_use", id: "t1", name: "read_reference", input: { file: "intents-swap.md" } }]
          : [{ type: "text", text: answer }],
        usage: { input_tokens: 10, output_tokens: 5 },
      }));

    res.end(JSON.stringify({
      choices: [{ message: wantsTool
        ? { role: "assistant", content: "", tool_calls: [{ id: "t1", type: "function", function: { name: "read_reference", arguments: '{"file":"intents-swap.md"}' } }] }
        : { role: "assistant", content: answer } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }));
  });
}).listen(0);
const fakeUrl = `http://127.0.0.1:${(fake.address() as any).port}`;
const gwOf = (kind: "openai" | "anthropic") => ({
  id: kind, label: kind, kind, model: "m", apiKey: "k",
  baseUrl: kind === "openai" ? `${fakeUrl}/v1` : fakeUrl, pricing: { in: 2, out: 3 },
});

// --- benchmark: the shape of BenchmarkData and agentic routing, in both dialects
for (const kind of ["openai", "anthropic"] as const) {
  const data = await benchmark({ gw: gwOf(kind), skills: ["agent-custody"], tags: ["swap"], arms: ["core", "routed", "agentic"], runs: 2 });
  assert.deepEqual(data.skills, ["agent-custody"]);
  assert.equal(data.suite, "outlayer");
  assert.deepEqual(data.arms, ["core", "routed", "agentic"]);
  assert.equal(data.runs, 2);
  assert.deepEqual(data.pricing, { in: 2, out: 3 });
  assert.equal(data.results.length, 2 * 3 * 2, `${kind}: 2 casos x 3 arms x 2 runs`);

  for (const r of data.results) {
    assert.deepEqual(Object.keys(r).sort(), ["arm", "asked", "cost", "expect", "history", "i", "inTok", "outTok", "pass", "prompt", "ref", "skill", "system", "tag", "text"].sort(), `${kind}: ResultItem shape`);
    assert.ok(r.pass, `${kind}/${r.arm}: ${r.text}`);
  }
  assert.deepEqual([...new Set(data.results.map((r) => r.i))].sort(), [0, 1]);

  const agentic = data.results.filter((r) => r.arm === "agentic");
  assert.ok(agentic.every((r) => r.asked === "intents-swap.md"), `${kind}: asked for the reference`);
  assert.ok(agentic.every((r) => r.inTok === 20 && r.outTok === 10), `${kind}: sums the tokens of both round-trips`);
  assert.ok(agentic.every((r) => r.cost === 20 * 2 + 10 * 3));
  assert.ok(data.results.filter((r) => r.arm === "core").every((r) => r.asked === null), "with no tool it asks for nothing");
}

// --- conversations: turns carry over from one step to the next
const flow = await benchmark({ gw: gwOf("openai"), mode: "flows", arms: ["core"] });
const steps = suite.flows[0].steps.length;
assert.equal(flow.results.length, steps, "one answer per step");
assert.ok(flow.results.every((r) => r.conversation === "wrap-swap-withdraw"));
assert.deepEqual(flow.results.map((r) => r.step), [...Array(steps).keys()].map((n) => n + 1));
// the fake returns how many messages it received: it must grow by 2 per step (user + assistant)
const msgs = flow.results.map((r) => Number(r.text.match(/msgs:(\d+)/)![1]));
assert.deepEqual(msgs, msgs.map((_, n) => 1 + n * 2), `historia acumulada: ${msgs}`);

// --- a skill with no references/: routed and agentic drop themselves
const solo = await benchmark({ gw: gwOf("openai"), skills: ["outlayer"], tags: ["swap"], arms: ["none", "full", "core", "routed", "agentic"] });
assert.deepEqual(solo.skills, ["outlayer"]);
assert.deepEqual([...new Set(solo.results.map((r) => r.arm))].sort(), ["core", "full", "none"]);

// --- comparar dos skills: la misma batería contra los dos, cada fila sabe de quién es
const duel = await benchmark({ gw: gwOf("openai"), skills: ["agent-custody", "outlayer"], tags: ["swap"], arms: ["core", "agentic"] });
assert.deepEqual(duel.skills.sort(), ["agent-custody", "outlayer"]);
// agentic solo aplica al que tiene references/: 2 casos x (2 arms + 1 arm)
assert.equal(duel.results.length, 2 * 3, `celdas skill x arm: ${duel.results.length}`);
assert.deepEqual([...new Set(duel.results.filter((r) => r.arm === "agentic").map((r) => r.skill))], ["agent-custody"]);

// --- api error: it does not break the run
const broken = await benchmark({ gw: { ...gwOf("openai"), baseUrl: "http://127.0.0.1:1/v1" }, tags: ["swap"], arms: ["none"] });
assert.ok(broken.results.every((r) => !r.pass && r.error), "the failure is recorded, it does not blow up");

// --- persistencia del json
const file = saveBenchmark(await benchmark({ gw: gwOf("openai"), tags: ["swap"], arms: ["core"] }), "/tmp/skill-lab-test");
assert.equal(JSON.parse(readFileSync(file, "utf8")).results.length, 2);
rmSync("/tmp/skill-lab-test", { recursive: true, force: true });

// --- api
const before = store.list();
const srv = api.listen(0);
const base = `http://127.0.0.1:${(srv.address() as any).port}`;
const post = await fetch(`${base}/gateways`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ ...gwOf("openai"), id: undefined, label: "__test__" }),
});
assert.equal(post.status, 201);
const gw = await post.json();
assert.equal(gw.apiKey, "***", "the api key must not leave over HTTP");
assert.equal(store.get(gw.id)!.apiKey, "k", "but it is stored");

assert.equal((await fetch(`${base}/gateways`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status, 400);
const badArm = await fetch(`${base}/benchmarks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ gateway: gw.id, arms: ["nope"] }) });
assert.equal(badArm.status, 400);

const run = await fetch(`${base}/benchmarks`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ gateway: "__test__", skills: ["outlayer"], tags: ["swap"], arms: ["core"] }),
}).then((r) => r.json());
assert.equal(run.results.length, 2);
assert.deepEqual(run.skills, ["outlayer"]);
assert.ok(run.file.startsWith("bench-results/outlayer-"));
rmSync(run.file, { force: true });

// --- streaming (lo que usa la UI): un evento por resultado y un done con el archivo
const sse = await fetch(`${base}/benchmarks`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ gateway: "__test__", skills: ["agent-custody", "outlayer"], tags: ["swap"], arms: ["core"], stream: true }),
}).then((r) => r.text());
const events = sse.split("\n\n").filter(Boolean);
assert.equal(events.filter((e) => !e.includes("event: done")).length, 4, "2 casos x 2 skills");
const done = JSON.parse(events.at(-1)!.split("data: ")[1]);
assert.ok(done.file.startsWith("bench-results/agent-custody+outlayer-"), done.file);
const saved = JSON.parse(readFileSync(done.file, "utf8"));
assert.deepEqual(saved.skills.sort(), ["agent-custody", "outlayer"]);
assert.equal(saved.suite, "outlayer");
rmSync(done.file, { force: true });

// --- revisión manual: el veredicto humano pisa la regex y queda en el json
const kept = saveBenchmark(await benchmark({ gw: gwOf("openai"), tags: ["swap"], arms: ["core"] }));  // en bench-results, que es donde mira la api
const name = kept.split("/").pop()!;
const patch = (body: unknown) => fetch(`${base}/benchmarks/${name}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
assert.equal((await patch({ index: 0, verdict: false })).status, 200);
assert.equal(JSON.parse(readFileSync(kept, "utf8")).results[0].verdict, false, "queda guardado");
await patch({ index: 0, verdict: null });
assert.ok(!("verdict" in JSON.parse(readFileSync(kept, "utf8")).results[0]), "null lo saca y vuelve a mandar la regex");
assert.equal((await patch({ index: 99, verdict: true })).status, 404);
assert.equal((await fetch(`${base}/benchmarks/nope.json`, { method: "PATCH" })).status, 404);
rmSync(kept, { force: true });

const suiteRes = await fetch(`${base}/suites/outlayer?tag=swap`).then((r) => r.json());
assert.equal(suiteRes.cases.length, 2, "the api filters the battery by tag");
assert.equal((await fetch(`${base}/suites/nope`)).status, 404);

assert.equal((await fetch(`${base}/gateways/${gw.id}`, { method: "DELETE" })).status, 204);
assert.deepEqual(store.list(), before, "the store is left as it was");

srv.close(); fake.close();
console.log("ok");
