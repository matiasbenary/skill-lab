# skill-lab

A bench for skills: runs the same battery of cases against one or more `SKILL.md`,
across six ways of putting the skill in context, and tells you which one passes,
what it costs and whether the model routed to the right reference.

Node 24 (type-stripping, no build step). One dependency: express.

## Arms

Each *arm* is a different system prompt built from the same skill:

| arm | what's in context | measures |
|---|---|---|
| `none` | nothing | what the model already knows |
| `full` | SKILL.md with every reference inlined | the monolith, and what it costs |
| `core` | SKILL.md only | is the core enough? |
| `routed` | core + the *right* reference | ceiling: perfect routing |
| `agentic` | core + a `read_reference` tool | real: the model routes by itself |
| `discovery` | only the YAML frontmatter + `load_skill` | real+: it must decide to load the skill at all |

`routed` and `agentic` are skipped for skills with no `references/`.

## Layout

```
<skill>/SKILL.md [+ references/*.md]   a skill under test (agent-custody/, outlayer/)
suites/<name>/cases.json               the battery: one-shot cases
              flows.json               multi-turn conversations (each step feeds the next)
              preamble.txt             system preamble for the suite
gateways.json                          saved providers + api keys (gitignored)
bench-results/*.json                   every run, full history included
src/  gateway.ts  store.ts  skills.ts  runner.ts  api.ts  server.ts
cli.ts   ui/                           CLI and web UI over the same domain
```

A case is `{tag, prompt, expect, ref}`. `expect` is a regex, or a list of regexes
that must all match. `ref` is the reference the answer should come from — `-` means
routing isn't graded, `!` means the model should *not* open anything.

## Use

```sh
npm i
node cli.ts add minimax --key sk-...     # or nearai | openai | claude
node cli.ts ls
node cli.ts skills
node cli.ts suites

node cli.ts bench minimax --skill agent-custody --suite outlayer
node cli.ts bench minimax --skill agent-custody,outlayer --arm core,agentic,discovery --runs 3
node cli.ts bench minimax --mode flows --tag swap --conc 8
```

Exits non-zero if anything failed. Every run is saved to `bench-results/`.

## Web UI

```sh
npm start        # API on :8787
npm run ui       # vite on :5173, proxies /api
```

Same runs, plus per-answer history, past runs, and manual review: a human verdict
on an answer overrides the regex (`PATCH /benchmarks/:file` with `{index, verdict}`).

## API

```
GET    /presets /arms /skills /suites /suites/:name
GET    /gateways        POST /gateways        DELETE /gateways/:id
POST   /benchmarks      { gateway, skills?, suite?, mode?, arms?, tags?, runs?, stream? }
GET    /benchmarks      GET /benchmarks/:file  PATCH /benchmarks/:file
```

`stream: true` returns SSE, one event per answer.

## Test

```sh
npm test
```
