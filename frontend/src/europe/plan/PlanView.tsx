// "My plan" on the Master's Abroad page: the programmes I am applying to, what
// needs doing before which deadline, and an Excel export of exactly what is
// listed.

import { useMemo, useState } from 'react'
import { navigate } from '../../lib/hashRoute'
import { daysUntil, formatDeadline, relativeDeadline } from '../../planner/lib/deadlines'
import { INTEREST_LABELS, INTEREST_ORDER } from '../../planner/lib/labels'
import { StatusSelect } from '../../planner/components/StatusChip'
import type { CountryPolicy, EuroDataset, EuroProgram } from '../types'
import { Flag, ScholarshipChip } from '../components/Bits'
import type { MastersPlanApi } from './useMastersPlan'
import { resolveEntry, originLabel, parseMastersDeadline, type ResolvedEntry } from './resolve'
import {
  OFFER_STATUSES,
  PAST_DEADLINE_STATUSES,
  SCHOLARSHIP_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  type MastersPlanEntry,
} from './types'
import { ChecklistProgress, DeadlineCell, UNKNOWN_LABEL } from './PlanBits'
import { AddToPlanModal } from './AddToPlanModal'
import { exportMastersExcel, type MastersExportRow } from './exportExcel'

type SortKey = 'deadline' | 'interest' | 'status' | 'university' | 'country' | 'checklist'

interface Row {
  entry: MastersPlanEntry
  r: ResolvedEntry
  settled: boolean
  days: number | null
}

interface Attention {
  id: string
  urgent: boolean
  text: string
  entryId: string
}

export function PlanView({
  data,
  plan,
  byId,
  countries,
}: {
  data: EuroDataset | null
  plan: MastersPlanApi
  byId: Map<string, EuroProgram>
  countries: Map<string, CountryPolicy>
}) {
  const { state } = plan
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [interestFilter, setInterestFilter] = useState('')
  const [countryFilter, setCountryFilter] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>('deadline')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const all: Row[] = useMemo(
    () =>
      state.programs.map((entry) => {
        const r = resolveEntry(entry, byId, countries)
        const p = r.deadline.parsed
        return {
          entry,
          r,
          settled: PAST_DEADLINE_STATUSES.includes(entry.status),
          days: p.kind === 'dated' && p.iso ? daysUntil(p.iso) : null,
        }
      }),
    [state.programs, byId, countries],
  )

  const rows = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const out = all.filter(({ entry, r }) => {
      if (statusFilter && entry.status !== statusFilter) return false
      if (interestFilter && entry.interest !== interestFilter) return false
      if (countryFilter && r.country !== countryFilter) return false
      if (!terms.length) return true
      const hay = `${r.university} ${r.programName} ${r.city} ${r.country} ${entry.notes}`.toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
    const byUni = (a: Row, b: Row) =>
      a.r.university.localeCompare(b.r.university) || a.r.programName.localeCompare(b.r.programName)
    const progress = (x: Row) =>
      x.entry.checklist.length ? x.entry.checklist.filter((c) => c.done).length / x.entry.checklist.length : 0
    out.sort((a, b) => {
      if (sortBy === 'deadline') {
        // Dated deadlines first, soonest first; applications already out drop
        // below the ones still to send; no date at all goes last.
        if (a.settled !== b.settled) return a.settled ? 1 : -1
        if (a.days === null && b.days === null) return byUni(a, b)
        if (a.days === null) return 1
        if (b.days === null) return -1
        // Upcoming before passed, so a stale date from last cycle doesn't sit on top.
        if ((a.days < 0) !== (b.days < 0)) return a.days < 0 ? 1 : -1
        return a.days - b.days || byUni(a, b)
      }
      if (sortBy === 'interest')
        return INTEREST_ORDER.indexOf(a.entry.interest) - INTEREST_ORDER.indexOf(b.entry.interest) || byUni(a, b)
      if (sortBy === 'status')
        return STATUS_ORDER.indexOf(a.entry.status) - STATUS_ORDER.indexOf(b.entry.status) || byUni(a, b)
      if (sortBy === 'country') return a.r.country.localeCompare(b.r.country) || byUni(a, b)
      if (sortBy === 'checklist') return progress(a) - progress(b) || byUni(a, b)
      return byUni(a, b)
    })
    return out
  }, [all, query, statusFilter, interestFilter, countryFilter, sortBy])

  const stats = useMemo(() => {
    const count = (fn: (e: MastersPlanEntry) => boolean) => state.programs.filter(fn).length
    const next = all
      .filter((x) => !x.settled && x.days !== null && x.days >= 0)
      .sort((a, b) => a.days! - b.days!)[0]
    return {
      preparing: count((e) => e.status === 'considering' || e.status === 'preparing'),
      submitted: count((e) => PAST_DEADLINE_STATUSES.includes(e.status) && e.status !== 'withdrawn'),
      offers: count((e) => OFFER_STATUSES.includes(e.status)),
      next,
    }
  }, [all, state.programs])

  /** One specific thing to act on per row, most expensive to ignore first. */
  const attention = useMemo(() => {
    const items: Attention[] = []
    const name = (x: Row) => `${x.r.university} — ${x.r.programName}`
    for (const x of all) {
      if (x.settled || x.days === null) continue
      const iso = x.r.deadline.parsed.iso!
      if (x.days < 0) {
        items.push({
          id: `past/${x.entry.id}`,
          urgent: true,
          entryId: x.entry.id,
          text: `${name(x)}: the deadline on file (${formatDeadline(iso)}) has passed and nothing is submitted — probably last cycle’s date; find the ${x.entry.intake} one.`,
        })
      } else if (x.days <= 30) {
        const open = x.entry.checklist.filter((c) => !c.done).length
        items.push({
          id: `soon/${x.entry.id}`,
          urgent: x.days <= 14,
          entryId: x.entry.id,
          text: `${name(x)} closes ${relativeDeadline(iso)} (${formatDeadline(iso)})${open ? ` · ${open} checklist item${open === 1 ? '' : 's'} open` : ''}.`,
        })
      }
    }
    for (const x of all) {
      if (!['undecided', 'planning'].includes(x.entry.scholarship)) continue
      const s = parseMastersDeadline(x.r.scholarshipDeadline.text)
      if (s.kind !== 'dated' || !s.iso) continue
      const d = daysUntil(s.iso)
      if (d < 0 || d > 30) continue
      items.push({
        id: `sch/${x.entry.id}`,
        urgent: d <= 14,
        entryId: x.entry.id,
        text: `${name(x)}: scholarship application closes ${relativeDeadline(s.iso)} (${formatDeadline(s.iso)}).`,
      })
    }
    return items.sort((a, b) => Number(b.urgent) - Number(a.urgent))
  }, [all])

  // Rolling admissions have no date on purpose; only a genuinely missing one is work to do.
  const noDeadline = useMemo(
    () => all.filter((x) => !x.settled && x.r.deadline.parsed.kind === 'unknown'),
    [all],
  )

  const countriesInPlan = useMemo(() => [...new Set(all.map((x) => x.r.country))].sort(), [all])

  const buildExport = (): MastersExportRow[] =>
    rows.map(({ entry, r }) => {
      const p = r.deadline.parsed
      const deadline = !r.deadline.text
        ? UNKNOWN_LABEL
        : p.kind === 'dated' && p.iso && formatDeadline(p.iso) !== r.deadline.text
          ? `${formatDeadline(p.iso)}${p.yearInferred ? ' (year inferred)' : ''} — ${r.deadline.text}`
          : r.deadline.text
      const tuition = r.tuition.text
        ? `${r.tuition.text}${r.tuition.origin === 'country' ? ` (${originLabel(r.tuition, r.countryPolicy)})` : ''}`
        : UNKNOWN_LABEL
      const level = r.scholarshipLevel
      const levelText =
        level === 'full'
          ? 'Full award possible'
          : level === 'partial'
            ? 'Partial / competitive'
            : level === 'none'
              ? 'None found'
              : UNKNOWN_LABEL
      const mineSch = entry.scholarship !== 'undecided' ? ` · my application: ${SCHOLARSHIP_LABELS[entry.scholarship]}` : ''
      const schDeadline = r.scholarshipDeadline.text ? ` · deadline ${r.scholarshipDeadline.text}` : ''
      const open = entry.checklist.filter((c) => !c.done).map((c) => c.label)
      const done = entry.checklist.length - open.length
      return {
        university: r.university,
        program: r.programName,
        country: r.country,
        deadline,
        tuition,
        scholarship: `${levelText}${mineSch}${schDeadline}`,
        english: r.english.text ?? UNKNOWN_LABEL,
        interest: INTEREST_LABELS[entry.interest],
        status: STATUS_LABELS[entry.status],
        checklist: entry.checklist.length
          ? `${done}/${entry.checklist.length}${open.length ? ` — to do: ${open.join(', ')}` : ' — all done'}`
          : '',
        notes: entry.notes.trim(),
        link: r.website || r.portal || '',
      }
    })

  const doExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await exportMastersExcel(buildExport())
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  const select =
    'rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px] text-slate-700 focus:border-indigo-400 focus:outline-none'
  const filtersActive = !!query.trim() || !!statusFilter || !!interestFilter || !!countryFilter
  const tile = 'rounded-lg border border-slate-200 bg-white px-3 py-2'
  const tileLabel = 'text-[10px] font-semibold uppercase tracking-wide text-slate-400'

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-lg font-bold text-slate-900">My master’s plan</h1>
            <p className="text-[12.5px] text-slate-600">
              {state.programs.length} programme{state.programs.length === 1 ? '' : 's'} · applying for{' '}
              <input
                value={state.settings.cycle}
                onChange={(e) => plan.setCycle(e.target.value)}
                title="Default intake for programmes you add from now on"
                className="w-24 rounded border border-transparent px-1 text-[12.5px] text-slate-700 hover:border-slate-300 focus:border-indigo-400 focus:outline-none"
              />
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              onClick={() => void doExport()}
              disabled={exporting || rows.length === 0}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
              title={
                filtersActive
                  ? `Export the ${rows.length} programmes listed, in this order`
                  : 'Export every programme in the plan, in the current order'
              }
            >
              {exporting ? 'Exporting…' : `Export Excel${filtersActive ? ` (${rows.length})` : ''}`}
            </button>
            <button
              onClick={() => setAdding(true)}
              className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              + Add programme
            </button>
          </div>
        </div>
        {exportError && <p className="mb-2 text-[12px] font-medium text-rose-600">Export failed: {exportError}</p>}

        {state.programs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
            <p className="font-serif text-[15px] font-bold text-slate-800">No programmes in your plan yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-slate-600">
              Use <span className="font-medium text-indigo-700">+ Plan</span> on any row of the Programmes tab, or
              add one here — from the {data?.programs.length ?? ''} programmes in the database, or typed in by
              hand.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700"
            >
              + Add programme
            </button>
          </div>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className={tile}>
                <div className={tileLabel}>Next deadline</div>
                {stats.next ? (
                  <button
                    onClick={() => navigate(`/masters/plan/${stats.next!.entry.id}`)}
                    className="mt-0.5 block text-left"
                  >
                    <span className="font-serif text-[15px] font-bold text-slate-900">
                      {formatDeadline(stats.next.r.deadline.parsed.iso!)}
                    </span>
                    <span className="block truncate text-[10.5px] text-slate-500 hover:text-indigo-700">
                      {relativeDeadline(stats.next.r.deadline.parsed.iso!)} · {stats.next.r.university}
                    </span>
                  </button>
                ) : (
                  <div className="mt-0.5 text-[12px] text-slate-400">none on file</div>
                )}
              </div>
              <div className={tile}>
                <div className={tileLabel}>To prepare</div>
                <div className="mt-0.5 font-serif text-2xl font-bold leading-none text-slate-900">{stats.preparing}</div>
              </div>
              <div className={tile}>
                <div className={tileLabel}>Submitted</div>
                <div className="mt-0.5 font-serif text-2xl font-bold leading-none text-slate-900">{stats.submitted}</div>
              </div>
              <div className={tile}>
                <div className={tileLabel}>Offers</div>
                <div className="mt-0.5 font-serif text-2xl font-bold leading-none text-emerald-700">{stats.offers}</div>
              </div>
            </div>

            {(attention.length > 0 || noDeadline.length > 0) && (
              <section className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                <h2 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Needs attention
                </h2>
                <ul className="space-y-0.5">
                  {attention.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-[12px] text-slate-700">
                      <span
                        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.urgent ? 'bg-rose-500' : 'bg-amber-500'}`}
                      />
                      <button
                        onClick={() => navigate(`/masters/plan/${a.entryId}`)}
                        className="text-left hover:text-indigo-700 hover:underline"
                      >
                        {a.text}
                      </button>
                    </li>
                  ))}
                  {noDeadline.length > 0 && (
                    <li className="flex items-start gap-2 text-[12px] text-slate-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                      <span>
                        No usable deadline on file for {noDeadline.length} programme
                        {noDeadline.length === 1 ? '' : 's'} — look them up and enter the date:{' '}
                        {noDeadline.slice(0, 8).map((x, i) => (
                          <span key={x.entry.id}>
                            {i > 0 && ', '}
                            <button
                              onClick={() => navigate(`/masters/plan/${x.entry.id}`)}
                              className="text-indigo-700 hover:underline"
                            >
                              {x.r.university} · {x.r.programName}
                            </button>
                          </span>
                        ))}
                        {noDeadline.length > 8 && ` +${noDeadline.length - 8} more`}
                      </span>
                    </li>
                  )}
                </ul>
              </section>
            )}

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by university, programme, city or notes…"
                className="min-w-[220px] flex-1 rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:border-indigo-400 focus:outline-none"
              />
              <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className={select}>
                <option value="">Any country</option>
                {countriesInPlan.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} className={select}>
                <option value="deadline">Sort: Deadline</option>
                <option value="interest">Sort: Interest</option>
                <option value="status">Sort: Status</option>
                <option value="university">Sort: University</option>
                <option value="country">Sort: Country</option>
                <option value="checklist">Sort: Checklist (least done)</option>
              </select>
            </div>

            {rows.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-slate-500">No programme matches these filters.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                      <th className="px-2 py-1.5">University / Programme</th>
                      <th className="px-2 py-1.5">Interest</th>
                      <th className="px-2 py-1.5">Deadline</th>
                      <th className="px-2 py-1.5">Tuition / int’l</th>
                      <th className="px-2 py-1.5">Scholarship</th>
                      <th className="px-2 py-1.5">Checklist</th>
                      <th className="px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ entry, r, settled }) => (
                      <tr key={entry.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                        <td className="max-w-[300px] px-2 py-2">
                          <button
                            onClick={() => navigate(`/masters/plan/${entry.id}`)}
                            className="text-left text-[13.5px] font-medium text-slate-900 hover:text-indigo-700 hover:underline"
                          >
                            {r.university}
                          </button>
                          <div className="text-[12px] leading-snug text-slate-600">
                            {r.programName}
                            {entry.ref.kind === 'custom' && (
                              <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-800">
                                custom
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {r.countryPolicy && <Flag code={r.countryPolicy.code} />}
                            {[r.city, r.country].filter(Boolean).join(', ')}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <StatusSelect
                            value={entry.interest}
                            options={INTEREST_ORDER}
                            labels={INTEREST_LABELS}
                            onChange={(v) => plan.update(entry.id, { interest: v })}
                          />
                        </td>
                        <td className="min-w-[120px] px-2 py-2 text-[12.5px]">
                          <DeadlineCell r={r.deadline} settled={settled} />
                        </td>
                        <td className="max-w-[180px] px-2 py-2 text-[12px]">
                          {r.tuition.text ? (
                            <div title={r.tuition.note}>
                              <span className="text-slate-700">{r.tuition.text}</span>
                              {r.tuition.origin !== 'program' && (
                                <div className="text-[10px] italic text-slate-400">
                                  {originLabel(r.tuition, r.countryPolicy)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="italic text-amber-700">{UNKNOWN_LABEL}</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {r.scholarshipLevel ? (
                            <ScholarshipChip level={r.scholarshipLevel} />
                          ) : (
                            <span className="text-[10.5px] italic text-slate-400">not in database</span>
                          )}
                          {entry.scholarship !== 'undecided' && (
                            <div className="mt-0.5 text-[10.5px] text-slate-500">
                              mine: {SCHOLARSHIP_LABELS[entry.scholarship]}
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <ChecklistProgress items={entry.checklist} />
                        </td>
                        <td className="px-2 py-2">
                          <StatusSelect
                            value={entry.status}
                            options={STATUS_ORDER}
                            labels={STATUS_LABELS}
                            onChange={(v) => plan.update(entry.id, { status: v })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[10.5px] text-slate-400">
              Values you type on a programme’s page win over the database’s; empty ones fall back to it, and
              anything neither has stays “{UNKNOWN_LABEL}”. Saved in this browser and included in the tracker’s
              backup / Drive sync.
            </p>
          </>
        )}
      </div>

      {adding && (
        <AddToPlanModal
          data={data}
          plan={plan}
          onClose={() => setAdding(false)}
          onCustomAdded={(id) => {
            setAdding(false)
            navigate(`/masters/plan/${id}`)
          }}
        />
      )}
    </main>
  )
}
