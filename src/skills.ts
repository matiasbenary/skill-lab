// Skill layer: loads a skill from disk and builds the system prompt for each arm.
//
//   none     nothing                       what the model knows on its own
//   full     old monolithic SKILL.md       what it used to cost
//   core     new SKILL.md, no refs         is the core enough?
//   routed   core + the right reference    ceiling: perfect routing
//   agentic  core + tool to request a ref  real: the model routes by itself
//   discovery only the frontmatter + tools  real+: it must load the skill first
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import type { Tool } from "./gateway.ts";

export const ARMS = ["none", "full", "core", "routed", "agentic", "discovery"] as const;
export type Arm = (typeof ARMS)[number];

/** `text` is the whole SKILL.md; `front` is just its YAML frontmatter. */
export type Skill = { name: string; dir: string; text: string; front: string; refs: string[] };

export function loadSkill(dir: string): Skill {
  const path = resolve(dir);
  const refsDir = join(path, "references");
  const text = readFileSync(join(path, "SKILL.md"), "utf8");
  return {
    name: basename(path),
    dir: path,
    text,
    front: /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "",
    refs: existsSync(refsDir) ? readdirSync(refsDir).filter((f) => f.endsWith(".md")) : [],
  };
}

export const readRef = (skill: Skill, name: string) => readFileSync(join(skill.dir, "references", name), "utf8");

/** The skills available to pick: directories with a SKILL.md inside. */
export const listSkills = (root = process.env.SKILLS_DIR ?? ".") =>
  readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && existsSync(join(root, d.name, "SKILL.md")))
    .map((d) => loadSkill(join(root, d.name)))
    .map(({ name, dir, refs, text }) => ({ name, dir, refs, chars: text.length }));

/** Fallback when the suite carries no preamble.txt of its own. */
export const PREAMBLE =
  "You are an agent working with the skill below. Answer the user precisely and " +
  "concisely. If you do not know, say so rather than inventing an answer.";

/**
 * The tool the agentic arm offers the model to request a reference.
 * Deliberately shaped like the harness's real `Read`: a free-form path, no list
 * of what exists and no cap on how many it opens. Knowing which files are there
 * is the SKILL.md's job, which is exactly what the routing arms measure. A wrong
 * guess costs a round and comes back as ENOENT, as it would in Claude Code.
 */
export const readReferenceTool = (): Tool => ({
  name: "read_reference",
  description: "Read a file from disk.",
  params: { type: "object", properties: { file: { type: "string", description: "Path of the file to read, e.g. references/foo.md" } }, required: ["file"] },
});

/**
 * The tool the discovery arm offers: the model starts with nothing but the
 * frontmatter and has to decide the skill is worth loading, the way a harness
 * makes it choose from a list of descriptions before any body is in context.
 */
export const loadSkillTool = (skill: Skill): Tool => ({
  name: "load_skill",
  description: `Load the full instructions of a skill listed in <available-skills>.`,
  params: { type: "object", properties: { name: { type: "string", description: "The skill's name, e.g. " + skill.name } }, required: ["name"] },
});

export function systemPrompt(arm: Arm, skill: Skill, ref: string, preamble = PREAMBLE): string {
  if (arm === "none") return preamble;
  // discovery = progressive disclosure from the top: only the frontmatter is in
  // context, the body arrives (or not) through load_skill.
  if (arm === "discovery") return `${preamble}\n\n<available-skills>\n${skill.front}\n</available-skills>`;
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
