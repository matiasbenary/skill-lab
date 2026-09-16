import type { Gateway, Mode, Skill } from '../types'

export type RunConfig = { gateway: string; skills: string[]; suite: string; mode: Mode; arms: string[]; tags: string[]; runs: number }

type Props = {
  gateways: Gateway[]
  skills: Skill[]
  arms: string[]
  tags: string[]
  suites: string[]
  config: RunConfig
  setConfig: (c: RunConfig) => void
  running: boolean
  progress: { done: number; total: number }
  planned: number
  onRun: () => void
  onStop: () => void
}

export function RunForm({ gateways, skills, arms, tags, suites, config, setConfig, running, progress, planned, onRun, onStop }: Props) {
  const chosen = skills.filter((s) => config.skills.includes(s.name))
  // routed and agentic need a references/ dir: they're off only if NO chosen skill has one
  const disabled = (arm: string) => (arm === 'routed' || arm === 'agentic') && !chosen.some((s) => s.refs.length)

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1">
          <span className={caption}>gateway</span>
          <select value={config.gateway} onChange={(e) => setConfig({ ...config, gateway: e.target.value })} className={input}>
            {gateways.map((g) => (
              <option key={g.id} value={g.id}>{g.label} · {g.model}</option>
            ))}
          </select>
        </label>

        <label className="grid gap-1">
          <span className={caption}>suite</span>
          <select value={config.suite} onChange={(e) => setConfig({ ...config, suite: e.target.value, tags: [] })} className={input}>
            {suites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="grid gap-1">
          <span className={caption}>runs per unit</span>
          <input type="number" min={1} max={10} value={config.runs}
            onChange={(e) => setConfig({ ...config, runs: Math.max(1, Number(e.target.value)) })} className={input} />
        </label>
      </div>

      <div className="mt-4 grid gap-3">
        <div>
          <span className={caption}>skills <span className="text-slate-600">(pick two to compare)</span></span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <button key={s.name} onClick={() => setConfig({ ...config, skills: toggle(config.skills, s.name) })}
                title={`${s.refs.length} references · ${(s.chars / 1000).toFixed(1)}k chars`}
                className={chip(config.skills.includes(s.name), false)}>
                {s.name} <span className="opacity-60">{s.refs.length ? `${s.refs.length} refs` : 'mono'}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={caption}>mode</span>
          <div className="mt-1.5 flex gap-1.5">
            {(['cases', 'flows'] as Mode[]).map((m) => (
              <button key={m} onClick={() => setConfig({ ...config, mode: m, tags: [] })} className={chip(config.mode === m, false)}>
                {m === 'cases' ? 'single cases' : 'conversations'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className={caption}>arms</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {arms.map((arm) => (
              <button key={arm} disabled={disabled(arm)}
                onClick={() => setConfig({ ...config, arms: toggle(config.arms, arm) })}
                title={disabled(arm) ? 'no chosen skill has references/' : ARM_HELP[arm] ?? ''}
                className={chip(config.arms.includes(arm) && !disabled(arm), disabled(arm))}>
                {arm}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600">{ARM_HELP[config.arms.at(-1) ?? 'none']}</p>
        </div>

        <div>
          <span className={caption}>tags <span className="text-slate-600">(empty = all)</span></span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <button key={tag} onClick={() => setConfig({ ...config, tags: toggle(config.tags, tag) })}
                className={chip(config.tags.includes(tag), false)}>
                {tag}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {running ? (
          <button onClick={onStop} className="rounded-md bg-rose-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-rose-500">
            stop
          </button>
        ) : (
          <button onClick={onRun} disabled={!config.gateway || !config.arms.length || !config.skills.length || !planned}
            className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600">
            run battery
          </button>
        )}
        {running && progress.total > 0 ? (
          <div className="flex flex-1 items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <span className="font-mono text-xs text-slate-500">{progress.done}/{progress.total}</span>
          </div>
        ) : (
          // what you are about to spend, before spending it
          <span className="font-mono text-xs text-slate-500">{planned} answers</span>
        )}
      </div>
    </section>
  )
}

const ARM_HELP: Record<string, string> = {
  none: 'none — no skill at all: what the model already knows',
  full: 'full — the whole SKILL.md inlined, references and all: the expensive ceiling',
  core: 'core — only the core SKILL.md, no references: is the core enough?',
  routed: 'routed — core + the one right reference handed to it: ceiling of perfect routing',
  agentic: 'agentic — core + a tool to request references: the model routes by itself',
}

const caption = 'text-[11px] uppercase tracking-wider text-slate-500'
const input = 'rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 focus:border-slate-600 focus:outline-none'
const chip = (on: boolean, off: boolean) =>
  `rounded-full px-3 py-1 text-xs transition ${
    off ? 'cursor-not-allowed bg-slate-900 text-slate-700 line-through'
       : on ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
  }`
