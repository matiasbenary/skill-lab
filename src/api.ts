// HTTP layer: only translates request <-> domain. No logic here.
import express from "express";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PRESETS, pricingOf } from "./gateway.ts";
import { ARMS, listSkills } from "./skills.ts";
import { bench, benchmark, loadCases, loadConversations, saveBenchmark, type Arm } from "./runner.ts";
import * as store from "./store.ts";

const RESULTS_DIR = "bench-results";

export const api = express();
api.use(express.json());

api.get("/presets", (_req, res) => res.json(PRESETS));
api.get("/arms", (_req, res) => res.json(ARMS));
api.get("/skills", (_req, res) => res.json(listSkills()));
api.get("/cases", (req, res) => res.json(loadCases().filter((c) => !req.query.tag || c.tag === req.query.tag)));
api.get("/conversations", (_req, res) => res.json(loadConversations()));

api.get("/gateways", (_req, res) => res.json(store.list().map(store.redact)));

/** Create and edit: with an id it edits, and whatever is missing (typically the redacted apiKey) is inherited. */
api.post("/gateways", (req, res) => {
  const body = req.body ?? {};
  const prev = body.id ? store.get(body.id) : undefined;
  if (body.id && !prev) return res.status(404).json({ error: "unknown gateway" });
  const gw = { ...prev, ...body, apiKey: body.apiKey && body.apiKey !== "***" ? body.apiKey : prev?.apiKey };
  if (!gw.label || !gw.baseUrl || !gw.model || !gw.apiKey) return res.status(400).json({ error: "missing label, baseUrl, model or apiKey" });
  if (gw.kind !== "openai" && gw.kind !== "anthropic") return res.status(400).json({ error: "kind: openai | anthropic" });
  res.status(prev ? 200 : 201).json(store.redact(store.upsert(gw)));
});

api.delete("/gateways/:id", (req, res) =>
  store.remove(req.params.id) ? res.status(204).end() : res.status(404).json({ error: "unknown gateway" }));

/** Runs the suite against ONE skill. { gateway, skill?, suite?, arms?, tags?, runs?, stream? } */
api.post("/benchmarks", async (req, res) => {
  const { gateway, skill, suite, arms, tags, runs, concurrency, stream } = req.body ?? {};
  const gw = store.get(gateway) ?? store.list().find((g) => g.label === gateway);
  if (!gw) return res.status(404).json({ error: "unknown gateway" });
  const bad = (arms ?? []).filter((a: string) => !ARMS.includes(a as Arm));
  if (bad.length) return res.status(400).json({ error: `invalid arms: ${bad}. use ${ARMS.join(",")}` });

  const opts = { gw, skill, suite, arms, tags, runs, concurrency };

  if (!stream) {
    const data = await benchmark(opts);
    return res.json({ ...data, file: saveBenchmark(data, RESULTS_DIR) });
  }

  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const results: any[] = [];
  for await (const r of bench(opts)) { results.push(r); res.write(`data: ${JSON.stringify(r)}\n\n`); }
  const data = { skill: skill ?? "agent-custody", model: gw.model, runs: runs ?? 1, arms: [...new Set(results.map((r) => r.arm))], pricing: await pricingOf(gw), results };
  res.end(`event: done\ndata: ${JSON.stringify({ file: saveBenchmark(data, RESULTS_DIR) })}\n\n`);
});

api.get("/benchmarks", (_req, res) =>
  res.json(existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json")).sort().reverse() : []));

api.get("/benchmarks/:file", (req, res) => {
  const file = join(RESULTS_DIR, req.params.file);
  if (!req.params.file.endsWith(".json") || req.params.file.includes("/") || !existsSync(file))
    return res.status(404).json({ error: "not found" });
  res.type("json").send(readFileSync(file, "utf8"));
});

// ponytail: errores como JSON, si no el handler HTML de express llega al fetch() como "<!DOCTYPE..." y tapa el motivo real
api.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: err.message });
});
