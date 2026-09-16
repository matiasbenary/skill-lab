import { useState } from 'react'
import { addGateway, removeGateway } from '../api'
import type { Gateway } from '../types'

type Props = {
  gateways: Gateway[]
  presets: Record<string, Partial<Gateway>>
  selected: string
  onSelect: (id: string) => void
  onChange: () => void
}

type Draft = Partial<Gateway>

export function Gateways({ gateways, presets, selected, onSelect, onChange }: Props) {
  // null = form closed; no id = new entry; with id = editing that row
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState('')

  const openNew = () => { setError(''); setDraft(draft && !draft.id ? null : { ...presets.nearai, label: '' }) }
  const edit = (g: Gateway) => { setError(''); setDraft(draft?.id === g.id ? null : { ...g, apiKey: '' }) }
  const pick = (name: string) => setDraft((d) => ({ ...d, ...presets[name], label: d?.label || name }))

  async function save() {
    try {
      await addGateway(draft!)
      setDraft(null)
      setError('')
      onChange()
    } catch (e) {
      setError(String((e as Error).message))
    }
  }

  const form = (
    <div className="grid gap-2 bg-slate-950/40 p-4 sm:grid-cols-2">
      <select value="" onChange={(e) => pick(e.target.value)} className={input}>
        <option value="" disabled>preset…</option>
        {Object.keys(presets).map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <input placeholder="name" value={draft?.label ?? ''} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={input} />
      <input placeholder="base url" value={draft?.baseUrl ?? ''} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} className={`${input} sm:col-span-2 font-mono text-xs`} />
      <input placeholder="model" value={draft?.model ?? ''} onChange={(e) => setDraft({ ...draft, model: e.target.value })} className={`${input} font-mono text-xs`} />
      <input placeholder={draft?.id ? 'api key (leave empty to keep)' : 'api key'} type="password" value={draft?.apiKey ?? ''}
        onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })} className={input} />
      <div className="sm:col-span-2 flex items-center gap-3">
        <button onClick={save} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-500">save</button>
        <button onClick={() => setDraft(null)} className="text-xs text-slate-500 hover:text-slate-300">cancel</button>
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
    </div>
  )

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50">
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">Gateways</h2>
        <button onClick={openNew} className="rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-700">
          {draft && !draft.id ? 'cancel' : '+ new'}
        </button>
      </header>

      {draft && !draft.id && <div className="border-b border-slate-800">{form}</div>}

      <ul className="divide-y divide-slate-800">
        {gateways.length === 0 && <li className="px-4 py-6 text-center text-xs text-slate-500">no gateways yet</li>}
        {gateways.map((g) => (
          <li key={g.id} className={g.id === selected ? 'bg-slate-800/40' : ''}>
            <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <input type="radio" name="gateway" checked={g.id === selected} onChange={() => onSelect(g.id)}
                title="use this gateway for the run" className="accent-emerald-500" />
              <button onClick={() => onSelect(g.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <span className="font-medium text-slate-200">{g.label}</span>
                <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">{g.kind}</span>
                <span className="truncate font-mono text-xs text-slate-500">{g.model}</span>
              </button>
              <button onClick={() => edit(g)} className="text-xs text-slate-600 hover:text-slate-300">
                {draft?.id === g.id ? 'close' : 'edit'}
              </button>
              <button onClick={async () => { if (confirm(`delete gateway "${g.label}"?`)) { await removeGateway(g.id); onChange() } }}
                className="text-xs text-slate-600 hover:text-rose-400">
                delete
              </button>
            </div>
            {draft?.id === g.id && form}
          </li>
        ))}
      </ul>
    </section>
  )
}

const input = 'rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-600 focus:outline-none'
