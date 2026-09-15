// node test.ts — fake gateway in both dialects; checks arms, tool-calling,
// the shape of BenchmarkData and the api. Never touches the network.
import assert from "node:assert";
import { createServer } from "node:http";
import { rmSync, readFileSync } from "node:fs";
import { api } from "./src/api.ts";
import { benchmark, loadCases, loadConversations, saveBenchmark } from "./src/runner.ts";
import { loadSkill, systemPrompt, routedOk } from "./src/skills.ts";
import * as store from "./src/store.ts";

// --- casos y skills
const cases = loadCases();
assert.equal(cases.length, 40, `casos parseados: ${cases.length}`);
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
  const data = await benchmark({ gw: gwOf(kind), skill: "agent-custody", tags: ["swap"], arms: ["core", "routed", "agentic"], runs: 2 });
  assert.equal(data.skill, "agent-custody");
  assert.deepEqual(data.arms, ["core", "routed", "agentic"]);
  assert.equal(data.runs, 2);
  assert.deepEqual(data.pricing, { in: 2, out: 3 });
  assert.equal(data.results.length, 2 * 3 * 2, `${kind}: 2 casos x 3 arms x 2 runs`);

  for (const r of data.results) {
    assert.deepEqual(Object.keys(r).sort(), ["arm", "asked", "cost", "i", "inTok", "outTok", "pass", "prompt", "ref", "tag", "text"].sort(), `${kind}: ResultItem shape`);
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
const flow = await benchmark({ gw: gwOf("openai"), suite: "flows", arms: ["core"] });
const steps = loadConversations()[0].steps.length;
assert.equal(flow.results.length, steps, "one answer per step");
assert.ok(flow.results.every((r) => r.conversation === "wrap-swap-withdraw"));
assert.deepEqual(flow.results.map((r) => r.step), [...Array(steps).keys()].map((n) => n + 1));
// the fake returns how many messages it received: it must grow by 2 per step (user + assistant)
const msgs = flow.results.map((r) => Number(r.text.match(/msgs:(\d+)/)![1]));
assert.deepEqual(msgs, msgs.map((_, n) => 1 + n * 2), `historia acumulada: ${msgs}`);

// --- a skill with no references/: routed and agentic drop themselves
const solo = await benchmark({ gw: gwOf("openai"), skill: "outlayer", tags: ["swap"], arms: ["none", "full", "core", "routed", "agentic"] });
assert.equal(solo.skill, "outlayer");
assert.deepEqual([...new Set(solo.results.map((r) => r.arm))].sort(), ["core", "full", "none"]);

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
  body: JSON.stringify({ gateway: "__test__", skill: "outlayer", tags: ["swap"], arms: ["core"] }),
}).then((r) => r.json());
assert.equal(run.results.length, 2);
assert.equal(run.skill, "outlayer");
assert.ok(run.file.startsWith("bench-results/outlayer-"));
rmSync(run.file, { force: true });

assert.equal((await fetch(`${base}/gateways/${gw.id}`, { method: "DELETE" })).status, 204);
assert.deepEqual(store.list(), before, "the store is left as it was");

srv.close(); fake.close();
console.log("ok");
