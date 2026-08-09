// Planner-focused program table (spec §22): dense, sortable, filterable.

import { useMemo, useState } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { PlannerProgram, PlannerState } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'
import { programIdentity, resolveProgram } from '../lib/referenceBridge'
import { isLikelyRecruiting } from '../lib/recruitment'
import {
  APPLICATION_LABELS,
  APPLICATION_ORDER,
  APPLICATION_TONES,
  FUNDING_LABELS,
  INTEREST_LABELS,
  INTEREST_ORDER,
  UNKNOWN_LABEL,
} from '../lib/labels'
import { StatusChip, StatusSelect } from '../components/StatusChip'
import { AddProgramModal } from '../components/AddProgramModal'

type SortKey = 'university' | 'interest' | 'deadline' | 'status' | 'faculty'

export function ProgramsTable({
  state,
  pool,
  planner,
}: {
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [interestFilter, setInterestFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortKey>('university')

  const facultyById = useMemo(() => new Map(state.faculty.map((f) => [f.id, f])), [state.faculty])

  const rows = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const out = state.programs
      .map((entry) => {
        const live = resolveProgram(entry, pool.byId)
        const id = programIdentity(entry, live)
        const linked = entry.facultyIds.map((fid) => facultyById.get(fid)).filter(Boolean)
        return {
          entry,
          id,
          savedFaculty: linked.length,
          likelyRecruiting: linked.filter((f) => f && isLikelyRecruiting(f.recruiting.value ?? 'unknown'))
            .length,
        }
      })
      .filter((r) => {
        if (interestFilter && r.entry.interest !== interestFilter) return false
        if (statusFilter && r.entry.status !== statusFilter) return false
        if (terms.length === 0) return true
        const hay = `${r.id.university} ${r.id.programName} ${r.id.discipline}`.toLowerCase()
        return terms.every((t) => hay.includes(t))
      })

    const interestRank = (p: PlannerProgram) => INTEREST_ORDER.indexOf(p.interest)
    out.sort((a, b) => {
      if (sortBy === 'interest') return interestRank(a.entry) - interestRank(b.entry)
      if (sortBy === 'status')
        return APPLICATION_ORDER.indexOf(a.entry.status) - APPLICATION_ORDER.indexOf(b.entry.status)
      if (sortBy === 'faculty') return b.savedFaculty - a.savedFaculty
      if (sortBy === 'deadline') {
        // Unknown deadlines sort last — they're the ones needing work, but they
        // shouldn't crowd out the dates you can actually plan around.
        const av = a.entry.admissions.deadline?.value ?? ''
        const bv = b.entry.admissions.deadline?.value ?? ''
        if (!av && !bv) return 0
        if (!av) return 1
        if (!bv) return -1
        return av.localeCompare(bv)
      }
      return a.id.university.localeCompare(b.id.university)
    })
    return out
  }, [state.programs, pool.byId, facultyById, query, interestFilter, statusFilter, sortBy])

  const select =
    'rounded border border-slate-300 bg-white px-1.5 py-1 text-[11.5px] text-slate-600 focus:border-indigo-400 focus:outline-none'

  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-lg font-bold text-slate-900">Programs</h1>
            <p className="text-[12px] text-slate-500">
              {state.programs.length} in your planner · target cycle {state.settings.cycle}
            </p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            + Add Program
          </button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by university or program…"
            className="min-w-[220px] flex-1 rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:border-indigo-400 focus:outline-none"
          />
          <select value={interestFilter} onChange={(e) => setInterestFilter(e.target.value)} className={select}>
            <option value="">Any interest</option>
            {INTEREST_ORDER.map((i) => (
              <option key={i} value={i}>
                {INTEREST_LABELS[i]}
              </option>
            ))}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={select}>
            <option value="">Any status</option>
            {APPLICATION_ORDER.map((s) => (
              <option key={s} value={s}>
                {APPLICATION_LABELS[s]}
              </option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className={select}>
            <option value="university">Sort: University</option>
            <option value="interest">Sort: Interest</option>
            <option value="deadline">Sort: Deadline</option>
            <option value="status">Sort: Status</option>
            <option value="faculty">Sort: Saved faculty</option>
          </select>
        </div>

        {state.programs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="font-serif text-[15px] font-bold text-slate-800">No programs yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-slate-500">
              Add one from the {pool.programs.length.toLocaleString()}-program database, or type in a
              program that isn’t in it yet.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700"
            >
              + Add Program
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-400">
            No program matches these filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5">University / Program</th>
                  <th className="px-2 py-1.5">Interest</th>
                  <th className="px-2 py-1.5">Deadline</th>
                  <th className="px-2 py-1.5">GRE</th>
                  <th className="px-2 py-1.5">Funding</th>
                  <th className="px-2 py-1.5 text-right" title="Saved faculty · likely recruiting">
                    Faculty
                  </th>
                  <th className="px-2 py-1.5">Application</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ entry, id, savedFaculty, likelyRecruiting }) => (
                  <tr key={entry.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                    <td className="px-2 py-2">
                      <button
                        onClick={() => navigate(`/planner/programs/${entry.id}`)}
                        className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-700 hover:underline"
                      >
                        {id.university}
                      </button>
                      <div className="text-[11.5px] text-slate-500">
                        {id.programName}
                        {!id.fromDatabase && (
                          <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[9.5px] font-medium text-amber-800">
                            custom
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <StatusSelect
                        value={entry.interest}
                        options={INTEREST_ORDER}
                        labels={INTEREST_LABELS}
                        onChange={(v) => planner.updateProgram(entry.id, { interest: v })}
                      />
                    </td>
                    <td className="px-2 py-2 text-[12px]">
                      {entry.admissions.deadline?.value ? (
                        <span className="text-slate-700">{entry.admissions.deadline.value}</span>
                      ) : (
                        <span className="italic text-amber-700">{UNKNOWN_LABEL}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[12px]">
                      {entry.admissions.gre?.value ? (
                        <span className="text-slate-700">{entry.admissions.gre.value}</span>
                      ) : (
                        <span className="italic text-amber-700">{UNKNOWN_LABEL}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[12px]">
                      {entry.funding.level?.value ? (
                        <span className="text-slate-700">{FUNDING_LABELS[entry.funding.level.value]}</span>
                      ) : (
                        <span className="italic text-amber-700">{UNKNOWN_LABEL}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-[12px] tabular-nums text-slate-600">
                      {savedFaculty}
                      {likelyRecruiting > 0 && (
                        <span className="ml-1 text-emerald-600" title="likely recruiting">
                          ({likelyRecruiting})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <StatusChip
                        label={APPLICATION_LABELS[entry.status]}
                        tone={APPLICATION_TONES[entry.status]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {adding && (
        <AddProgramModal
          state={state}
          pool={pool}
          planner={planner}
          onClose={() => setAdding(false)}
          onAdded={(id) => {
            setAdding(false)
            navigate(`/planner/programs/${id}`)
          }}
        />
      )}
    </main>
  )
}
