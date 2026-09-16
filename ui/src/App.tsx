import { useEffect, useRef, useState } from 'react'
import { getArms, getBenchmark, getBenchmarks, getGateways, getPresets, getSkills, getSuite, getSuites, setVerdict, streamBenchmark } from './api'
import { Gateways } from './components/Gateways'
import { RunForm, type RunConfig } from './components/RunForm'
import { Results } from './components/Results'
import { ByTag, Summary } from './components/Summary'
import { cellsOf, type Gateway, type ResultItem, type Skill, type Suite } from './types'

/** What is on screen: the live run, or the header of the saved run being viewed. */
type Meta = { skills: string[]; suite: string; model: string; runs: number; file: string }

export default function App() {
  const [gateways, setGateways] = useState<Gateway[]>([])
  const [presets, setPresets] = useState<Record<string, Partial<Gateway>>>({})
  const [skills, setSkills] = useState<Skill[]>([])
  const [arms, setArms] = useState<string[]>([])
  const [suites, setSuites] = useState<string[]>([])
  const [suite, setSuite] = useState<Suite | null>(null)
  const [config, setConfig] = useState<RunConfig>({ gateway: '', skills: [], suite: '', mode: 'cases', arms: ['none', 'core', 'agentic'], tags: [], runs: 1 })

  const [results, setResults] = useState<ResultItem[]>([])
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [meta, setMeta] = useState<Meta | null>(null)
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
    getSkills().then((s) => { setSkills(s); setConfig((c) => ({ ...c, skills: c.skills.length ? c.skills : s.slice(0, 1).map((x) => x.name) })) })
    getSuites().then((names) => { setSuites(names); setConfig((c) => ({ ...c, suite: c.suite || names[0] || '' })) })
    getBenchmarks().then(setSaved)
  }, [])

  // the battery follows the chosen suite: its tags are what you can filter by
  useEffect(() => {
    if (!config.suite) return
    getSuite(config.suite).then(setSuite).catch((e) => setError(String(e.message)))
  }, [config.suite])

  // loads a run from disk into the same view the live run uses
  async function load(name: string) {
    setError(''); setResults([]); setMeta(null)
    if (!name) return
    try {
      const data = await getBenchmark(name)
      // runs saved before multi-skill carry the skill only in the header
      const legacy = (data as any).skill
      setResults(data.results.map((r) => ({ ...r, skill: r.skill ?? legacy ?? '?' })))
      setMeta({ skills: data.skills ?? [legacy], suite: data.suite ?? '?', model: data.model, runs: data.runs, file: name })
      setProgress({ done: data.results.length, total: data.results.length })
    } catch (e) {
      setError(`could not load ${name}: ${(e as Error).message}`)
    }
  }

  // how many answers to expect: one per case, or one per step of each conversation
  const units = (config.mode === 'flows' ? suite?.flows : suite?.cases) ?? []
  const picked = units.filter((u) => !config.tags.length || config.tags.includes(u.tag))
  const tags = [...new Set(units.map((u) => u.tag))]
  const answers = config.mode === 'flows'
    ? picked.reduce((a, c: any) => a + c.steps.length, 0)
    : picked.length
  // routed and agentic only exist for a skill that has references/
  const planned = config.skills.reduce((n, name) => {
    const refs = skills.find((s) => s.name === name)?.refs.length
    return n + config.arms.filter((a) => refs || (a !== 'routed' && a !== 'agentic')).length
  }, 0) * answers * config.runs

  async function run() {
    setResults([]); setError(''); setRunning(true)
    setMeta({ skills: config.skills, suite: config.suite, model: gateways.find((g) => g.id === config.gateway)?.model ?? '', runs: config.runs, file: '' })
    setProgress({ done: 0, total: planned })
    abort.current = new AbortController()
    try {
      for await (const chunk of streamBenchmark(config, abort.current.signal)) {
        if (chunk.kind === 'done') { setMeta((m) => m && { ...m, file: chunk.file }); getBenchmarks().then(setSaved) }
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

  // manual review: the verdict goes into the saved run, so it survives a reload
  async function judge(index: number, verdict: boolean | null) {
    const file = meta?.file.split('/').pop()
    if (!file) return
    try {
      await setVerdict(file, index, verdict)
      setResults((rs) => rs.map((r, n) => (n === index ? { ...r, verdict: verdict ?? undefined } : r)))
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  const cells = cellsOf(results)
  const totalCost = results.reduce((a, r) => a + r.cost, 0)
  const totalTok = results.reduce((a, r) => a + r.inTok + r.outTok, 0)
  const errors = results.filter((r) => r.error).length
  const current = meta?.file.split('/').pop() ?? ''

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/40">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline gap-3 px-6 py-4">
          <h1 className="text-lg font-semibold tracking-tight">skill·lab</h1>
          <p className="text-xs text-slate-500">one battery, one or more skills, arm by arm</p>
          <select
            value={saved.includes(current) ? current : ''}
            onChange={(e) => load(e.target.value)}
            disabled={running}
            className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300"
          >
            <option value="">past runs ({saved.length})</option>
            {saved.map((f) => <option key={f} value={f}>{f.replace(/\.json$/, '')}</option>)}
          </select>
          {results.length > 0 && (
            <div className="ml-auto flex flex-wrap items-baseline gap-4 font-mono text-xs text-slate-400">
              {meta && <span className="text-slate-500">{meta.skills.join(' vs ')} · {meta.suite} · {meta.model} · {meta.runs} run{meta.runs > 1 ? 's' : ''}</span>}
              <span>{results.length} answers</span>
              <span>{totalTok.toLocaleString()} tokens</span>
              {errors > 0 && <span className="text-rose-400">{errors} errors</span>}
              <span className="text-emerald-400">${totalCost.toFixed(4)}</span>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-6 py-6">
        <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
          <RunForm
            gateways={gateways} skills={skills} arms={arms} tags={tags} suites={suites}
            config={config} setConfig={setConfig}
            running={running} progress={progress} planned={planned}
            onRun={run} onStop={() => abort.current?.abort()}
          />
          <Gateways
            gateways={gateways} presets={presets}
            selected={config.gateway} onSelect={(id) => setConfig({ ...config, gateway: id })}
            onChange={refreshGateways}
          />
        </div>

        {error && <p className="rounded-lg border border-rose-900 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">{error}</p>}

        {results.length > 0 && (
          <>
            <Summary results={results} cells={cells} />
            <ByTag results={results} cells={cells} />
            <Results results={results} cells={cells} onVerdict={meta?.file ? judge : null} />
            {meta?.file && <p className="text-xs text-slate-600">json saved to <span className="font-mono text-slate-500">{meta.file}</span></p>}
          </>
        )}
      </main>
    </div>
  )
}
