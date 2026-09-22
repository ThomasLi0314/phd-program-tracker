// Add programmes to the master's plan: search the dataset (and add several in a
// row), or type in one the dataset does not have.

import { useMemo, useState } from 'react'
import type { EuroDataset } from '../types'
import { Flag } from '../components/Bits'
import type { MastersPlanApi } from './useMastersPlan'

export function AddToPlanModal({
  data,
  plan,
  onClose,
  onCustomAdded,
}: {
  data: EuroDataset | null
  plan: MastersPlanApi
  onClose: () => void
  onCustomAdded: (id: string) => void
}) {
  const [mode, setMode] = useState<'database' | 'custom'>(data ? 'database' : 'custom')
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ university: '', programName: '', country: '', city: '', website: '' })

  const codes = useMemo(() => new Map((data?.countries ?? []).map((c) => [c.country, c.code])), [data])

  const matches = useMemo(() => {
    if (!data) return []
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    return data.programs
      .filter((p) => {
        if (terms.length === 0) return true
        const hay = `${p.university} ${p.program_name} ${p.city} ${p.country} ${p.fields.join(' ')}`.toLowerCase()
        return terms.every((t) => hay.includes(t))
      })
      .sort((a, b) => a.university.localeCompare(b.university) || a.program_name.localeCompare(b.program_name))
      .slice(0, 60)
  }, [data, query])

  const canSubmit = form.university.trim() && form.programName.trim() && form.country.trim()
  const input =
    'w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:border-indigo-400 focus:outline-none'
  const tab = (active: boolean) =>
    `rounded px-2.5 py-1 text-[12px] font-medium ${
      active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[8vh]" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="font-serif text-[15px] font-bold text-slate-900">Add to my master’s plan</h2>
          <button onClick={onClose} className="text-[12px] text-slate-500 hover:text-slate-800">
            Done
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-100 px-4 py-2">
          <button className={tab(mode === 'database')} onClick={() => setMode('database')} disabled={!data}>
            From the database{data ? ` (${data.programs.length})` : ''}
          </button>
          <button className={tab(mode === 'custom')} onClick={() => setMode('custom')}>
            Not in the database
          </button>
        </div>

        {mode === 'database' ? (
          <>
            <div className="px-4 py-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search university, programme, city, country or field…"
                className={input}
              />
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-4 pb-3">
              {matches.map((p) => {
                const existing = plan.entryFor(p.id)
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium text-slate-800">{p.program_name}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        <Flag code={codes.get(p.country) ?? 'EU'} />
                        {p.university} · {p.city}
                      </div>
                    </div>
                    {existing ? (
                      <span className="shrink-0 text-[11px] font-medium text-emerald-600">✓ In plan</span>
                    ) : (
                      <button
                        onClick={() => plan.addFromDatabase(p)}
                        className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11.5px] font-medium text-indigo-700 hover:border-indigo-400"
                      >
                        + Add
                      </button>
                    )}
                  </li>
                )
              })}
              {matches.length === 0 && (
                <li className="py-6 text-center text-[12px] text-slate-400">
                  Nothing matches. Use “Not in the database” to add it by hand.
                </li>
              )}
            </ul>
          </>
        ) : (
          <form
            className="space-y-2 px-4 py-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!canSubmit) return
              onCustomAdded(plan.addCustom(form))
            }}
          >
            <p className="text-[11.5px] text-slate-500">
              A programme you type in stays exactly as you enter it. Deadline, tuition and the rest start as
              “Unknown / Verify” until you fill them in.
            </p>
            {(
              [
                ['university', 'University *', 'e.g. ETH Zurich'],
                ['programName', 'Programme *', 'e.g. MSc Applied Mathematics'],
                ['country', 'Country / region *', 'e.g. Switzerland'],
                ['city', 'City', 'e.g. Zurich'],
                ['website', 'Programme page', 'https://…'],
              ] as const
            ).map(([key, label, ph]) => (
              <label key={key} className="block">
                <span className="text-[11px] font-medium text-slate-500">{label}</span>
                <input
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={ph}
                  list={key === 'country' ? 'masters-countries' : undefined}
                  className={input}
                />
              </label>
            ))}
            <datalist id="masters-countries">
              {(data?.countries ?? []).map((c) => (
                <option key={c.code} value={c.country} />
              ))}
            </datalist>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-2 text-[12px] text-slate-500 hover:underline">
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Add programme
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
