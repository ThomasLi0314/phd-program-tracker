// + Add Program (spec §5): either pick one out of the canonical database, or
// type in one that isn't in it yet. Both paths coexist by design.

import { useMemo, useState } from 'react'
import type { Program } from '../../types'
import type { PlannerState } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'

export function AddProgramModal({
  state,
  pool,
  planner,
  onClose,
  onAdded,
}: {
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
  onClose: () => void
  onAdded: (id: string) => void
}) {
  const [tab, setTab] = useState<'database' | 'manual'>('database')
  const [query, setQuery] = useState('')
  const [university, setUniversity] = useState('')
  const [programName, setProgramName] = useState('')
  const [website, setWebsite] = useState('')

  /** Canonical ids already in the planner — so we can show them as added. */
  const taken = useMemo(
    () =>
      new Set(
        state.programs.flatMap((p) => (p.ref.kind === 'database' ? [p.ref.programId] : [])),
      ),
    [state.programs],
  )

  const RESULT_CAP = 60
  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return []
    const scored: Program[] = []
    for (const p of pool.programs) {
      const hay = `${p.university} ${p.program_name} ${p.discipline.primary} ${p.discipline.subs.join(' ')}`.toLowerCase()
      if (terms.every((t) => hay.includes(t))) scored.push(p)
      if (scored.length >= RESULT_CAP * 3) break
    }
    return scored
      .sort((a, b) => a.university.localeCompare(b.university) || a.program_name.localeCompare(b.program_name))
      .slice(0, RESULT_CAP)
  }, [query, pool.programs])

  const addFromDb = (p: Program) => {
    const id = planner.addProgramFromReference(p)
    if (id) onAdded(id)
  }

  const addManual = () => {
    if (!university.trim() || !programName.trim()) return
    onAdded(planner.addCustomProgram({ university, programName, website }))
  }

  const input =
    'w-full rounded border border-slate-300 px-2 py-1.5 text-[13px] text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200'

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-6" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
          <h2 className="font-serif text-[15px] font-bold text-slate-900">Add a program</h2>
          <button onClick={onClose} className="text-[12px] text-slate-400 hover:text-slate-600">
            close
          </button>
        </div>

        <div className="flex gap-1 border-b border-slate-200 px-4 pt-2.5">
          {(['database', 'manual'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-t border-b-2 px-3 py-1.5 text-[12px] font-medium transition-colors ${
                tab === t
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'database' ? 'From the database' : 'Add manually'}
            </button>
          ))}
        </div>

        {tab === 'database' ? (
          <div className="p-4">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by university, program, or discipline…"
              className={input}
            />
            {pool.loading && (
              <p className="mt-2 text-[11px] text-slate-400">
                Still loading the database — results will fill in.
              </p>
            )}
            <div className="mt-3">
              {query.trim() === '' ? (
                <p className="py-8 text-center text-[12px] text-slate-400">
                  Type to search {pool.programs.length.toLocaleString()} programs.
                </p>
              ) : results.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-slate-400">
                  No program matches “{query}”. Use <b>Add manually</b> if it isn’t in the database
                  yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {results.map((p) => {
                    const already = taken.has(p.id)
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-slate-800">
                            {p.university}
                          </div>
                          <div className="truncate text-[11.5px] text-slate-500">
                            {p.program_name} · {p.degree_type} · {p.discipline.primary} ·{' '}
                            {p.faculty.length} faculty
                          </div>
                        </div>
                        <button
                          disabled={already}
                          onClick={() => addFromDb(p)}
                          className="shrink-0 rounded bg-indigo-600 px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
                        >
                          {already ? 'Added' : 'Add'}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 p-4">
            <div>
              <label className="text-[11px] font-medium text-slate-500">University *</label>
              <input
                autoFocus
                value={university}
                onChange={(e) => setUniversity(e.target.value)}
                placeholder="e.g. University of Hamburg"
                className={input}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500">Program name *</label>
              <input
                value={programName}
                onChange={(e) => setProgramName(e.target.value)}
                placeholder="e.g. PhD in Applied Mathematics"
                className={input}
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-slate-500">Program website</label>
              <input
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://…"
                className={input}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Everything else starts as <b>Unknown / Verify</b> — nothing is guessed on your behalf.
              Fill fields in yourself, or let the research step propose them later.
            </p>
            <button
              onClick={addManual}
              disabled={!university.trim() || !programName.trim()}
              className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
            >
              Add program
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
