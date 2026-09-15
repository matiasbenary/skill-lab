import { routedOk, type ResultItem } from '../types'

const money = (n: number) => '$' + n.toFixed(4)
const avg = (ns: number[]) => Math.round(ns.reduce((a, n) => a + n, 0) / (ns.length || 1))

/** One row per arm: how much it got right, how much it spent, whether it routed well. */
export function Summary({ results, arms }: { results: ResultItem[]; arms: string[] }) {
  const rows = arms.map((arm) => {
    const rs = results.filter((r) => r.arm === arm)
    // only the agentic arm routes: the rest have no tool, there is nothing to get right
    const routing = arm === 'agentic' ? rs.map((r) => routedOk(r.ref, r.asked)).filter((v) => v !== null) : []
    return {
      arm,
      pass: rs.filter((r) => r.pass).length,
      total: rs.length,
      inTok: avg(rs.map((r) => r.inTok)),
      outTok: avg(rs.map((r) => r.outTok)),
      routing: routing.length ? `${routing.filter(Boolean).length}/${routing.length}` : '—',
      cost: rs.reduce((a, r) => a + r.cost, 0),
    }
  })

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((r) => {
        const pct = r.total ? (r.pass / r.total) * 100 : 0
        return (
          <div key={r.arm} className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-slate-200">{r.arm}</span>
              <span className="font-mono text-xs text-slate-500">{money(r.cost)}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums text-slate-100">{pct.toFixed(0)}%</span>
              <span className="text-xs text-slate-500">{r.pass}/{r.total} pass</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div className={`h-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
              <div><dt>tok in</dt><dd className="font-mono text-slate-300">{r.inTok}</dd></div>
              <div><dt>tok out</dt><dd className="font-mono text-slate-300">{r.outTok}</dd></div>
              <div><dt>routing</dt><dd className="font-mono text-slate-300">{r.routing}</dd></div>
            </dl>
          </div>
        )
      })}
    </div>
  )
}

/** One row per tag (or per step, in conversations), one column per arm. */
export function ByTag({ results, arms }: { results: ResultItem[]; arms: string[] }) {
  const key = (r: ResultItem) => (r.conversation ? `${r.step}. ${r.prompt}` : r.tag)
  const tags = [...new Set(results.map(key))]
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2 font-medium">{results.some((r) => r.conversation) ? 'step' : 'tag'}</th>
            {arms.map((a) => <th key={a} className="px-4 py-2 text-center font-medium">{a}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {tags.map((tag) => (
            <tr key={tag}>
              <td className="max-w-lg truncate px-4 py-2 text-slate-300">{tag}</td>
              {arms.map((arm) => {
                const rs = results.filter((r) => r.arm === arm && key(r) === tag)
                const pass = rs.filter((r) => r.pass).length
                const pct = rs.length ? pass / rs.length : 0
                return (
                  <td key={arm} className="px-4 py-2 text-center">
                    {rs.length === 0 ? <span className="text-slate-700">—</span> : (
                      <span className={`font-mono text-xs ${pct === 1 ? 'text-emerald-400' : pct === 0 ? 'text-rose-400' : 'text-amber-400'}`}>
                        {pass}/{rs.length}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
