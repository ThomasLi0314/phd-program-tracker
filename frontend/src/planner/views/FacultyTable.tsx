// Cross-program faculty view (spec §23). The filters exist to answer questions
// like "which high-fit professors appear to be recruiting and haven't been
// contacted?" in one pass.

import { useMemo, useState } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { PlannerState } from '../types'
import type { PlannerApi } from '../lib/usePlanner'
import type { ReferencePool } from '../lib/useReferencePool'
import {
  RECRUITMENT_DOTS,
  RECRUITMENT_LABELS,
  RECRUITMENT_ORDER,
  recruitmentRank,
} from '../lib/recruitment'
import { CONTACT_LABELS, CONTACT_ORDER } from '../lib/labels'
import { StatusSelect } from '../components/StatusChip'

type SortKey = 'name' | 'recruiting' | 'contact' | 'fit'

export function FacultyTable({
  state,
  pool,
  planner,
}: {
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
}) {
  const [query, setQuery] = useState('')
  const [recruitFilter, setRecruitFilter] = useState('')
  const [contactFilter, setContactFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('name')

  const programById = useMemo(() => new Map(state.programs.map((p) => [p.id, p])), [state.programs])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const f of state.faculty) for (const t of f.themes) counts.set(t, (counts.get(t) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t)
  }, [state.faculty])

  const rows = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const out = state.faculty.filter((f) => {
      const status = f.recruiting.value ?? 'unknown'
      if (recruitFilter && status !== recruitFilter) return false
      if (contactFilter && f.contact.status !== contactFilter) return false
      if (tagFilter && !f.themes.includes(tagFilter)) return false
      if (terms.length === 0) return true
      const hay = `${f.name} ${f.university} ${f.department} ${f.themes.join(' ')}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
    out.sort((a, b) => {
      if (sortBy === 'recruiting')
        return (
          recruitmentRank(a.recruiting.value ?? 'unknown') -
            recruitmentRank(b.recruiting.value ?? 'unknown') || a.name.localeCompare(b.name)
        )
      if (sortBy === 'contact')
        return (
          CONTACT_ORDER.indexOf(a.contact.status) - CONTACT_ORDER.indexOf(b.contact.status) ||
          a.name.localeCompare(b.name)
        )
      if (sortBy === 'fit') return (b.fit?.overall ?? -1) - (a.fit?.overall ?? -1)
      return a.name.localeCompare(b.name)
    })
    return out
  }, [state.faculty, query, recruitFilter, contactFilter, tagFilter, sortBy])

  const select =
    'rounded border border-slate-300 bg-white px-1.5 py-1 text-[11.5px] text-slate-600 focus:border-indigo-400 focus:outline-none'

  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <div className="mb-3">
          <h1 className="font-serif text-lg font-bold text-slate-900">Faculty</h1>
          <p className="text-[12px] text-slate-500">
            {state.faculty.length} across your saved programs · add faculty from inside a program
          </p>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name, university, or theme…"
            className="min-w-[220px] flex-1 rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:border-indigo-400 focus:outline-none"
          />
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className={select}>
            <option value="">Any theme</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={recruitFilter} onChange={(e) => setRecruitFilter(e.target.value)} className={select}>
            <option value="">Any recruiting status</option>
            {RECRUITMENT_ORDER.map((r) => (
              <option key={r} value={r}>
                {RECRUITMENT_LABELS[r]}
              </option>
            ))}
          </select>
          <select value={contactFilter} onChange={(e) => setContactFilter(e.target.value)} className={select}>
            <option value="">Any contact status</option>
            {CONTACT_ORDER.map((c) => (
              <option key={c} value={c}>
                {CONTACT_LABELS[c]}
              </option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className={select}>
            <option value="name">Sort: Name</option>
            <option value="recruiting">Sort: Recruiting</option>
            <option value="contact">Sort: Contact</option>
            <option value="fit">Sort: Fit</option>
          </select>
        </div>

        {state.faculty.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="font-serif text-[15px] font-bold text-slate-800">No faculty yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-slate-500">
              Open one of your programs and use <b>＋ Add Faculty</b> — from its roster in the
              database, or by typing someone in.
            </p>
            <button
              onClick={() => navigate('/planner/programs')}
              className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700"
            >
              Go to Programs
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-400">No faculty match these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5">Faculty</th>
                  <th className="px-2 py-1.5">University</th>
                  <th className="px-2 py-1.5">Program(s)</th>
                  <th className="px-2 py-1.5">Themes</th>
                  <th className="px-2 py-1.5">Recruiting</th>
                  <th className="px-2 py-1.5">Contact</th>
                  <th className="px-2 py-1.5">Checked</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const status = f.recruiting.value ?? 'unknown'
                  return (
                    <tr key={f.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                      <td className="px-2 py-2">
                        <button
                          onClick={() => navigate(`/planner/faculty/${f.id}`)}
                          className="text-left text-[13px] font-medium text-slate-800 hover:text-indigo-700 hover:underline"
                        >
                          {f.name}
                        </button>
                        {f.title && <div className="text-[11px] text-slate-500">{f.title}</div>}
                      </td>
                      <td className="px-2 py-2 text-[12px] text-slate-600">{f.university || '—'}</td>
                      <td className="px-2 py-2 text-[11.5px] text-slate-600">
                        {f.programIds.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          f.programIds
                            .map((pid) => programById.get(pid)?.programName)
                            .filter(Boolean)
                            .join(', ')
                        )}
                      </td>
                      <td className="px-2 py-2 text-[11px] text-slate-500">
                        {f.themes.slice(0, 3).join(' · ') || '—'}
                      </td>
                      <td className="px-2 py-2 text-[11.5px] whitespace-nowrap">
                        {RECRUITMENT_DOTS[status]} {RECRUITMENT_LABELS[status]}
                      </td>
                      <td className="px-2 py-2">
                        <StatusSelect
                          value={f.contact.status}
                          options={CONTACT_ORDER}
                          labels={CONTACT_LABELS}
                          onChange={(v) => planner.updateFaculty(f.id, { contact: { ...f.contact, status: v } })}
                        />
                      </td>
                      <td className="px-2 py-2 text-[11px] text-slate-400">
                        {f.recruiting.checkedAt ?? 'never'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {pool.loading && (
          <p className="mt-2 text-[11px] text-slate-400">Reference database still loading…</p>
        )}
      </div>
    </main>
  )
}
