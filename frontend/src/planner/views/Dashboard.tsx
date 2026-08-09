// Planner command center (spec §21).
//
// "Need Attention" is the point of this page: it names the specific gaps in the
// planner rather than showing a wall of decorative cards.

import { useMemo } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { PlannerState } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import { isLikelyRecruiting } from '../lib/recruitment'
import { SUBMITTED_STATUSES, UNKNOWN_LABEL } from '../lib/labels'
import { isStale } from '../lib/researchField'

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 font-serif text-2xl font-bold leading-none text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-[10.5px] text-slate-400">{hint}</div>}
    </div>
  )
}

export function Dashboard({ state, pool }: { state: PlannerState; pool: ReferencePool }) {
  const stats = useMemo(() => {
    const likely = state.faculty.filter((f) => isLikelyRecruiting(f.recruiting.value ?? 'unknown'))
    const highFit = state.faculty.filter((f) => (f.fit?.overall ?? 0) >= 8)
    const submitted = state.programs.filter((p) => SUBMITTED_STATUSES.includes(p.status))
    return { likely, highFit, submitted }
  }, [state])

  const deadlines = useMemo(
    () =>
      state.programs
        .map((p) => ({ p, value: p.admissions.deadline?.value ?? null }))
        .filter((d) => d.value)
        .sort((a, b) => (a.value ?? '').localeCompare(b.value ?? ''))
        .slice(0, 8),
    [state.programs],
  )

  const attention = useMemo(() => {
    const items: { text: string; go: () => void }[] = []

    const staleRecruit = state.faculty.filter((f) => isStale(f.recruiting, state.settings.staleAfterDays))
    const neverChecked = state.faculty.filter((f) => !f.recruiting.checkedAt)
    if (staleRecruit.length + neverChecked.length > 0)
      items.push({
        text: `${staleRecruit.length + neverChecked.length} faculty recruiting status${
          staleRecruit.length + neverChecked.length === 1 ? '' : 'es'
        } not checked recently`,
        go: () => navigate('/planner/faculty'),
      })

    const unknownGre = state.programs.filter((p) => (p.admissions.gre?.value ?? null) === null)
    if (unknownGre.length)
      items.push({
        text: `${unknownGre.length} program${unknownGre.length === 1 ? ' has' : 's have'} unknown GRE status`,
        go: () => navigate('/planner/programs'),
      })

    const unknownDeadline = state.programs.filter((p) => (p.admissions.deadline?.value ?? null) === null)
    if (unknownDeadline.length)
      items.push({
        text: `${unknownDeadline.length} deadline${unknownDeadline.length === 1 ? '' : 's'} need verification`,
        go: () => navigate('/planner/programs'),
      })

    const uncontactedHighFit = state.faculty.filter(
      (f) => (f.fit?.overall ?? 0) >= 8 && f.contact.status === 'not_contacted',
    )
    if (uncontactedHighFit.length)
      items.push({
        text: `${uncontactedHighFit.length} high-fit faculty not contacted`,
        go: () => navigate('/planner/faculty'),
      })

    const noFaculty = state.programs.filter((p) => p.facultyIds.length === 0)
    if (noFaculty.length)
      items.push({
        text: `${noFaculty.length} program${noFaculty.length === 1 ? ' has' : 's have'} no saved faculty`,
        go: () => navigate('/planner/programs'),
      })

    return items
  }, [state])

  const recentlyUpdated = useMemo(() => {
    const all = [
      ...state.programs.map((p) => ({ id: p.id, kind: 'programs' as const, name: `${p.university} — ${p.programName}`, at: p.updatedAt })),
      ...state.faculty.map((f) => ({ id: f.id, kind: 'faculty' as const, name: f.name, at: f.updatedAt })),
    ]
    return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)
  }, [state])

  const empty = state.programs.length === 0 && state.faculty.length === 0

  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-4">
        <h1 className="mb-3 font-serif text-lg font-bold text-slate-900">Dashboard</h1>

        {empty ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="font-serif text-[16px] font-bold text-slate-800">Your planner is empty</p>
            <p className="mx-auto mt-2 max-w-lg text-[13px] leading-relaxed text-slate-500">
              This is your personal application workspace, separate from the public database. Add the
              programs you actually care about, save the faculty you might work with, and track
              deadlines, contact and application status in one place.
            </p>
            <button
              onClick={() => navigate('/planner/programs')}
              className="mt-4 rounded bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700"
            >
              + Add your first program
            </button>
            {pool.loading && (
              <p className="mt-2 text-[11px] text-slate-400">Loading the reference database…</p>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <Tile label="Programs" value={state.programs.length} />
              <Tile label="Faculty" value={state.faculty.length} />
              <Tile label="High-Fit Faculty" value={stats.highFit.length} hint="fit ≥ 8" />
              <Tile
                label="Likely Recruiting"
                value={stats.likely.length}
                hint="actively or possibly"
              />
              <Tile
                label="Submitted"
                value={`${stats.submitted.length} / ${state.programs.length}`}
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-3.5">
                <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Upcoming deadlines
                </h2>
                {deadlines.length === 0 ? (
                  <p className="text-[12px] text-slate-400">
                    No deadlines recorded yet — they show as {UNKNOWN_LABEL} until you fill them in.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {deadlines.map(({ p, value }) => (
                      <li key={p.id} className="flex items-baseline justify-between gap-3">
                        <button
                          onClick={() => navigate(`/planner/programs/${p.id}`)}
                          className="min-w-0 truncate text-left text-[12.5px] text-slate-700 hover:text-indigo-700 hover:underline"
                        >
                          {p.university} — {p.programName}
                        </button>
                        <span className="shrink-0 text-[12px] font-medium tabular-nums text-slate-600">
                          {value}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-3.5">
                <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Need attention
                </h2>
                {attention.length === 0 ? (
                  <p className="text-[12px] text-emerald-600">Nothing outstanding.</p>
                ) : (
                  <ul className="space-y-1">
                    {attention.map((a) => (
                      <li key={a.text}>
                        <button
                          onClick={a.go}
                          className="text-left text-[12.5px] text-slate-700 hover:text-indigo-700 hover:underline"
                        >
                          • {a.text}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3.5">
              <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Recently updated
              </h2>
              <ul className="space-y-1">
                {recentlyUpdated.map((r) => (
                  <li key={`${r.kind}/${r.id}`} className="flex items-baseline justify-between gap-3">
                    <button
                      onClick={() => navigate(`/planner/${r.kind}/${r.id}`)}
                      className="min-w-0 truncate text-left text-[12.5px] text-slate-700 hover:text-indigo-700 hover:underline"
                    >
                      {r.name}
                    </button>
                    <span className="shrink-0 text-[11px] text-slate-400">{r.at.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
