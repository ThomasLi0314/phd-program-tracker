// Planner-focused program table (spec §22): dense, sortable, filterable — and
// exportable to a real spreadsheet in the same order it is shown.

import { useMemo, useState } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { Program } from '../../types'
import type { PlannerFaculty, PlannerProgram, PlannerState } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'
import { facultyOccurrences, programIdentity, resolveProgram } from '../lib/referenceBridge'
import { isLikelyRecruiting } from '../lib/recruitment'
import { formatDeadline, resolveDeadline } from '../lib/deadlines'
import { money, rentShare, SCOPE_LABEL, stipendShort, useHousing, type HousingPlace } from '../../lib/costOfLiving'
import { effectiveContact, findRecord, useOutreachSnapshot } from '../lib/outreachBridge'
import {
  APPLICATION_LABELS,
  APPLICATION_ORDER,
  APPLICATION_TONES,
  CONTACT_LABELS,
  FUNDING_LABELS,
  INTEREST_LABELS,
  INTEREST_ORDER,
  UNKNOWN_LABEL,
} from '../lib/labels'
import { StatusChip, StatusSelect } from '../components/StatusChip'
import { AddProgramModal } from '../components/AddProgramModal'
import { exportPlannerExcel, type ExportProgramRow } from '../lib/exportExcel'

type SortKey = 'university' | 'interest' | 'deadline' | 'status' | 'faculty'

/**
 * The bar above each group of programs. A category is the user's own heading,
 * so it can be renamed here and deleted without touching the programs under it
 * — they simply become uncategorised.
 */
function CategoryHeader({
  name,
  count,
  onRename,
  onRemove,
}: {
  name: string
  count: number
  onRename?: (name: string) => void
  onRemove?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [confirming, setConfirming] = useState(false)

  if (editing && onRename) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onRename(draft)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onRename(draft)
            setEditing(false)
          }
          if (e.key === 'Escape') {
            setDraft(name)
            setEditing(false)
          }
        }}
        className="w-56 rounded border border-indigo-300 px-1.5 py-0.5 text-[13px] font-semibold text-slate-900 focus:outline-none"
      />
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-serif text-[14px] font-bold text-slate-900">{name}</span>
      <span className="text-[11.5px] text-slate-500">
        {count} program{count === 1 ? '' : 's'}
      </span>
      {onRename && (
        <button
          onClick={() => {
            setDraft(name)
            setEditing(true)
          }}
          className="text-[11.5px] text-slate-500 hover:text-indigo-700"
        >
          rename
        </button>
      )}
      {onRemove &&
        (confirming ? (
          <span className="flex items-center gap-1.5 text-[11.5px]">
            <span className="text-slate-600">Delete this category? Its programs stay.</span>
            <button onClick={onRemove} className="font-semibold text-rose-700 hover:underline">
              delete
            </button>
            <button onClick={() => setConfirming(false)} className="text-slate-500 hover:underline">
              cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-[11.5px] text-slate-400 hover:text-rose-600"
          >
            delete
          </button>
        ))}
    </div>
  )
}

/**
 * Stipend and rent for one row. The stipend is the dataset's (an official page
 * states it); rent is the average near that university. A share is shown only
 * when the two are in the same currency and the stipend covers a whole year.
 */
function StipendCell({ live, place }: { live: Program | null; place: HousingPlace | null }) {
  const s = live?.requirements.funding.stipend
  const short = s ? stipendShort(s) : null
  const share = rentShare(s, place)
  return (
    <div>
      {short ? (
        <span className="font-medium text-slate-800" title={s!.quote ? `"${s!.quote}"` : undefined}>
          {short}
        </span>
      ) : s ? (
        <span className="italic text-amber-700">None published</span>
      ) : (
        <span className="italic text-slate-400">—</span>
      )}
      {place?.average != null && (
        <div className="text-[11px] text-slate-500">
          rent {money(place.average, place.currency)}
          {share != null && (
            <span className={share > 0.5 ? ' text-rose-600' : share > 0.35 ? ' text-amber-700' : ' text-emerald-700'}>
              {' '}
              · {Math.round(share * 100)}%
            </span>
          )}
        </div>
      )}
    </div>
  )
}

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
  const [newCategory, setNewCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [interestFilter, setInterestFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortKey>('university')
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const outreach = useOutreachSnapshot()
  // Stipends ride on the dataset program; rent comes from data/housing.json.
  const { placeFor } = useHousing()

  const facultyById = useMemo(() => new Map(state.faculty.map((f) => [f.id, f])), [state.faculty])

  const rows = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
    const out = state.programs
      .map((entry) => {
        const live = resolveProgram(entry, pool.byId)
        const id = programIdentity(entry, live)
        const linked = entry.facultyIds
          .map((fid) => facultyById.get(fid))
          .filter((f): f is PlannerFaculty => !!f)
        return {
          entry,
          live,
          id,
          linked,
          savedFaculty: linked.length,
          likelyRecruiting: linked.filter((f) => isLikelyRecruiting(f.recruiting.value ?? 'unknown')).length,
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

  /**
   * Rows under the user's own headings, in the order they made them, with
   * whatever is unfiled last. Without categories there is one unnamed group and
   * the table looks exactly as it did before.
   */
  const groups = useMemo(() => {
    const known = new Set(state.categories.map((c) => c.id))
    const out = state.categories.map((c) => ({
      id: c.id,
      name: c.name,
      rows: rows.filter((r) => r.entry.categoryId === c.id),
    }))
    const rest = rows.filter((r) => !r.entry.categoryId || !known.has(r.entry.categoryId))
    if (rest.length || out.length === 0) out.push({ id: '', name: 'No category', rows: rest })
    return out
  }, [rows, state.categories])
  const grouped = state.categories.length > 0

  /**
   * The rows exactly as the table shows them — same filter, same order — with
   * each program's linked faculty. Unknown values are written as the same
   * "Unknown / Verify" the planner shows; nothing is guessed to fill a cell.
   */
  const buildExport = (): ExportProgramRow[] =>
    rows.map(({ entry, live, id, linked }) => {
      const parsed = resolveDeadline(entry.admissions.deadline, live?.requirements.deadline)
      const deadline =
        parsed.kind === 'dated' && parsed.iso
          ? `${formatDeadline(parsed.iso)}${parsed.yearInferred ? ' (year inferred)' : ''}`
          : parsed.kind === 'rolling'
            ? 'Rolling'
            : parsed.kind === 'paused'
              ? 'Paused'
              : UNKNOWN_LABEL
      const funding = entry.funding.level?.value ? FUNDING_LABELS[entry.funding.level.value] : UNKNOWN_LABEL
      const s = live?.requirements.funding.stipend
      const short = s ? stipendShort(s) : null
      const stipend = short
        ? `${short}${s!.scope ? ` (${(SCOPE_LABEL[s!.scope] ?? '').toLowerCase()}${s!.academic_year ? `, ${s!.academic_year}` : ''})` : ''}`
        : s
          ? 'No official figure found'
          : UNKNOWN_LABEL
      const place = placeFor(id.university)
      const share = rentShare(s, place)
      const rent =
        place && place.average != null
          ? `${money(place.average, place.currency)}/mo — ${place.city}${share != null ? ` — ${Math.round(share * 100)}% of stipend` : ''}`
          : UNKNOWN_LABEL
      const advisors = linked.map((f) => {
        const occ =
          f.ref.kind === 'database'
            ? facultyOccurrences(f.ref.mergeKey, pool.programs).map((o) => ({
                programId: o.program.id,
                facultyId: o.faculty.id,
              }))
            : []
        const eff = effectiveContact(f, findRecord(f, outreach, occ))
        return {
          name: f.name,
          status: CONTACT_LABELS[eff.status],
          research: f.themes.slice(0, 5).join('; '),
          link: f.links.faculty || f.links.personal || f.links.lab || f.links.scholar || '',
        }
      })
      const category = state.categories.find((c) => c.id === entry.categoryId)?.name ?? ''
      return {
        category,
        university: id.university,
        program: `${id.programName}${id.degree ? ` (${id.degree})` : ''}`,
        deadline,
        funding,
        stipend,
        rent,
        status: APPLICATION_LABELS[entry.status],
        notes: entry.notes.trim(),
        link: id.website || id.portal || '',
        advisors,
      }
    })

  const doExport = async () => {
    setExporting(true)
    setExportError(null)
    try {
      await exportPlannerExcel(buildExport(), { cycle: state.settings.cycle, exportedAt: new Date() })
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e))
    } finally {
      setExporting(false)
    }
  }

  const select =
    'rounded border border-slate-300 bg-white px-1.5 py-1 text-[12px] text-slate-700 focus:border-indigo-400 focus:outline-none'
  const filtersActive = !!query.trim() || !!interestFilter || !!statusFilter

  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-lg font-bold text-slate-900">Programs</h1>
            <p className="text-[12.5px] text-slate-600">
              {state.programs.length} in your plan · target cycle {state.settings.cycle}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              onClick={() => void doExport()}
              disabled={exporting || rows.length === 0}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
              title={
                filtersActive
                  ? `Export the ${rows.length} programs currently listed, in this order, with their saved faculty`
                  : 'Export every program in the plan, in the current order, with its saved faculty'
              }
            >
              {exporting ? 'Exporting…' : `Export Excel${filtersActive ? ` (${rows.length})` : ''}`}
            </button>
            <button
              onClick={() => setNewCategory('')}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-700"
              title="Group your programs under headings you name yourself"
            >
              + Category
            </button>
            <button
              onClick={() => setAdding(true)}
              className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              + Add Program
            </button>
          </div>
        </div>
        {exportError && <p className="mb-2 text-[12px] font-medium text-rose-600">Export failed: {exportError}</p>}

        {newCategory !== null && (
          <form
            className="mb-2 flex flex-wrap items-center gap-2 rounded border border-indigo-200 bg-indigo-50/60 px-2.5 py-2"
            onSubmit={(e) => {
              e.preventDefault()
              planner.addCategory(newCategory)
              setNewCategory(null)
            }}
          >
            <span className="text-[12px] font-medium text-slate-700">New category</span>
            <input
              autoFocus
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="e.g. Reach · Ocean modelling · Europe"
              className="min-w-[220px] flex-1 rounded border border-slate-300 px-2 py-1 text-[12.5px] focus:border-indigo-400 focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newCategory.trim()}
              className="rounded bg-indigo-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setNewCategory(null)}
              className="text-[12px] text-slate-500 hover:underline"
            >
              cancel
            </button>
          </form>
        )}

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
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-slate-600">
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
          <p className="py-10 text-center text-[13px] text-slate-500">No program matches these filters.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  <th className="px-2 py-1.5">University / Program</th>
                  <th className="px-2 py-1.5">Interest</th>
                  <th className="px-2 py-1.5">Deadline</th>
                  <th className="px-2 py-1.5">GRE</th>
                  <th className="px-2 py-1.5">Funding</th>
                  <th className="px-2 py-1.5" title="Stipend an official page states · a year of rent as a share of it">
                    Stipend / rent
                  </th>
                  <th className="px-2 py-1.5 text-right" title="Saved faculty · likely recruiting">
                    Faculty
                  </th>
                  <th className="px-2 py-1.5">Application</th>
                </tr>
              </thead>
              {groups.map((g) => (
              <tbody key={g.id || 'none'}>
                {grouped && (
                  <tr className="bg-slate-100/70">
                    <td colSpan={8} className="px-2 py-1.5">
                      <CategoryHeader
                        name={g.name}
                        count={g.rows.length}
                        onRename={g.id ? (name) => planner.renameCategory(g.id, name) : undefined}
                        onRemove={g.id ? () => planner.removeCategory(g.id) : undefined}
                      />
                    </td>
                  </tr>
                )}
                {g.rows.map(({ entry, live, id, savedFaculty, likelyRecruiting }) => (
                  <tr key={entry.id} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/60">
                    <td className="px-2 py-2">
                      <button
                        onClick={() => navigate(`/planner/programs/${entry.id}`)}
                        className="text-left text-[13.5px] font-medium text-slate-900 hover:text-indigo-700 hover:underline"
                      >
                        {id.university}
                      </button>
                      <div className="text-[12px] text-slate-600">
                        {id.programName}
                        {!id.fromDatabase && (
                          <span className="ml-1 rounded bg-amber-100 px-1 py-px text-[10px] font-medium text-amber-800">
                            custom
                          </span>
                        )}
                      </div>
                      {grouped && (
                        <select
                          value={entry.categoryId ?? ''}
                          onChange={(e) => planner.setProgramCategory(entry.id, e.target.value || null)}
                          title="Which of your categories this program belongs to"
                          className="mt-1 rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-600 focus:border-indigo-400 focus:outline-none"
                        >
                          <option value="">No category</option>
                          {state.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <StatusSelect
                        value={entry.interest}
                        options={INTEREST_ORDER}
                        labels={INTEREST_LABELS}
                        onChange={(v) => planner.updateProgram(entry.id, { interest: v })}
                      />
                    </td>
                    <td className="px-2 py-2 text-[12.5px]">
                      {entry.admissions.deadline?.value ? (
                        <span className="text-slate-700">{entry.admissions.deadline.value}</span>
                      ) : (
                        <span className="italic text-amber-700">{UNKNOWN_LABEL}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[12.5px]">
                      {entry.admissions.gre?.value ? (
                        <span className="text-slate-700">{entry.admissions.gre.value}</span>
                      ) : (
                        <span className="italic text-amber-700">{UNKNOWN_LABEL}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[12.5px]">
                      {entry.funding.level?.value ? (
                        <span className="text-slate-700">{FUNDING_LABELS[entry.funding.level.value]}</span>
                      ) : (
                        <span className="italic text-amber-700">{UNKNOWN_LABEL}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[12.5px]">
                      <StipendCell live={live} place={placeFor(id.university)} />
                    </td>
                    <td className="px-2 py-2 text-right text-[12.5px] tabular-nums text-slate-700">
                      {savedFaculty}
                      {likelyRecruiting > 0 && (
                        <span className="ml-1 text-emerald-600" title="likely recruiting">
                          ({likelyRecruiting})
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <StatusChip label={APPLICATION_LABELS[entry.status]} tone={APPLICATION_TONES[entry.status]} />
                    </td>
                  </tr>
                ))}
              </tbody>
              ))}
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
