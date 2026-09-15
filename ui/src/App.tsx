import { useEffect, useRef, useState } from 'react'
import { getArms, getBenchmark, getBenchmarks, getCases, getConversations, getGateways, getPresets, getSkills, streamBenchmark } from './api'
import { Gateways } from './components/Gateways'
import { RunForm, type RunConfig } from './components/RunForm'
import { Results } from './components/Results'
import { ByTag, Summary } from './components/Summary'
import type { Conversation, Case, Gateway, ResultItem, Skill } from './types'

export default function App() {
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [presets, setPresets] = useState<Record<string, Partial<Gateway>>>({})
  const [skills, setSkills] = useState<Skill[]>([])
  const [arms, setArms] = useState<string[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [flows, setFlows] = useState<Conversation[]>([])
  const [config, setConfig] = useState<RunConfig>({ gateway: '', skill: '', suite: 'cases', arms: ['none', 'core', 'agentic'], tags: [], runs: 1 })

  const [results, setResults] = useState<ResultItem[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [file, setFile] = useState('')
  const [saved, setSaved] = useState<string[]>([])
  const [error, setError] = useState('')
  const abort = useRef<AbortController>(null)

  const refreshGateways = () => getGateways().then((gws) => {
    setGateways(gws)
    setConfig((c) => ({ ...c, gateway: c.gateway || gws[0]?.id || '' }))
  })

  useEffect(() => {
    refreshGateways()
    getPresets().then(setPresets)
    getArms().then(setArms)
    getSkills().then((s) => { setSkills(s); setConfig((c) => ({ ...c, skill: c.skill || s[0]?.name || '' })) })
    getCases().then(setCases)
    getConversations().then(setFlows)
    getBenchmarks().then(setSaved)
  }, [])

  // loads a run from disk into the same view the live run uses
  async function load(name: string) {
    setFile(name); setError(''); setResults([])
    if (!name) return
    try {
      const data = await getBenchmark(name)
      setResults(data.results)
      setProgress({ done: data.results.length, total: data.results.length })
    } catch (e) {
      setError(`could not load ${name}: ${(e as Error).message}`)
    }
  }

  // how many answers to expect: one per case, or one per step of each conversation
  const units = config.suite === 'flows' ? flows : cases
  const picked = units.filter((u) => !config.tags.length || config.tags.includes(u.tag))
  const tags = [...new Set(units.map((u) => u.tag))]
  const answers = config.suite === 'flows'
    ? (picked as Conversation[]).reduce((a, c) => a + c.steps.length, 0)
    : picked.length

  async function run() {
    const skill = skills.find((s) => s.name === config.skill)
    const effective = config.arms.filter((a) => skill?.refs.length || (a !== 'routed' && a !== 'agentic'))
    setResults([]); setError(''); setFile(''); setRunning(true)
    setProgress({ done: 0, total: answers * effective.length * config.runs })
    abort.current = new AbortController()
    try {
      for await (const chunk of streamBenchmark({ ...config, arms: effective }, abort.current.signal)) {
        if (chunk.kind === 'done') { setFile(chunk.file); getBenchmarks().then(setSaved) }
        else {
          setResults((rs) => [...rs, chunk.item])
          setProgress((p) => ({ ...p, done: p.done + 1 }))
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(String((e as Error).message))
    } finally {
      setRunning(false)
    }
  }

  const armsShown = [...new Set(results.map((r) => r.arm))]
  const totalCost = results.reduce((a, r) => a + r.cost, 0)
  const totalTok = results.reduce((a, r) => a + r.inTok + r.outTok, 0)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/40">
        <div className="mx-auto flex max-w-7xl items-baseline gap-3 px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">skill·lab</h1>
          <p className="text-xs text-slate-500">case battery over one skill, arm by arm</p>
          <select
            value={saved.includes(file.split('/').pop() ?? '') ? file.split('/').pop() : ''}
            onChange={(e) => load(e.target.value)}
            disabled={running}
            className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300"
          >
            <option value="">past runs ({saved.length})</option>
            {saved.map((f) => <option key={f} value={f}>{f.replace(/\.json$/, '')}</option>)}
          </select>
          {results.length > 0 && (
            <div className="ml-auto flex gap-5 font-mono text-xs text-slate-400">
              <span>{results.length} answers</span>
              <span>{totalTok.toLocaleString()} tokens</span>
              <span className="text-emerald-400">${totalCost.toFixed(4)}</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-6 py-6">
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <RunForm
            gateways={gateways} skills={skills} arms={arms} tags={tags}
            config={config} setConfig={setConfig}
            running={running} progress={progress}
            onRun={run} onStop={() => abort.current?.abort()}
          />
          <Gateways
            gateways={gateways} presets={presets}
            selected={config.gateway} onSelect={(id) => setConfig((c) => ({ ...c, gateway: id }))}
            onChange={refreshGateways}
          />
        </div>

        {error && <p className="rounded-lg border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">{error}</p>}

        {results.length > 0 && (
          <>
            <Summary results={results} arms={armsShown} />
            <ByTag results={results} arms={armsShown} />
            <Results results={results} arms={armsShown} />
            {file && <p className="text-xs text-slate-600">json saved to <span className="font-mono text-slate-500">{file}</span></p>}
          </>
        )}
      </main>
    </div>
  )
}
