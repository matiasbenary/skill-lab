// Domain layer: runs every case on every arm and returns the BenchmarkData.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { chat, pricingOf, type Gateway, type Pricing, type Tool, type Turn } from "./gateway.ts";
import { loadSkill, readRef, readReferenceTool, systemPrompt, type Arm, type Skill } from "./skills.ts";

export const DEFAULT_ARMS: Arm[] = ["none", "full", "core", "agentic"];

export type Case = { tag: string; prompt: string; expect: string; ref: string };

/** A conversation: each step sees the answers of the previous ones. */
export type Conversation = { name: string; tag: string; steps: Case[] };

export type ResultItem = {
  tag: string; prompt: string; ref: string;
  arm: Arm; i: number;
  pass: boolean; inTok: number; outTok: number; cost: number;
  asked: string | null; text: string;
  /** Everything that was sent and answered for this step, system prompt included. */
  history: Turn[]; system: string;
  error?: string;
  conversation?: string; // only in the conversations suite
  step?: number;
};

export type BenchmarkData = {
  skill: string;
  model: string;
  runs: number;
  arms: string[];
  pricing: Pricing;
  results: ResultItem[];
};

export type BenchOptions = {
  gw: Gateway;
  skill?: string; // dir del skill a probar (default: agent-custody)
  suite?: "cases" | "flows"; // casos sueltos (default) o charlas multi-turno
  tags?: string[];
  arms?: Arm[];
  runs?: number;
  concurrency?: number;
};

const MAX_TOOL_ROUNDS = 6;

export function loadCases(path: string | URL = new URL("../cases.json", import.meta.url)): Case[] {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function loadConversations(path: string | URL = new URL("../conversations.json", import.meta.url)): Conversation[] {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** One turn: ask, and keep handing over references while the model keeps asking for them. */
async function askStep(gw: Gateway, system: string, turns: Turn[], skill: Skill, tools?: Tool[]) {
  let inTok = 0, outTok = 0;
  let asked: string | null = null; // the first reference it asked for (agentic arm only)

  let reply = await chat(gw, system, turns, tools);
  inTok += reply.usage.in; outTok += reply.usage.out;

  // ponytail: tope fijo de vueltas, alcanza para un skill con pocas refs; subilo si algún flow lo toca
  for (let round = 0; reply.toolCalls.length && round < MAX_TOOL_ROUNDS; round++) {
    turns.push({ role: "assistant", content: reply.text, toolCalls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      const file = call.args?.file;
      asked ??= file ?? null;
      turns.push({ role: "tool", id: call.id, name: call.name, content: skill.refs.includes(file) ? readRef(skill, file) : `no such reference: ${file}` });
    }
    reply = await chat(gw, system, turns, tools);
    inTok += reply.usage.in; outTok += reply.usage.out;
  }
  turns.push({ role: "assistant", content: reply.text, toolCalls: [] });
  return { text: reply.text, inTok, outTok, asked, history: structuredClone(turns) };
}

const score = (c: Case, text: string, inTok: number, outTok: number, pricing: Pricing) => ({
  pass: new RegExp(c.expect, "i").test(text),
  inTok, outTok, cost: inTok * pricing.in + outTok * pricing.out, text,
});

async function runCase(gw: Gateway, arm: Arm, c: Case, i: number, skill: Skill, pricing: Pricing): Promise<ResultItem[]> {
  const head = { tag: c.tag, prompt: c.prompt, ref: c.ref, arm, i };
  const tools = arm === "agentic" ? [readReferenceTool(skill.refs)] : undefined;
  try {
    const system = systemPrompt(arm, skill, c.ref);
    const turns: Turn[] = [{ role: "user", content: c.prompt }];
    const { text, inTok, outTok, asked, history } = await askStep(gw, system, turns, skill, tools);
    return [{ ...head, ...score(c, text, inTok, outTok, pricing), asked, history, system }];
  } catch (e: any) {
    return [{ ...head, pass: false, inTok: 0, outTok: 0, cost: 0, asked: null, text: "", history: [{ role: "user", content: c.prompt }], system: "", error: String(e.message ?? e) }];
  }
}

/**
 * A full conversation: turns carry over, so each step sees what the model
 * answered in the previous ones. A step that blows up ends the conversation.
 */
async function runConversation(gw: Gateway, arm: Arm, convo: Conversation, i: number, skill: Skill, pricing: Pricing): Promise<ResultItem[]> {
  const tools = arm === "agentic" ? [readReferenceTool(skill.refs)] : undefined;
  const turns: Turn[] = [];
  const out: ResultItem[] = [];

  for (const [n, step] of convo.steps.entries()) {
    const head = { tag: convo.tag, prompt: step.prompt, ref: step.ref, arm, i, conversation: convo.name, step: n + 1 };
    const system = systemPrompt(arm, skill, step.ref);
    turns.push({ role: "user", content: step.prompt });
    try {
      const { text, inTok, outTok, asked, history } = await askStep(gw, system, turns, skill, tools);
      out.push({ ...head, ...score(step, text, inTok, outTok, pricing), asked, history, system });
    } catch (e: any) {
      out.push({ ...head, pass: false, inTok: 0, outTok: 0, cost: 0, asked: null, text: "", history: structuredClone(turns), system, error: String(e.message ?? e) });
      break;
    }
  }
  return out;
}

/** Emits each ResultItem as soon as it finishes. */
export async function* bench(o: BenchOptions): AsyncGenerator<ResultItem> {
  const skill = loadSkill(o.skill ?? "agent-custody");
  // With no references/ there is nothing to route: those arms don't apply.
  const arms = (o.arms ?? DEFAULT_ARMS).filter((a) => skill.refs.length || (a !== "routed" && a !== "agentic"));
  const runs = o.runs ?? 1;
  const pricing = await pricingOf(o.gw);

  const units = o.suite === "flows" ? loadConversations() : loadCases();
  const queue: (() => Promise<ResultItem[]>)[] = [];
  for (const unit of units.filter((u) => !o.tags?.length || o.tags.includes(u.tag)))
    for (const arm of arms)
      for (let i = 0; i < runs; i++)
        queue.push(() =>
          "steps" in unit
            ? runConversation(o.gw, arm, unit, i, skill, pricing)
            : runCase(o.gw, arm, unit, i, skill, pricing));

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
  return {
    skill: loadSkill(o.skill ?? "agent-custody").name,
    model: o.gw.model,
    runs: o.runs ?? 1,
    arms: [...new Set(results.map((r) => r.arm))],
    pricing: await pricingOf(o.gw),
    results,
  };
}

/** Saves the BenchmarkData and returns the path. */
export function saveBenchmark(data: BenchmarkData, dir = "bench-results"): string {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${data.skill}-${data.model.replace(/[^\w.-]/g, "_")}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}
