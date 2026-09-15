export type Arm = 'none' | 'full' | 'core' | 'routed' | 'agentic'

export type ToolCall = { id: string; name: string; args: any }
export type Turn =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls: ToolCall[] }
  | { role: 'tool'; id: string; name: string; content: string }

export type ResultItem = {
  tag: string
  prompt: string
  ref: string
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
  error?: string
  conversation?: string
  step?: number
}

export type BenchmarkData = {
  skill: string
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
export type Suite = 'cases' | 'flows'

/** Did it route correctly? null = the case doesn't evaluate it. Same criteria as the backend. */
export function routedOk(ref: string, asked: string | null): boolean | null {
  if (ref === '-') return null
  if (ref === '!') return asked === null
  return asked === ref
}
