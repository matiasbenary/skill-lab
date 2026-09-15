import { Fragment, useState } from 'react'
import { routedOk, type ResultItem, type Turn } from '../types'

const ROLE = {
  system: 'bg-amber-500/10 text-amber-300',
  user: 'bg-sky-500/10 text-sky-300',
  assistant: 'bg-emerald-500/10 text-emerald-300',
  tool: 'bg-violet-500/10 text-violet-300',
} as const

function Msg({ role, label, body }: { role: keyof typeof ROLE; label?: string; body: string }) {
  const [open, setOpen] = useState(body.length < 4000)
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${ROLE[role]}`}>{role}</span>
        {label && <span className="font-mono text-[11px] text-slate-500">{label}</span>}
        <span className="ml-auto text-[10px] text-slate-600">{body.length.toLocaleString()} chars · {open ? 'hide' : 'show'}</span>
      </button>
      {open && <pre className="max-h-96 overflow-auto whitespace-pre-wrap border-t border-slate-800 px-3 py-2 text-xs text-slate-300">{body || '(empty)'}</pre>}
    </div>
  )
}

function Transcript({ system, history }: { system: string; history: Turn[] }) {
  return (
    <div className="space-y-2">
      {system && <Msg role="system" body={system} />}
      {history.map((t, i) => (
        <Msg
          key={i}
          role={t.role}
          label={t.role === 'tool' ? `${t.name} → ${t.id}` : t.role === 'assistant' && t.toolCalls?.length ? t.toolCalls.map((c) => `${c.name}(${JSON.stringify(c.args)})`).join(' ') : undefined}
          body={t.content}
        />
      ))}
    </div>
  )
}

type Props = { results: ResultItem[]; arms: string[] }

export function Results({ results, arms }: Props) {
  const [arm, setArm] = useState('')
  const [onlyFails, setOnlyFails] = useState(false)
  const [open, setOpen] = useState<number | null>(null)

  const shown = results.filter((r) => (!arm || r.arm === arm) && (!onlyFails || !r.pass))
  const flows = results.some((r) => r.conversation)

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50">
      <header className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3">
        <h2 className="mr-auto text-sm font-semibold text-slate-200">
          Answers <span className="font-normal text-slate-500">({shown.length})</span>
        </h2>
        <select value={arm} onChange={(e) => setArm(e.target.value)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-300">
          <option value="">all arms</option>
          {arms.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">
          <input type="checkbox" checked={onlyFails} onChange={(e) => setOnlyFails(e.target.checked)} className="accent-rose-500" />
          only failures
        </label>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="w-10 px-3 py-2"></th>
              <th className="px-3 py-2 font-medium">arm</th>
              <th className="px-3 py-2 font-medium">{flows ? 'step' : 'tag'}</th>
              <th className="px-3 py-2 font-medium">prompt</th>
              <th className="px-3 py-2 text-right font-medium">tok in</th>
              <th className="px-3 py-2 text-right font-medium">tok out</th>
              <th className="px-3 py-2 text-right font-medium">cost</th>
              <th className="px-3 py-2 font-medium">routing</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {shown.map((r, idx) => {
              const routed = r.arm === 'agentic' ? routedOk(r.ref, r.asked) : null
              const isOpen = open === idx
              return (
                <Fragment key={idx}>
                  <tr onClick={() => setOpen(isOpen ? null : idx)} className="cursor-pointer hover:bg-slate-800/30">
                    <td className="px-3 py-2 text-center">
                      <span className={r.pass ? 'text-emerald-400' : 'text-rose-400'}>{r.pass ? '✓' : '✗'}</span>
                    </td>
                    <td className="px-3 py-2"><span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{r.arm}</span></td>
                    <td className="px-3 py-2 text-xs text-slate-400">{flows ? `${r.step}/${r.conversation}` : r.tag}</td>
                    <td className="max-w-md truncate px-3 py-2 text-slate-300">{r.prompt}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{r.inTok.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{r.outTok.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">${r.cost.toFixed(5)}</td>
                    <td className="px-3 py-2 text-xs">
                      {r.asked ? (
                        <span className={routed === false ? 'text-rose-400' : 'text-slate-400'}>{r.asked}</span>
                      ) : routed === true ? (
                        <span className="text-emerald-400">asked none (ok)</span>
                      ) : (
                        <span className="text-slate-700">—</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-slate-950/60">
                      <td colSpan={8} className="px-6 py-4">
                        <p className="text-xs text-slate-500">prompt</p>
                        <p className="mb-3 text-sm text-slate-300">{r.prompt}</p>
                        <p className="text-xs text-slate-500">expected ref: <span className="font-mono text-slate-400">{r.ref}</span></p>
                        {r.error && <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">ERROR {r.error}</p>}
                        <p className="mt-3 mb-1 text-xs text-slate-500">transcript</p>
                        {r.history?.length ? (
                          <Transcript system={r.system} history={r.history} />
                        ) : (
                          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-xs text-slate-300">{r.text || '(empty)'}</pre>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
            {shown.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-xs text-slate-600">nothing yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
