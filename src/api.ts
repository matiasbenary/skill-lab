// HTTP layer: only translates request <-> domain. No logic here.
import express from "express";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PRESETS } from "./gateway.ts";
import { ARMS, listSkills } from "./skills.ts";
import { bench, benchmark, listSuites, loadSuite, meta, saveBenchmark, type Arm } from "./runner.ts";
import * as store from "./store.ts";

const RESULTS_DIR = "bench-results";

export const api = express();
api.use(express.json());

api.get("/presets", (_req, res) => res.json(PRESETS));
api.get("/arms", (_req, res) => res.json(ARMS));
api.get("/skills", (_req, res) => res.json(listSkills()));
api.get("/suites", (_req, res) => res.json(listSuites()));
/** The whole battery: preamble, cases and flows. ?tag= filters the cases. */
api.get("/suites/:name", (req, res) => {
  try {
    const suite = loadSuite(req.params.name);
    res.json({ ...suite, cases: suite.cases.filter((c) => !req.query.tag || c.tag === req.query.tag) });
  } catch (e: any) {
    res.status(404).json({ error: String(e.message ?? e) });
  }
});

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

/** Runs one suite against one or more skills. { gateway, skills?, suite?, mode?, arms?, tags?, runs?, stream? } */
api.post("/benchmarks", async (req, res) => {
  const { gateway, skills, suite, mode, arms, tags, runs, concurrency, stream } = req.body ?? {};
  const gw = store.get(gateway) ?? store.list().find((g) => g.label === gateway);
  if (!gw) return res.status(404).json({ error: "unknown gateway" });
  const bad = (arms ?? []).filter((a: string) => !ARMS.includes(a as Arm));
  if (bad.length) return res.status(400).json({ error: `invalid arms: ${bad}. use ${ARMS.join(",")}` });

  const opts = { gw, skills, suite, mode, arms, tags, runs, concurrency };

  if (!stream) {
    const data = await benchmark(opts);
    return res.json({ ...data, file: saveBenchmark(data, RESULTS_DIR) });
  }

  res.set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  const results: any[] = [];
  for await (const r of bench(opts)) { results.push(r); res.write(`data: ${JSON.stringify(r)}\n\n`); }
  const data = { ...(await meta(opts, results)), results };
  res.end(`event: done\ndata: ${JSON.stringify({ file: saveBenchmark(data, RESULTS_DIR) })}\n\n`);
});

api.get("/benchmarks", (_req, res) =>
  res.json(existsSync(RESULTS_DIR) ? readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json")).sort().reverse() : []));

/** A saved run, by name. Refuses anything that is not a json right in the results dir. */
function resultsFile(name: string): string | null {
  const file = join(RESULTS_DIR, name);
  return name.endsWith(".json") && !name.includes("/") && existsSync(file) ? file : null;
}

api.get("/benchmarks/:file", (req, res) => {
  const file = resultsFile(req.params.file);
  if (!file) return res.status(404).json({ error: "not found" });
  res.type("json").send(readFileSync(file, "utf8"));
});

/**
 * Manual review: a human overrides the regex on one answer. { index, verdict }
 * with verdict true, false, or null to go back to whatever the regex said.
 */
api.patch("/benchmarks/:file", (req, res) => {
  const file = resultsFile(req.params.file);
  if (!file) return res.status(404).json({ error: "not found" });
  const { index, verdict } = req.body ?? {};
  const data = JSON.parse(readFileSync(file, "utf8"));
  const item = data.results?.[index];
  if (!item) return res.status(404).json({ error: `no result ${index}` });
  if (verdict === null || verdict === undefined) delete item.verdict;
  else item.verdict = Boolean(verdict);
  writeFileSync(file, JSON.stringify(data, null, 2));
  res.json({ index, verdict: item.verdict ?? null });
});

// ponytail: errores como JSON, si no el handler HTML de express llega al fetch() como "<!DOCTYPE..." y tapa el motivo real
api.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: err.message });
});
