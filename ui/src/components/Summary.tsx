import { inCell, ok, routedOk, type Cell, type ResultItem } from '../types'

const money = (n: number) => '$' + n.toFixed(4)
const avg = (ns: number[]) => Math.round(ns.reduce((a, n) => a + n, 0) / (ns.length || 1))

/** One card per skill x arm: how much it got right, how much it spent, whether it routed well. */
export function Summary({ results, cells }: { results: ResultItem[]; cells: Cell[] }) {
  const rows = cells.map((cell) => {
    const rs = results.filter((r) => inCell(r, cell))
    // only the agentic arm routes: the rest have no tool, there is nothing to get right
    const routing = (cell.arm === 'agentic' || cell.arm === 'discovery') ? rs.map((r) => routedOk(r.ref, r.asked)).filter((v) => v !== null) : []
    return {
      cell,
      pass: rs.filter(ok).length,
      total: rs.length,
      inTok: avg(rs.map((r) => r.inTok)),
      outTok: avg(rs.map((r) => r.outTok)),
      routing: routing.length ? `${routing.filter(Boolean).length}/${routing.length}` : '—',
      // discovery is the only arm that can fail to load the skill at all
      loaded: cell.arm === 'discovery' ? `${rs.filter((r) => r.loaded).length}/${rs.length}` : null,
      cost: rs.reduce((a, r) => a + r.cost, 0),
    }
  })
  const best = Math.max(...rows.map((r) => (r.total ? r.pass / r.total : 0)))

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((r) => {
        const pct = r.total ? (r.pass / r.total) * 100 : 0
        const leader = rows.length > 1 && r.total > 0 && r.pass / r.total === best
        return (
          <div key={r.cell.key} className={`rounded-xl border bg-slate-900/50 p-4 ${leader ? 'border-emerald-700' : 'border-slate-800'}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-slate-200" title={r.cell.label}>{r.cell.label}</span>
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
              {r.loaded && <div><dt>loaded</dt><dd className="font-mono text-slate-300">{r.loaded}</dd></div>}
            </dl>
          </div>
        )
      })}
    </div>
  )
}

/** One row per tag (or per step, in conversations), one column per skill x arm. */
export function ByTag({ results, cells }: { results: ResultItem[]; cells: Cell[] }) {
  const key = (r: ResultItem) => (r.conversation ? `${r.step}. ${r.prompt}` : r.tag)
  const tags = [...new Set(results.map(key))]
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-500">
            <th className="px-4 py-2 font-medium">{results.some((r) => r.conversation) ? 'step' : 'tag'}</th>
            {cells.map((c) => <th key={c.key} className="px-4 py-2 text-center font-medium">{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {tags.map((tag) => (
            <tr key={tag}>
              <td className="max-w-lg truncate px-4 py-2 text-slate-300" title={tag}>{tag}</td>
              {cells.map((cell) => {
                const rs = results.filter((r) => inCell(r, cell) && key(r) === tag)
                const pass = rs.filter(ok).length
                const pct = rs.length ? pass / rs.length : 0
                return (
                  <td key={cell.key} className="px-4 py-2 text-center">
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
          <tr className="border-t border-slate-800 bg-slate-950/40">
            <td className="px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500">total</td>
            {cells.map((cell) => {
              const rs = results.filter((r) => inCell(r, cell))
              return (
                <td key={cell.key} className="px-4 py-2 text-center font-mono text-xs text-slate-300">
                  {rs.filter(ok).length}/{rs.length}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
