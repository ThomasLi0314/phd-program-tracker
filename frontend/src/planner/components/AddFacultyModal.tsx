// + Add Faculty (spec §8): pick from the database — this program's roster
// first, then anywhere — or type someone in by hand.
//
// Manual entry runs duplicate detection (spec §35) but never auto-merges: an
// ambiguous match is surfaced for me to decide, because silently fusing two
// different people with a common surname is much worse than a duplicate row.

import { useMemo, useState } from 'react'
import type { Faculty, Program } from '../../types'
import type { PlannerState } from '../types'
import { mergeKey, normalize } from '../../lib/mergeAdvisors'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'

interface Hit {
  faculty: Faculty
  program: Program
  /** true when this person is on the roster of the program being edited */
  own: boolean
}

export function AddFacultyModal({
  state,
  pool,
  planner,
  programEntryId,
  programProgramId,
  onClose,
  onAdded,
}: {
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
  /** PlannerProgram.id the new faculty is linked to. */
  programEntryId: string
  /** Canonical program id, when this planner program came from the database. */
  programProgramId: string | null
  onClose: () => void
  onAdded: () => void
}) {
  const [tab, setTab] = useState<'database' | 'manual'>('database')
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [university, setUniversity] = useState('')
  const [department, setDepartment] = useState('')
  const [homepage, setHomepage] = useState('')

  /** mergeKeys already tracked, so the list can show what's in the planner. */
  const tracked = useMemo(
    () => new Set(state.faculty.flatMap((f) => (f.ref.kind === 'database' ? [f.ref.mergeKey] : []))),
    [state.faculty],
  )

  const RESULT_CAP = 60
  const results = useMemo<Hit[]>(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const own: Hit[] = []
    const other: Hit[] = []
    const ownProgram = programProgramId ? pool.byId.get(programProgramId) : null

    // This program's own roster is the common case, so it is listed first and
    // shown even before you type anything.
    if (ownProgram) {
      for (const f of ownProgram.faculty) {
        const hay = `${f.name} ${f.sub_field} ${f.tags.join(' ')}`.toLowerCase()
        if (terms.length === 0 || terms.every((t) => hay.includes(t)))
          own.push({ faculty: f, program: ownProgram, own: true })
      }
    }
    if (terms.length > 0) {
      for (const p of pool.programs) {
        if (p.id === programProgramId) continue
        for (const f of p.faculty) {
          const hay = `${f.name} ${p.university} ${f.sub_field}`.toLowerCase()
          if (terms.every((t) => hay.includes(t))) other.push({ faculty: f, program: p, own: false })
        }
        if (other.length >= RESULT_CAP * 2) break
      }
    }
    return [...own, ...other].slice(0, RESULT_CAP)
  }, [query, pool.programs, pool.byId, programProgramId])

  /** Possible existing matches for the name being typed (spec §35). */
  const possibleDupes = useMemo(() => {
    const n = normalize(name)
    if (n.length < 3) return []
    return state.faculty.filter((f) => {
      const sameName = normalize(f.name) === n
      if (!sameName) return false
      // Same name at a different university is usually a DIFFERENT person, so
      // flag it as "possible", never as certain.
      return true
    })
  }, [name, state.faculty])

  const addManual = () => {
    if (!name.trim()) return
    planner.addCustomFaculty({ name, university, department, homepage }, programEntryId)
    onAdded()
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
          <h2 className="font-serif text-[15px] font-bold text-slate-900">Add faculty</h2>
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
                tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'
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
              placeholder="Search this program’s roster, or anyone in the database…"
              className={input}
            />
            <div className="mt-3">
              {results.length === 0 ? (
                <p className="py-8 text-center text-[12px] text-slate-400">
                  {query.trim()
                    ? `No faculty match “${query}”. Use Add manually if they aren’t in the database.`
                    : 'This program has no roster in the database yet — search by name, or add manually.'}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {results.map((h) => {
                    const key = mergeKey(h.faculty.name, h.program.university)
                    const already = tracked.has(key)
                    return (
                      <li key={`${h.program.id}/${h.faculty.id}`} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate text-[13px] font-medium text-slate-800">
                            {h.faculty.name}
                            {h.own && (
                              <span className="ml-1.5 rounded bg-indigo-50 px-1 py-px text-[9.5px] font-medium text-indigo-700">
                                this program
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11.5px] text-slate-500">
                            {h.faculty.title || h.faculty.sub_field} · {h.program.university}
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            planner.addFacultyFromReference(h.faculty, h.program, programEntryId)
                            onAdded()
                          }}
                          className="shrink-0 rounded bg-indigo-600 px-2.5 py-1 text-[11.5px] font-semibold text-white transition-colors hover:bg-indigo-700"
                        >
                          {already ? 'Link here' : 'Add'}
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
              <label className="text-[11px] font-medium text-slate-500">Faculty name *</label>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </div>

            {possibleDupes.length > 0 && (
              <div className="rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
                <b>Possible existing faculty match</b>
                <ul className="mt-1 space-y-0.5">
                  {possibleDupes.map((f) => (
                    <li key={f.id}>
                      {f.name}
                      {f.university ? ` — ${f.university}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-amber-700">
                  Same name at a different university is usually a different person. Nothing is
                  merged automatically — add anyway if this is someone new.
                </p>
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-slate-500">
                Faculty / personal website <span className="text-slate-400">(strongly recommended)</span>
              </label>
              <input
                value={homepage}
                onChange={(e) => setHomepage(e.target.value)}
                placeholder="https://…"
                className={input}
              />
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <label className="text-[11px] font-medium text-slate-500">University</label>
                <input value={university} onChange={(e) => setUniversity(e.target.value)} className={input} />
              </div>
              <div>
                <label className="text-[11px] font-medium text-slate-500">Department</label>
                <input value={department} onChange={(e) => setDepartment(e.target.value)} className={input} />
              </div>
            </div>
            <button
              onClick={addManual}
              disabled={!name.trim()}
              className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
            >
              Add faculty
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
