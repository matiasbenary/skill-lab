import type { BenchmarkData, Gateway, Mode, ResultItem, Skill, Suite } from './types'

const json = (r: Response) => r.json()
const post = (path: string, body: unknown) =>
  fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export const getGateways = (): Promise<Gateway[]> => fetch('/api/gateways').then(json)
export const getPresets = (): Promise<Record<string, Partial<Gateway>>> => fetch('/api/presets').then(json)
export const getSkills = (): Promise<Skill[]> => fetch('/api/skills').then(json)
export const getArms = (): Promise<string[]> => fetch('/api/arms').then(json)
export const getSuites = (): Promise<string[]> => fetch('/api/suites').then(json)
export const getSuite = (name: string): Promise<Suite> => fetch(`/api/suites/${name}`).then(json)
export const getBenchmarks = (): Promise<string[]> => fetch('/api/benchmarks').then(json)
export const getBenchmark = (file: string): Promise<BenchmarkData> => fetch(`/api/benchmarks/${file}`).then(json)

export async function addGateway(gw: Partial<Gateway>): Promise<Gateway> {
  const res = await post('/gateways', gw)
  if (!res.ok) throw new Error((await res.json()).error ?? 'could not save')
  return res.json()
}

/** Manual review of one answer of a saved run. null goes back to the regex. */
export const setVerdict = (file: string, index: number, verdict: boolean | null) =>
  fetch(`/api/benchmarks/${file}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ index, verdict }),
  }).then((r) => { if (!r.ok) throw new Error('could not save the verdict'); })

export const removeGateway = (id: string) => fetch(`/api/gateways/${id}`, { method: 'DELETE' })

export type RunRequest = { gateway: string; skills: string[]; suite: string; mode: Mode; arms: string[]; tags?: string[]; runs: number }

export type Chunk = { kind: 'result'; item: ResultItem } | { kind: 'done'; file: string }

/** Runs the suite and emits each result as it arrives (SSE over POST). */
export async function* streamBenchmark(req: RunRequest, signal: AbortSignal): AsyncGenerator<Chunk> {
  const res = await fetch('/api/benchmarks', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...req, stream: true }),
    signal,
  })
  if (!res.ok) throw new Error((await res.json()).error ?? `error ${res.status}`)

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value
    const events = buffer.split('\n\n')
    buffer = events.pop() ?? ''
    for (const event of events) {
      const data = event.split('\n').find((l) => l.startsWith('data: '))
      if (!data) continue
      const payload = JSON.parse(data.slice(6))
      if (event.includes('event: done')) return yield { kind: 'done', file: payload.file }
      yield { kind: 'result', item: payload as ResultItem }
    }
  }
}
