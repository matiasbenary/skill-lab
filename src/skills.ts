// Skill layer: loads a skill from disk and builds the system prompt for each arm.
//
//   none     nothing                       what the model knows on its own
//   full     old monolithic SKILL.md       what it used to cost
//   core     new SKILL.md, no refs         is the core enough?
//   routed   core + the right reference    ceiling: perfect routing
//   agentic  core + tool to request a ref  real: the model routes by itself
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import type { Tool } from "./gateway.ts";

export const ARMS = ["none", "full", "core", "routed", "agentic"] as const;
export type Arm = (typeof ARMS)[number];

export type Skill = { name: string; dir: string; text: string; refs: string[] };

export function loadSkill(dir: string): Skill {
  const path = resolve(dir);
  const refsDir = join(path, "references");
  return {
    name: basename(path),
    dir: path,
    text: readFileSync(join(path, "SKILL.md"), "utf8"),
    refs: existsSync(refsDir) ? readdirSync(refsDir).filter((f) => f.endsWith(".md")) : [],
  };
}

export const readRef = (skill: Skill, name: string) => readFileSync(join(skill.dir, "references", name), "utf8");

/** The skills available to pick: directories with a SKILL.md inside. */
export const listSkills = (root = ".") =>
  readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && existsSync(join(root, d.name, "SKILL.md")))
    .map((d) => loadSkill(join(root, d.name)))
    .map(({ name, dir, refs, text }) => ({ name, dir, refs, chars: text.length }));

export const PREAMBLE =
  "You are an agent operating an OutLayer custody wallet. Answer the user with the " +
  "exact endpoint, curl and fields. Be concise. If you do not know, say so " +
  "rather than inventing an endpoint.";

/** The tool the agentic arm offers the model to request a reference. */
export const readReferenceTool = (refs: string[]): Tool => ({
  name: "read_reference",
  description:
    "Read one reference file from the skill. Call it when the task needs detail " +
    "the core SKILL.md does not carry. Read exactly one, the one for the task.",
  params: { type: "object", properties: { file: { type: "string", enum: refs } }, required: ["file"] },
});

export function systemPrompt(arm: Arm, skill: Skill, ref: string, preamble = PREAMBLE): string {
  if (arm === "none") return preamble;
  // full = the monolith: SKILL.md with every reference inlined. For a skill with
  // no references/ (an old, already monolithic one) it's just its SKILL.md.
  if (arm === "full") return wrap(preamble, skill.text + skill.refs.map((r) => referenceBlock(skill, r)).join(""));

  const core = wrap(preamble, skill.text);
  const hasRef = ref && ref !== "-" && ref !== "!" && skill.refs.includes(ref);
  return arm === "routed" && hasRef ? core + referenceBlock(skill, ref) : core; // core and agentic
}

const wrap = (preamble: string, text: string) => `${preamble}\n\n<skill>\n${text}\n</skill>`;
const referenceBlock = (skill: Skill, ref: string) => `\n\n<reference name="${ref}">\n${readRef(skill, ref)}\n</reference>`;

/** Did it route correctly? null = the case doesn't evaluate it. */
export function routedOk(ref: string, asked: string | null): boolean | null {
  if (ref === "-") return null;
  if (ref === "!") return asked === null;
  return asked === ref;
}
