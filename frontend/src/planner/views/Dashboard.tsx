// Planner command center (spec §21).
//
// Two things this page has to get right, because they are the reason to open it:
//
//  1. Deadlines must be in DATE order. They are stored as the sentence a real
//     page used ("Dec 15, 2026 (for Fall 2027 entry; …)"), and sorting those
//     alphabetically put "Apr 1, 2027" above "Dec 1, 2026" and listed
//     "Unknown/Verify…" as though it were a date. lib/deadlines parses a real
//     date out of the prose, and anything with no usable date is moved to
//     "Needs attention" instead of being given a fake position in the list.
//
//  2. "Needs attention" must be a work queue, not a pile of counters. Every row
//     is one specific, actionable thing, ordered by how much it costs to ignore,
//     and it links to the item rather than dumping you on a list to re-find it.

import { useMemo } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { PlannerProgram, PlannerState } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import { resolveProgram } from '../lib/referenceBridge'
import { isLikelyRecruiting } from '../lib/recruitment'
import { SUBMITTED_STATUSES, UNKNOWN_LABEL } from '../lib/labels'
import { isStale } from '../lib/researchField'
import { daysUntil, formatDeadline, relativeDeadline, resolveDeadline, type ParsedDeadline } from '../lib/deadlines'
import { effectiveContact, findRecord, useOutreachSnapshot } from '../lib/outreachBridge'
import { facultyOccurrences } from '../lib/referenceBridge'

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 font-serif text-2xl font-bold leading-none text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-[10.5px] text-slate-400">{hint}</div>}
    </div>
  )
}

type Severity = 'urgent' | 'soon' | 'info'

const SEV_DOT: Record<Severity, string> = {
  urgent: 'bg-rose-500',
  soon: 'bg-amber-500',
  info: 'bg-slate-300',
}

interface AttentionItem {
  id: string
  severity: Severity
  text: string
  /** what to do about it — shown as the link label */
  action: string
  go: () => void
}

interface DeadlineRow {
  program: PlannerProgram
  parsed: ParsedDeadline
  days: number
  submitted: boolean
}

export function Dashboard({ state, pool }: { state: PlannerState; pool: ReferencePool }) {
  const outreach = useOutreachSnapshot()

  /** Every program's deadline, actually parsed. */
  const deadlines = useMemo(() => {
    const dated: DeadlineRow[] = []
    const other: { program: PlannerProgram; parsed: ParsedDeadline }[] = []
    for (const p of state.programs) {
      const live = resolveProgram(p, pool.byId)
      const parsed = resolveDeadline(p.admissions.deadline, live?.requirements.deadline)
      const submitted = SUBMITTED_STATUSES.includes(p.status)
      if (parsed.kind === 'dated' && parsed.iso) {
        dated.push({ program: p, parsed, days: daysUntil(parsed.iso), submitted })
      } else {
        other.push({ program: p, parsed })
      }
    }
    dated.sort((a, b) => a.days - b.days)
    return {
      overdue: dated.filter((d) => d.days < 0),
      upcoming: dated.filter((d) => d.days >= 0),
      rolling: other.filter((o) => o.parsed.kind === 'rolling'),
      paused: other.filter((o) => o.parsed.kind === 'paused'),
      unknown: other.filter((o) => o.parsed.kind === 'unknown'),
    }
  }, [state.programs, pool.byId])

  /** Contact state per person, merging my intent with Gmail evidence. */
  const contacts = useMemo(() => {
    return state.faculty.map((f) => {
      const occ =
        f.ref.kind === 'database'
          ? facultyOccurrences(f.ref.mergeKey, pool.programs).map((o) => ({
              programId: o.program.id,
              facultyId: o.faculty.id,
            }))
          : []
      const record = findRecord(f, outreach, occ)
      return { faculty: f, record, effective: effectiveContact(f, record) }
    })
  }, [state.faculty, outreach, pool.programs])

  const stats = useMemo(() => {
    const likely = state.faculty.filter((f) => isLikelyRecruiting(f.recruiting.value ?? 'unknown'))
    const replied = contacts.filter((c) => c.record?.replyState === 'replied')
    const submitted = state.programs.filter((p) => SUBMITTED_STATUSES.includes(p.status))
    return { likely, replied, submitted }
  }, [state, contacts])

  const attention = useMemo(() => {
    const items: AttentionItem[] = []
    const one = (p: PlannerProgram) => () => navigate(`/planner/programs/${p.id}`)

    // 1. A deadline that has passed while the application is unsent is the most
    //    expensive thing on this page to not notice.
    for (const d of deadlines.overdue) {
      if (d.submitted) continue
      items.push({
        id: `overdue/${d.program.id}`,
        severity: 'urgent',
        text: `${d.program.university} — ${d.program.programName} closed ${relativeDeadline(d.parsed.iso!)} and is not submitted`,
        action: 'open',
        go: one(d.program),
      })
    }

    // 2. Closing soon and not sent.
    for (const d of deadlines.upcoming) {
      if (d.submitted || d.days > 30) continue
      items.push({
        id: `soon/${d.program.id}`,
        severity: d.days <= 14 ? 'urgent' : 'soon',
        text: `${d.program.university} — ${d.program.programName} closes ${relativeDeadline(d.parsed.iso!)}`,
        action: 'open',
        go: one(d.program),
      })
    }

    // 3. No usable date at all — you cannot plan around what you cannot see.
    //    This replaces the old separate "deadlines need verification" counter.
    if (deadlines.unknown.length) {
      const first = deadlines.unknown[0].program
      items.push({
        id: 'nodate',
        severity: 'soon',
        text:
          deadlines.unknown.length === 1
            ? `${first.university} — ${first.programName} has no usable deadline date`
            : `${deadlines.unknown.length} programs have no usable deadline date`,
        action: deadlines.unknown.length === 1 ? 'open' : 'review',
        go: deadlines.unknown.length === 1 ? one(first) : () => navigate('/planner/programs'),
      })
    }

    // 4. Sent but silent — the follow-up window.
    const awaiting = contacts.filter(
      (c) => c.record && c.record.replyState !== 'replied' && Date.now() - c.record.sentAt > 21 * 86_400_000,
    )
    if (awaiting.length) {
      const f = awaiting[0].faculty
      items.push({
        id: 'awaiting',
        severity: 'soon',
        text:
          awaiting.length === 1
            ? `${f.name} hasn’t replied in ${Math.floor((Date.now() - awaiting[0].record!.sentAt) / 86_400_000)} days`
            : `${awaiting.length} professors haven’t replied in over 3 weeks`,
        action: awaiting.length === 1 ? 'open' : 'review',
        go: awaiting.length === 1 ? () => navigate(`/planner/faculty/${f.id}`) : () => navigate('/planner/faculty'),
      })
    }

    // 5. Known to be recruiting, never contacted.
    const uncontacted = contacts.filter(
      (c) =>
        isLikelyRecruiting(c.faculty.recruiting.value ?? 'unknown') &&
        c.effective.status === 'not_contacted',
    )
    if (uncontacted.length) {
      const f = uncontacted[0].faculty
      items.push({
        id: 'uncontacted',
        severity: 'soon',
        text:
          uncontacted.length === 1
            ? `${f.name} looks to be recruiting and hasn’t been contacted`
            : `${uncontacted.length} likely-recruiting professors haven’t been contacted`,
        action: uncontacted.length === 1 ? 'open' : 'review',
        go: uncontacted.length === 1 ? () => navigate(`/planner/faculty/${f.id}`) : () => navigate('/planner/faculty'),
      })
    }

    // 6–8. Lower-stakes gaps.
    const noFaculty = state.programs.filter((p) => p.facultyIds.length === 0)
    if (noFaculty.length)
      items.push({
        id: 'nofaculty',
        severity: 'info',
        text:
          noFaculty.length === 1
            ? `${noFaculty[0].university} — ${noFaculty[0].programName} has no saved faculty`
            : `${noFaculty.length} programs have no saved faculty`,
        action: noFaculty.length === 1 ? 'open' : 'review',
        go: noFaculty.length === 1 ? one(noFaculty[0]) : () => navigate('/planner/programs'),
      })

    const staleRecruit = state.faculty.filter(
      (f) => f.recruiting.checkedAt && isStale(f.recruiting, state.settings.staleAfterDays),
    )
    const neverChecked = state.faculty.filter((f) => !f.recruiting.checkedAt)
    if (staleRecruit.length)
      items.push({
        id: 'stale',
        severity: 'info',
        text: `${staleRecruit.length} recruiting status${staleRecruit.length === 1 ? '' : 'es'} last checked over ${state.settings.staleAfterDays} days ago`,
        action: 'review',
        go: () => navigate('/planner/faculty'),
      })
    if (neverChecked.length)
      items.push({
        id: 'unchecked',
        severity: 'info',
        text: `${neverChecked.length} professor${neverChecked.length === 1 ? '’s' : 's’'} recruiting status has never been checked`,
        action: 'review',
        go: () => navigate('/planner/faculty'),
      })

    const unknownGre = state.programs.filter((p) => (p.admissions.gre?.value ?? null) === null)
    if (unknownGre.length)
      items.push({
        id: 'gre',
        severity: 'info',
        text: `${unknownGre.length} program${unknownGre.length === 1 ? ' has' : 's have'} unknown GRE status`,
        action: 'review',
        go: () => navigate('/planner/programs'),
      })

    const rank: Record<Severity, number> = { urgent: 0, soon: 1, info: 2 }
    return items.sort((a, b) => rank[a.severity] - rank[b.severity])
  }, [state, deadlines, contacts])

  const recentlyUpdated = useMemo(() => {
    const all = [
      ...state.programs.map((p) => ({ id: p.id, kind: 'programs' as const, name: `${p.university} — ${p.programName}`, at: p.updatedAt })),
      ...state.faculty.map((f) => ({ id: f.id, kind: 'faculty' as const, name: f.name, at: f.updatedAt })),
    ]
    return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6)
  }, [state])

  const empty = state.programs.length === 0 && state.faculty.length === 0

  const deadlineRow = (d: DeadlineRow, tone: string) => (
    <li key={d.program.id} className="flex items-baseline justify-between gap-3 py-0.5">
      <button
        onClick={() => navigate(`/planner/programs/${d.program.id}`)}
        className="min-w-0 truncate text-left text-[12.5px] text-slate-700 hover:text-indigo-700 hover:underline"
      >
        {d.program.university}
        <span className="text-slate-400"> — {d.program.programName}</span>
      </button>
      <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
        <span className={`text-[11px] font-medium ${tone}`}>{relativeDeadline(d.parsed.iso!)}</span>
        <span className="text-[12px] text-slate-600" title={d.parsed.raw}>
          {formatDeadline(d.parsed.iso!)}
          {d.parsed.yearInferred && <span className="text-amber-600" title="The page gave no year — inferred as the next occurrence."> *</span>}
        </span>
      </span>
    </li>
  )

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
            {pool.loading && <p className="mt-2 text-[11px] text-slate-400">Loading the reference database…</p>}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <Tile label="Programs" value={state.programs.length} />
              <Tile label="Faculty" value={state.faculty.length} />
              <Tile label="Likely Recruiting" value={stats.likely.length} hint="actively or possibly" />
              <Tile label="Replied" value={stats.replied.length} hint="from Gmail" />
              <Tile label="Submitted" value={`${stats.submitted.length} / ${state.programs.length}`} />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <section className="rounded-lg border border-slate-200 bg-white p-3.5">
                <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Deadlines
                </h2>

                {deadlines.overdue.length === 0 && deadlines.upcoming.length === 0 ? (
                  <p className="text-[12px] text-slate-400">
                    No program has a usable date yet — they stay {UNKNOWN_LABEL} until you fill one in.
                  </p>
                ) : (
                  <>
                    {deadlines.overdue.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">
                          Passed
                        </div>
                        <ul className="mb-2">{deadlines.overdue.map((d) => deadlineRow(d, 'text-rose-600'))}</ul>
                      </>
                    )}
                    <ul>
                      {deadlines.upcoming
                        .slice(0, 8)
                        .map((d) => deadlineRow(d, d.days <= 14 ? 'text-rose-600' : d.days <= 30 ? 'text-amber-600' : 'text-slate-400'))}
                    </ul>
                    {deadlines.upcoming.length > 8 && (
                      <p className="mt-1 text-[10.5px] text-slate-400">
                        + {deadlines.upcoming.length - 8} further out
                      </p>
                    )}
                  </>
                )}

                {/* Things that genuinely have no date, kept out of the ordered list. */}
                {(deadlines.rolling.length > 0 || deadlines.paused.length > 0 || deadlines.unknown.length > 0) && (
                  <p className="mt-2 border-t border-slate-100 pt-1.5 text-[10.5px] leading-relaxed text-slate-400">
                    {deadlines.rolling.length > 0 && <>{deadlines.rolling.length} rolling · </>}
                    {deadlines.paused.length > 0 && <>{deadlines.paused.length} paused · </>}
                    {deadlines.unknown.length > 0 && <>{deadlines.unknown.length} with no usable date</>}
                  </p>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-3.5">
                <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Needs attention
                </h2>
                {attention.length === 0 ? (
                  <p className="text-[12px] text-emerald-600">Nothing outstanding.</p>
                ) : (
                  <ul className="space-y-1">
                    {attention.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex items-start gap-2">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${SEV_DOT[a.severity]}`} />
                        <button
                          onClick={a.go}
                          className="min-w-0 text-left text-[12.5px] leading-snug text-slate-700 hover:text-indigo-700"
                        >
                          {a.text}
                          <span className="ml-1 text-[11px] text-indigo-600 hover:underline">{a.action} →</span>
                        </button>
                      </li>
                    ))}
                    {attention.length > 8 && (
                      <li className="text-[10.5px] text-slate-400">+ {attention.length - 8} more</li>
                    )}
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
