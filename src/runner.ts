// Domain layer: runs every case on every arm and returns the BenchmarkData.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { chat, pricingOf, type Gateway, type Pricing, type Tool, type Turn } from "./gateway.ts";
import { PREAMBLE, listSkills, loadSkill, loadSkillTool, readRef, readReferenceTool, systemPrompt, type Arm, type Skill } from "./skills.ts";

export const DEFAULT_ARMS: Arm[] = ["none", "full", "core", "agentic"];

/** expect: one regex, or several that all have to match (so a failure names the missing one). */
export type Case = { tag: string; prompt: string; expect: string | string[]; ref: string };

/** A conversation: each step sees the answers of the previous ones. */
export type Conversation = { name: string; tag: string; steps: Case[] };

export type ResultItem = {
  skill: string;
  tag: string; prompt: string; ref: string; expect: string | string[];
  arm: Arm; i: number;
  pass: boolean; inTok: number; outTok: number; cost: number;
  /** First reference the model asked for; the whole list of the ones it opened. */
  asked: string | null; read: string[]; text: string;
  /** discovery arm: did it call load_skill, i.e. did the body ever reach context? */
  loaded: boolean;
  /** Manual review: overrides `pass` when a human looked at the answer. */
  verdict?: boolean;
  /** Everything that was sent and answered for this step, system prompt included. */
  history: Turn[]; system: string;
  error?: string;
  conversation?: string; // only in the conversations suite
  step?: number;
};

export type BenchmarkData = {
  skills: string[];
  suite: string;
  model: string;
  runs: number;
  arms: string[];
  pricing: Pricing;
  results: ResultItem[];
};

export type BenchOptions = {
  gw: Gateway;
  skills?: string[]; // uno o varios skills: el mismo suite corre contra todos
  suite?: string; // qué batería (directorio de suites/), default: la primera
  mode?: "cases" | "flows"; // casos sueltos (default) o charlas multi-turno
  tags?: string[];
  arms?: Arm[];
  runs?: number;
  concurrency?: number;
};

const MAX_TOOL_ROUNDS = 6;

/** What the model can call in each arm. discovery gets a real harness's pair: find the skill, then read its files. */
// discovery starts with load_skill alone: the paths under references/ only exist
// in the SKILL.md body, so until it loads it the model cannot know what to read.
const armTools = (arm: Arm, skill: Skill): Tool[] | undefined =>
  arm === "agentic" ? [readReferenceTool()]
  : arm === "discovery" ? [loadSkillTool(skill)]
  : undefined;

/**
 * A suite is a battery of cases, not a property of a skill: it lives in its own
 * directory so the same battery can be run against several candidate skills.
 *   suites/<name>/cases.json  flows.json  preamble.txt
 */
export type Suite = { name: string; preamble: string; cases: Case[]; flows: Conversation[] };

const SUITES_DIR = process.env.SUITES_DIR ?? decodeURIComponent(new URL("../suites", import.meta.url).pathname);
const readJson = (dir: string, file: string) =>
  existsSync(join(dir, file)) ? JSON.parse(readFileSync(join(dir, file), "utf8")) : [];

export const listSuites = (): string[] =>
  readdirSync(SUITES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(SUITES_DIR, d.name, "cases.json")))
    .map((d) => d.name)
    .sort();

export function loadSuite(name?: string): Suite {
  const picked = name ?? listSuites()[0];
  if (!picked) throw new Error(`no suites in ${SUITES_DIR}`);
  const dir = join(SUITES_DIR, picked);
  if (!existsSync(dir)) throw new Error(`unknown suite: ${picked}`);
  const file = join(dir, "preamble.txt");
  return {
    name: picked,
    preamble: existsSync(file) ? readFileSync(file, "utf8").trim() : PREAMBLE,
    cases: readJson(dir, "cases.json"),
    flows: readJson(dir, "flows.json"),
  };
}

/** One turn: ask, and keep handing over references while the model keeps asking for them. */
async function askStep(gw: Gateway, system: string, turns: Turn[], skill: Skill, tools?: Tool[]) {
  let inTok = 0, outTok = 0;
  let asked: string | null = null; // the first reference it asked for (agentic arm only)
  const read: string[] = []; // every reference it actually opened, in order
  let loaded = false; // did it call load_skill (discovery arm only)

  let reply = await chat(gw, system, turns, tools);
  inTok += reply.usage.in; outTok += reply.usage.out;

  // ponytail: tope fijo de vueltas, alcanza para un skill con pocas refs; subilo si algún flow lo toca
  for (let round = 0; reply.toolCalls.length && round < MAX_TOOL_ROUNDS; round++) {
    turns.push({ role: "assistant", content: reply.text, toolCalls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      if (call.name === "load_skill") {
        loaded = true;
        // the body is in context now, so the references it names become readable
        if (skill.refs.length && !tools!.some((t) => t.name === "read_reference")) tools = [...tools!, readReferenceTool()];
        turns.push({ role: "tool", id: call.id, name: call.name, content: skill.text });
        continue;
      }
      // a real Read wants the path the SKILL.md printed: references/foo.md (./ tolerated, nothing else)
      const raw = String(call.args?.file ?? "").replace(/^\.\//, "");
      const file = raw.startsWith("references/") ? raw.slice("references/".length) : raw;
      const found = raw.startsWith("references/") && skill.refs.includes(file);
      asked ??= file || null;
      if (found) read.push(file);
      turns.push({ role: "tool", id: call.id, name: call.name, content: found ? readRef(skill, file) : `ENOENT: no such file ${raw}` });
    }
    reply = await chat(gw, system, turns, tools);
    inTok += reply.usage.in; outTok += reply.usage.out;
  }
  turns.push({ role: "assistant", content: reply.text, toolCalls: [] });
  return { text: reply.text, inTok, outTok, asked, read, loaded, tools, history: structuredClone(turns) };
}

export const expects = (e: string | string[]) => (Array.isArray(e) ? e : [e]);

const score = (c: Case, text: string, inTok: number, outTok: number, pricing: Pricing) => ({
  pass: expects(c.expect).every((e) => new RegExp(e, "i").test(text)),
  inTok, outTok, cost: inTok * pricing.in + outTok * pricing.out, text,
});

async function runCase(gw: Gateway, arm: Arm, c: Case, i: number, skill: Skill, pricing: Pricing, preamble: string): Promise<ResultItem[]> {
  const head = { skill: skill.name, tag: c.tag, prompt: c.prompt, ref: c.ref, expect: c.expect, arm, i };
  const tools = armTools(arm, skill);
  try {
    const system = systemPrompt(arm, skill, c.ref, preamble);
    const turns: Turn[] = [{ role: "user", content: c.prompt }];
    const { text, inTok, outTok, asked, read, loaded, history } = await askStep(gw, system, turns, skill, tools);
    return [{ ...head, ...score(c, text, inTok, outTok, pricing), asked, read, loaded, history, system }];
  } catch (e: any) {
    return [{ ...head, pass: false, inTok: 0, outTok: 0, cost: 0, asked: null, read: [], loaded: false, text: "", history: [{ role: "user", content: c.prompt }], system: "", error: String(e.message ?? e) }];
  }
}

/**
 * A full conversation: turns carry over, so each step sees what the model
 * answered in the previous ones. A step that blows up ends the conversation.
 */
async function runConversation(gw: Gateway, arm: Arm, convo: Conversation, i: number, skill: Skill, pricing: Pricing, preamble: string): Promise<ResultItem[]> {
  let tools = armTools(arm, skill);
  const turns: Turn[] = [];
  const out: ResultItem[] = [];
  let everLoaded = false; // once the body is loaded it stays in the history: later steps inherit it

  for (const [n, step] of convo.steps.entries()) {
    const head = { skill: skill.name, tag: convo.tag, prompt: step.prompt, ref: step.ref, expect: step.expect, arm, i, conversation: convo.name, step: n + 1 };
    const system = systemPrompt(arm, skill, step.ref, preamble);
    turns.push({ role: "user", content: step.prompt });
    try {
      const { text, inTok, outTok, asked, read, loaded, tools: next, history } = await askStep(gw, system, turns, skill, tools);
      tools = next; // read_reference unlocks for the rest of the conversation once load_skill lands
      everLoaded ||= loaded;
      out.push({ ...head, ...score(step, text, inTok, outTok, pricing), asked, read, loaded: everLoaded, history, system });
    } catch (e: any) {
      out.push({ ...head, pass: false, inTok: 0, outTok: 0, cost: 0, asked: null, read: [], loaded: everLoaded, text: "", history: structuredClone(turns), system, error: String(e.message ?? e) });
      break;
    }
  }
  return out;
}

/** Emits each ResultItem as soon as it finishes. */
export async function* bench(o: BenchOptions): AsyncGenerator<ResultItem> {
  const suite = loadSuite(o.suite);
  // a skill comes in as its name (the UI) or as a path (the CLI): both resolve
  const known = listSkills();
  const skills = (o.skills?.length ? o.skills : [known[0]?.name]).map((n) => loadSkill(known.find((k) => k.name === n)?.dir ?? n!));
  const runs = o.runs ?? 1;
  const pricing = await pricingOf(o.gw);

  const units = o.mode === "flows" ? suite.flows : suite.cases;
  const queue: (() => Promise<ResultItem[]>)[] = [];
  for (const unit of units.filter((u) => !o.tags?.length || o.tags.includes(u.tag)))
    for (const skill of skills)
      // With no references/ there is nothing to route: those arms don't apply to this skill.
      for (const arm of (o.arms ?? DEFAULT_ARMS).filter((a) => skill.refs.length || (a !== "routed" && a !== "agentic")))
        for (let i = 0; i < runs; i++)
          queue.push(() =>
            "steps" in unit
              ? runConversation(o.gw, arm, unit, i, skill, pricing, suite.preamble)
              : runCase(o.gw, arm, unit, i, skill, pricing, suite.preamble));

  const pending = new Set<Promise<ResultItem[]>>();
  const next = () => {
    const job = queue.shift();
    if (!job) return;
    const p = job().finally(() => pending.delete(p));
    pending.add(p);
  };
  while (pending.size < (o.concurrency ?? 4) && queue.length) next();
  while (pending.size) {
    yield* await Promise.race(pending);
    next();
  }
}

export async function benchmark(o: BenchOptions, onResult?: (r: ResultItem) => void): Promise<BenchmarkData> {
  const results: ResultItem[] = [];
  for await (const r of bench(o)) { results.push(r); onResult?.(r); }
  return { ...(await meta(o, results)), results };
}

/** The header of a run: what was tested, with what, at what price. */
export async function meta(o: BenchOptions, results: ResultItem[]): Promise<Omit<BenchmarkData, "results">> {
  return {
    skills: [...new Set(results.map((r) => r.skill))],
    suite: loadSuite(o.suite).name,
    model: o.gw.model,
    runs: o.runs ?? 1,
    arms: [...new Set(results.map((r) => r.arm))],
    pricing: await pricingOf(o.gw),
  };
}

/** Saves the BenchmarkData and returns the path. */
export function saveBenchmark(data: BenchmarkData, dir = "bench-results"): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${data.skills.join("+")}-${data.model.replace(/[^\w.-]/g, "_")}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
