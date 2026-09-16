#!/usr/bin/env node
// CLI layer: talks to the domain directly (store + runner), no HTTP in between.
import { parseArgs } from "node:util";
import { PRESETS } from "./src/gateway.ts";
import { ARMS, listSkills, loadSkill, routedOk } from "./src/skills.ts";
import { DEFAULT_ARMS, benchmark, listSuites, loadSuite, saveBenchmark, type Arm, type BenchmarkData, type ResultItem } from "./src/runner.ts";
import * as store from "./src/store.ts";

const HELP = `skill-lab
  ls                              list the gateways
  add <${Object.keys(PRESETS).join("|")}> --key K [--label L] [--model M] [--url U] [--in 0.0000001 --out 0.0000005]
  rm  <id|label>
  skills                          skills available to test
  suites                          case batteries available
  cases [--suite S] [--tag core]
  flows [--suite S]               multi-turn conversations (each step feeds the next)
  bench <id|label> [--skill a,b] [--suite S] [--mode cases|flows] [--tag trap,swap]
                   [--arm ${ARMS.join(",")}] [--runs 3] [--conc 4] [--json]`;

const { values: o, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    key: { type: "string" }, label: { type: "string" }, model: { type: "string" }, url: { type: "string" },
    in: { type: "string" }, out: { type: "string" },
    tag: { type: "string" }, arm: { type: "string" }, runs: { type: "string" }, conc: { type: "string" },
    skill: { type: "string" }, suite: { type: "string" }, mode: { type: "string" }, json: { type: "boolean" },
  },
});
const [cmd, arg] = positionals;
const csv = (s?: string) => (s ? s.split(",").filter(Boolean) : undefined);

function die(msg: string): never { console.error(msg); process.exit(1); }
const find = (q: string) => store.list().find((g) => g.id === q || g.label === q) ?? die(`unknown gateway: ${q}`);

switch (cmd) {
  case "ls":
    console.table(store.list().map(store.redact));
    break;

  case "add": {
    const preset = PRESETS[arg];
    if (!preset) die(`invalid preset: ${arg}\n${HELP}`);
    if (!o.key) die("missing --key");
    const gw = store.upsert({
      ...preset, label: o.label ?? arg, apiKey: o.key,
      ...(o.model && { model: o.model }), ...(o.url && { baseUrl: o.url }),
      ...(o.in && { pricing: { in: Number(o.in), out: Number(o.out ?? o.in) } }),
    });
    console.log(`${gw.label} → ${gw.id}`);
    break;
  }

  case "rm":
    console.log(store.remove(find(arg).id) ? "deleted" : "was not there");
    break;

  case "skills":
    console.table(listSkills());
    break;

  case "suites":
    console.table(listSuites().map((name) => {
      const s = loadSuite(name);
      return { name, cases: s.cases.length, flows: s.flows.length, preamble: s.preamble.slice(0, 60) };
    }));
    break;

  case "flows":
    console.table(loadSuite(o.suite).flows.map((c) => ({ name: c.name, tag: c.tag, steps: c.steps.length })));
    break;

  case "cases":
    console.table(loadSuite(o.suite).cases.filter((c) => !o.tag || csv(o.tag)!.includes(c.tag)));
    break;

  case "bench": {
    const gw = find(arg);
    const arms = (csv(o.arm) ?? DEFAULT_ARMS) as Arm[];
    const bad = arms.filter((a) => !ARMS.includes(a));
    if (bad.length) die(`invalid arms: ${bad}. use ${ARMS.join(",")}`);

    const tags = csv(o.tag);
    const flows = o.mode === "flows";
    const suite = loadSuite(o.suite);
    const units: any[] = flows ? suite.flows : suite.cases;
    const picked = units.filter((u) => !tags || tags.includes(u.tag));
    // in flows each conversation is N answers, one per step
    const answers = flows ? picked.reduce((a, c: any) => a + c.steps.length, 0) : picked.length;
    const runs = Number(o.runs ?? 1);
    const skills = csv(o.skill) ?? [listSkills()[0].name];
    // with no references/ the runner drops routed and agentic; the counter drops them too
    const cells = skills.reduce((n, name) => {
      const refs = listSkills().find((s) => s.name === name)?.refs.length ?? loadSkill(name).refs.length;
      return n + arms.filter((a) => refs || (a !== "routed" && a !== "agentic")).length;
    }, 0);
    const total = answers * cells * runs;
    let done = 0;

    const data = await benchmark(
      { gw, skills, suite: suite.name, mode: flows ? "flows" : "cases", arms, tags, runs, concurrency: Number(o.conc ?? 4) },
      () => process.stderr.write(`\r${++done}/${total} `),
    );
    process.stderr.write("\r");

    const file = saveBenchmark(data);
    if (o.json) { console.log(JSON.stringify(data, null, 2)); break; }

    report(data, picked.length, runs, gw.label);
    console.log(`\ntotal $${data.results.reduce((a, r) => a + r.cost, 0).toFixed(4)}`);
    console.log(`details: ${file}`);
    if (data.results.some((r) => !r.pass)) process.exit(1);
    break;
  }

  default:
    console.log(HELP);
}

function report({ results, arms, skills, suite, model }: BenchmarkData, nCases: number, runs: number, label: string) {
  const unit = results.some((r) => r.conversation) ? "conversations" : "cases";
  const avg = (nums: number[]) => Math.round(nums.reduce((a, n) => a + n, 0) / (nums.length || 1));
  console.log(`\nskills ${skills.join(" vs ")}   suite ${suite}   ${label} · ${model}   ${nCases} ${unit} x ${runs} run(s)   arms: ${arms.join(",")}\n`);

  // One row per skill x arm: how much it got right, how much it spent, whether it routed well.
  const cells = skills.flatMap((s) => arms.map((a) => [s, a] as const));
  const byArm: Record<string, object> = {};
  for (const [sk, arm] of cells) {
    const rows = results.filter((r) => r.arm === arm && r.skill === sk);
    if (!rows.length) continue;
    const routing = rows.map((r) => routedOk(r.ref, r.asked)).filter((v) => v !== null);
    byArm[skills.length > 1 ? `${sk} · ${arm}` : arm] = {
      pass: `${rows.filter((r) => r.pass).length}/${rows.length}`,
      "tok in": avg(rows.map((r) => r.inTok)),
      "tok out": avg(rows.map((r) => r.outTok)),
      routing: arm === "agentic" && routing.length ? `${routing.filter(Boolean).length}/${routing.length}` : "-",
      cost: "$" + rows.reduce((a, r) => a + r.cost, 0).toFixed(4),
    };
  }
  console.table(byArm);

  // One row per tag (or per step, in conversations), one column per arm:
  // where each strategy breaks.
  const key = (r: ResultItem) => (r.conversation ? `${r.step}. ${r.prompt.slice(0, 44)}` : r.tag);
  const byRow: Record<string, Record<string, string>> = {};
  for (const k of new Set(results.map(key))) {
    byRow[k] = {};
    for (const [sk, arm] of cells) {
      const rows = results.filter((r) => r.arm === arm && r.skill === sk && key(r) === k);
      if (rows.length) byRow[k][skills.length > 1 ? `${sk} · ${arm}` : arm] = `${rows.filter((r) => r.pass).length}/${rows.length}`;
    }
  }
  console.table(byRow);

  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    console.log("failures:");
    for (const f of failures)
      console.log(`  [${skills.length > 1 ? `${f.skill} ${f.arm}` : f.arm}]${f.step ? ` step ${f.step}` : ""} ${f.prompt.slice(0, 62)}${f.error ? `\n      ERROR ${f.error}` : f.asked ? `  (asked ${f.asked})` : ""}`);
  }
}
