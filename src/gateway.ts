// Provider layer: one neutral conversation, two dialects (OpenAI / Anthropic).
// The rest of the code doesn't know which one is talking.

export type Gateway = {
  id: string;
  label: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  model: string;
  apiKey: string;
  /** $ per token. If missing, we try to read it from {baseUrl}/models. */
  pricing?: Pricing;
};

export type Pricing = { in: number; out: number };
export type ToolCall = { id: string; name: string; args: any };
export type Turn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls: ToolCall[] }
  | { role: "tool"; id: string; name: string; content: string };
export type Tool = { name: string; description: string; params: object };
export type Reply = { text: string; toolCalls: ToolCall[]; usage: { in: number; out: number } };

export const PRESETS: Record<string, Pick<Gateway, "kind" | "baseUrl" | "model">> = {
  nearai: { kind: "openai", baseUrl: "https://cloud-api.near.ai/v1", model: "deepseek-ai/DeepSeek-V3.1" },
  openai: { kind: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  minimax: { kind: "openai", baseUrl: "https://api.minimax.io/v1", model: "MiniMax-M2" },
  claude: { kind: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5" },
};

// gpt-5* models reject temperature: 0. As soon as one complains, we stop sending it.
const noTemperature = new Set<string>();

export async function chat(gw: Gateway, system: string, turns: Turn[], tools?: Tool[]): Promise<Reply> {
  const anthropic = gw.kind === "anthropic";
  const url = anthropic ? `${gw.baseUrl}/v1/messages` : `${gw.baseUrl}/chat/completions`;
  const headers = anthropic
    ? { "content-type": "application/json", "x-api-key": gw.apiKey, "anthropic-version": "2023-06-01" }
    : { "content-type": "application/json", authorization: `Bearer ${gw.apiKey}` };

  for (let attempt = 1; attempt <= 3; attempt++) {
    const temperature = noTemperature.has(gw.model) ? {} : { temperature: 0 };
    const body = anthropic
      ? { model: gw.model, max_tokens: 2048, system, messages: toAnthropic(turns), ...(tools && { tools: tools.map(anthropicTool) }), ...temperature }
      : { model: gw.model, messages: [{ role: "system", content: system }, ...toOpenAI(turns)], ...(tools && { tools: tools.map(openaiTool) }), ...temperature };

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

    // rate limit o error del provider: esperamos y reintentamos
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }

    const json = await res.json().catch(() => ({ error: { message: `${res.status} non-json response` } }));
    if (!json.error) return anthropic ? fromAnthropic(json) : fromOpenAI(json);

    // Several workers can hit this at once; the retry is per call.
    if (/temperature/i.test(json.error.message) && !noTemperature.has(gw.model)) {
      noTemperature.add(gw.model);
      continue;
    }
    throw new Error(json.error.message ?? JSON.stringify(json.error));
  }
  throw new Error("the api did not respond after 3 attempts");
}

/** $ per token. If the gateway doesn't provide it, look it up in {baseUrl}/models (near.ai, openrouter). */
const priceCache = new Map<string, Promise<Pricing>>();

export function pricingOf(gw: Gateway): Promise<Pricing> {
  if (gw.pricing) return Promise.resolve(gw.pricing);
  const key = `${gw.baseUrl}|${gw.model}`;
  if (!priceCache.has(key)) priceCache.set(key, fetchPricing(gw));
  return priceCache.get(key)!;
}

async function fetchPricing(gw: Gateway): Promise<Pricing> {
  try {
    const { data } = await fetch(`${gw.baseUrl}/models`, { headers: { authorization: `Bearer ${gw.apiKey}` } }).then((r) => r.json());
    const m = data?.find((m: any) => m.id === gw.model);
    if (m?.pricing) return { in: Number(m.pricing.prompt), out: Number(m.pricing.completion) };
  } catch {}
  return { in: 0, out: 0 }; // ponytail: with no price, cost stays 0 and the rest of the bench still works.
}

// ---- dialecto openai ----

const openaiTool = (t: Tool) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.params } });

const toOpenAI = (turns: Turn[]) =>
  turns.map((t) =>
    t.role === "assistant"
      ? { role: "assistant", content: t.content, ...(t.toolCalls.length && { tool_calls: t.toolCalls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.args) } })) }) }
      : t.role === "tool"
        ? { role: "tool", tool_call_id: t.id, content: t.content }
        : { role: "user", content: t.content },
  );

function fromOpenAI(json: any): Reply {
  const m = json.choices?.[0]?.message ?? {};
  return {
    text: m.content ?? "",
    toolCalls: (m.tool_calls ?? []).map((c: any) => ({ id: c.id, name: c.function.name, args: parse(c.function.arguments) })),
    usage: { in: json.usage?.prompt_tokens ?? 0, out: json.usage?.completion_tokens ?? 0 },
  };
}

// ---- dialecto anthropic ----

const anthropicTool = (t: Tool) => ({ name: t.name, description: t.description, input_schema: t.params });

/** Anthropic tool_results go in as user messages, and consecutive ones get grouped. */
function toAnthropic(turns: Turn[]) {
  const out: any[] = [];
  for (const t of turns) {
    if (t.role === "user") out.push({ role: "user", content: t.content });
    else if (t.role === "assistant")
      out.push({ role: "assistant", content: [...(t.content ? [{ type: "text", text: t.content }] : []), ...t.toolCalls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.args }))] });
    else {
      const block = { type: "tool_result", tool_use_id: t.id, content: t.content };
      const last = out.at(-1);
      if (last?.role === "user" && Array.isArray(last.content)) last.content.push(block);
      else out.push({ role: "user", content: [block] });
    }
  }
  return out;
}

function fromAnthropic(json: any): Reply {
  const blocks = json.content ?? [];
  return {
    text: blocks.filter((b: any) => b.type === "text").map((b: any) => b.text).join(""),
    toolCalls: blocks.filter((b: any) => b.type === "tool_use").map((b: any) => ({ id: b.id, name: b.name, args: b.input })),
    usage: { in: json.usage?.input_tokens ?? 0, out: json.usage?.output_tokens ?? 0 },
  };
}

const parse = (s: string) => { try { return JSON.parse(s); } catch { return {}; } };
