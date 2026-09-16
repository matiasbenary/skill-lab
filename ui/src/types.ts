export type Arm = 'none' | 'full' | 'core' | 'routed' | 'agentic'

/** Canonical order, so the cards don't reshuffle as results stream in. */
export const ARMS: Arm[] = ['none', 'full', 'core', 'routed', 'agentic']

export type ToolCall = { id: string; name: string; args: any }
export type Turn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[] }
  | { role: 'tool'; id: string; name: string; content: string }

export type ResultItem = {
  skill: string
  tag: string
  prompt: string
  ref: string
  expect: string
  arm: Arm
  i: number
  pass: boolean
  inTok: number
  outTok: number
  cost: number
  asked: string | null
  text: string
  history: Turn[]
  system: string
  /** Manual review: overrides the regex when a human looked at the answer. */
  verdict?: boolean
  error?: string
  conversation?: string
  step?: number
}

export type BenchmarkData = {
  skills: string[]
  suite: string
  model: string
  runs: number
  arms: string[]
  pricing: { in: number; out: number }
  results: ResultItem[]
}

export type Gateway = {
  id: string
  label: string
  kind: 'openai' | 'anthropic'
  baseUrl: string
  model: string
  apiKey: string
}

export type Skill = { name: string; dir: string; refs: string[]; chars: number }
export type Case = { tag: string; prompt: string; expect: string; ref: string }
export type Conversation = { name: string; tag: string; steps: Case[] }
/** A battery of cases, independent of any skill: the same one runs against several. */
export type Suite = { name: string; preamble: string; cases: Case[]; flows: Conversation[] }
export type Mode = 'cases' | 'flows'

/** One column of the comparison: a skill run under one arm. */
export type Cell = { skill: string; arm: Arm; key: string; label: string }

/** Every skill x arm present in the results, in a stable order. */
export function cellsOf(results: ResultItem[]): Cell[] {
  const skills = [...new Set(results.map((r) => r.skill))].sort()
  return skills.flatMap((skill) =>
    ARMS.filter((arm) => results.some((r) => r.skill === skill && r.arm === arm)).map((arm) => ({
      skill,
      arm,
      key: `${skill}|${arm}`,
      label: skills.length > 1 ? `${skill} · ${arm}` : arm,
    })),
  )
}

/** Did it pass? The human has the last word; otherwise the regex. */
export const ok = (r: ResultItem) => r.verdict ?? r.pass

export const inCell = (r: ResultItem, c: Cell) => r.skill === c.skill && r.arm === c.arm

/** Did it route correctly? null = the case doesn't evaluate it. Same criteria as the backend. */
export function routedOk(ref: string, asked: string | null): boolean | null {
  if (ref === '-') return null
  if (ref === '!') return asked === null
  return asked === ref
}
