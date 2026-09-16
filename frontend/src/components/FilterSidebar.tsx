import { useMemo, useState } from 'react'
import type { DegreeType, Region } from '../types'
import type { Facets, Filters } from '../lib/filters'
import { activeFilterCount, isDefault, subKey } from '../lib/filters'
import type { FieldEntry } from '../lib/dataLoader'
import { canonicalSub } from '../lib/subfields'
import { usePref } from '../lib/viewPrefs'
import { FieldSearch } from './FieldSearch'
import { FieldPicker } from './FieldPicker'

type GroupId = 'fields' | 'degree' | 'region' | 'requirements'

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

/** A collapsible filter group. The open state survives a reload. */
function Group({
  id,
  title,
  open,
  onToggle,
  active,
  children,
}: {
  id: GroupId
  title: string
  open: boolean
  onToggle: (id: GroupId) => void
  /** number of active conditions inside, shown while collapsed */
  active: number
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-slate-200 py-2 last:border-0">
      <button
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between py-0.5 text-left"
        aria-expanded={open}
      >
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">
          {title}
          {!open && active > 0 && (
            <span className="ml-1.5 rounded-full bg-indigo-100 px-1.5 text-[10.5px] font-semibold tabular-nums normal-case tracking-normal text-indigo-700">
              {active}
            </span>
          )}
        </span>
        <span className="text-[11px] text-slate-400">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </section>
  )
}

export function FilterSidebar({
  facets,
  filters,
  onChange,
  matchCount,
  loading,
  fields,
  loadingFields,
  onPickField,
  shownFields,
  onToggleShownField,
  onSetShownFields,
  onClearShownFields,
  showDiscipline,
  collapsed,
  onToggleCollapsed,
}: {
  facets: Facets
  filters: Filters
  onChange: (f: Filters) => void
  matchCount: number
  /** true while a selected field's data is still arriving — the count is not yet true */
  loading: boolean
  fields: FieldEntry[]
  loadingFields: Set<string>
  onPickField: (primary: string) => void
  /** Fields the user chose to list here. Starts empty — see lib/sidebarFields. */
  shownFields: Set<string>
  onToggleShownField: (primary: string) => void
  onSetShownFields: (primaries: string[]) => void
  onClearShownFields: () => void
  /** The advisor/school views search the whole database, so ticking a discipline
   *  there does nothing — don't offer a control that has no effect. */
  showDiscipline: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
}) {
  const feeUnlimited = filters.maxFee >= facets.feeCap
  const [openGroups, setOpenGroups] = usePref<Record<GroupId, boolean>>('filterGroups', {
    fields: true,
    degree: true,
    region: true,
    requirements: true,
  })
  const toggleGroup = (id: GroupId) => setOpenGroups((g) => ({ ...g, [id]: !g[id] }))

  // Fields whose advisor-less sub-fields are currently revealed.
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set())
  const [subQuery, setSubQuery] = useState('')
  const subTerm = subQuery.trim().toLowerCase()

  // The sidebar lists the fields the user chose, plus any field with an active
  // filter — a checked field must never be hidden, or it would filter invisibly.
  const activePrimaries = new Set([
    ...filters.primaries,
    ...[...filters.subs].map((k) => k.split('|')[0]),
  ])
  const visibleDisciplines = facets.disciplines.filter(
    (d) => shownFields.has(d.primary) || activePrimaries.has(d.primary),
  )

  /** Drop a field from the sidebar AND clear its filters — a hidden field that
   *  kept narrowing the results would be an invisible filter. */
  const hideField = (primary: string) => {
    onChange({
      ...filters,
      primaries: new Set([...filters.primaries].filter((p) => p !== primary)),
      subs: new Set([...filters.subs].filter((k) => k.split('|')[0] !== primary)),
    })
    onToggleShownField(primary)
  }

  /** One click in the picker = list it and tick it; the two-step (list, then
   *  hunt for the checkbox) reads as if the picker did nothing. */
  const togglePicked = (primary: string) =>
    shownFields.has(primary) ? hideField(primary) : onPickField(primary)

  const facultyCountByPrimary = new Map(fields.map((f) => [f.primary, f.facultyCount]))
  // Per field, the canonical keys of sub-fields that actually have advisors scanned.
  const advSubsByPrimary = useMemo(
    () => new Map(fields.map((f) => [f.primary, new Set(f.subsWithFaculty.map(canonicalSub))])),
    [fields],
  )

  const total = activeFilterCount(filters, facets.feeCap)
  const activeIn: Record<GroupId, number> = {
    fields: filters.primaries.size + filters.subs.size,
    degree: filters.degrees.size,
    region: filters.regions.size,
    requirements: (filters.greFriendly ? 1 : 0) + (feeUnlimited ? 0 : 1),
  }

  if (collapsed) {
    return (
      <aside className="flex h-full w-9 shrink-0 flex-col items-center border-r border-slate-200 bg-slate-50/80 py-2">
        <button
          onClick={onToggleCollapsed}
          title="Show filters"
          aria-label="Show filters"
          className="flex flex-col items-center gap-1 rounded px-1 py-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
        >
          <span className="text-[12px]">▸</span>
          <span className="text-[11px] font-semibold uppercase tracking-wider [writing-mode:vertical-rl]">
            Filters
          </span>
          {total > 0 && (
            <span className="rounded-full bg-indigo-600 px-1.5 text-[10.5px] font-bold text-white">{total}</span>
          )}
        </button>
      </aside>
    )
  }

  const chip = (active: boolean) =>
    `rounded border px-2 py-0.5 text-[12px] font-medium transition-colors ${
      active
        ? 'border-indigo-600 bg-indigo-600 text-white'
        : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400'
    }`

  const renderSub = (primary: string, key: string, label: string) => {
    const k = subKey(primary, key)
    return (
      <label
        key={k}
        className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-slate-700 hover:text-slate-900"
      >
        <input
          type="checkbox"
          className="size-3.5 accent-indigo-600"
          checked={filters.subs.has(k)}
          onChange={() => onChange({ ...filters, subs: toggled(filters.subs, k) })}
        />
        {label}
      </label>
    )
  }

  const renderDiscipline = ({
    primary,
    subs,
    count,
  }: {
    primary: string
    subs: { key: string; label: string }[]
    count: number
  }) => {
    const advSubs = advSubsByPrimary.get(primary) ?? new Set<string>()
    // A search term reveals every matching sub-field, scanned or not.
    const matches = (s: { label: string }) => !subTerm || s.label.toLowerCase().includes(subTerm)
    const shownSubs = subs.filter((s) => (advSubs.has(s.key) || filters.subs.has(subKey(primary, s.key))) && matches(s))
    const hiddenSubs = subs.filter((s) => !advSubs.has(s.key) && !filters.subs.has(subKey(primary, s.key)) && matches(s))
    const isExpanded = expandedSubs.has(primary) || (subTerm !== '' && hiddenSubs.length <= 12)
    return (
      <div key={primary}>
        <div className="flex items-center gap-1.5">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-[13px] font-medium text-slate-900">
            <input
              type="checkbox"
              className="size-3.5 accent-indigo-600"
              checked={filters.primaries.has(primary)}
              onChange={() =>
                onChange({ ...filters, primaries: toggled(filters.primaries, primary) })
              }
            />
            <span className="min-w-0 flex-1 truncate">{primary}</span>
            {loadingFields.has(primary) && (
              <span className="animate-pulse text-[11px] font-normal text-indigo-500">loading…</span>
            )}
            {(facultyCountByPrimary.get(primary) ?? 0) > 0 && (
              <span
                className="rounded bg-amber-100 px-1 text-[10.5px] font-semibold tabular-nums text-amber-800"
                title={`${facultyCountByPrimary.get(primary)} advisors scanned in this field`}
              >
                {facultyCountByPrimary.get(primary)}★
              </span>
            )}
            <span className="text-[11px] tabular-nums text-slate-500">{count}</span>
          </label>
          <button
            onClick={() => hideField(primary)}
            aria-label={`Hide ${primary} from the sidebar`}
            title={`Hide ${primary} from the sidebar`}
            className="shrink-0 text-[12px] leading-none text-slate-400 transition-colors hover:text-rose-500"
          >
            ✕
          </button>
        </div>
        {(shownSubs.length > 0 || hiddenSubs.length > 0) && (
          <div className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
            {shownSubs.map((s) => renderSub(primary, s.key, s.label))}
            {isExpanded && hiddenSubs.map((s) => renderSub(primary, s.key, s.label))}
            {hiddenSubs.length > 0 && !(subTerm !== '' && hiddenSubs.length <= 12) && (
              <button
                onClick={() => setExpandedSubs((prev) => toggled(prev, primary))}
                className="mt-0.5 text-[11.5px] font-medium text-slate-500 hover:text-indigo-600"
              >
                {isExpanded
                  ? '▾ fewer sub-fields'
                  : `▸ ${hiddenSubs.length} more sub-field${hiddenSubs.length === 1 ? '' : 's'}${
                      shownSubs.length === 0 ? ' (no advisors yet)' : ''
                    }`}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-[13px] font-semibold text-slate-800">
          {loading ? (
            <span className="animate-pulse text-slate-500">loading…</span>
          ) : (
            <>
              {matchCount.toLocaleString()}
              <span className="font-normal text-slate-500"> programs</span>
            </>
          )}
        </span>
        <div className="flex items-center gap-2">
          {!isDefault(filters, facets.feeCap) && (
            <button
              className="text-[12px] font-medium text-indigo-600 hover:underline"
              onClick={() =>
                onChange({
                  primaries: new Set(),
                  subs: new Set(),
                  degrees: new Set(),
                  regions: new Set(),
                  greFriendly: false,
                  maxFee: facets.feeCap,
                  includeUnknownFee: true,
                })
              }
            >
              Reset
            </button>
          )}
          <button
            onClick={onToggleCollapsed}
            title="Hide filters"
            aria-label="Hide filters"
            className="rounded px-1 text-[12px] text-slate-500 hover:bg-slate-200 hover:text-slate-900"
          >
            ◂
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3">
        <Group id="fields" title="Fields" open={openGroups.fields} onToggle={toggleGroup} active={activeIn.fields}>
          {showDiscipline ? (
            <>
              <div className="mb-2 space-y-1.5">
                <FieldSearch fields={fields} onPick={onPickField} />
                <FieldPicker
                  fields={fields}
                  shown={shownFields}
                  onToggle={togglePicked}
                  onSetAll={onSetShownFields}
                  onClear={() => {
                    onClearShownFields()
                    onChange({ ...filters, primaries: new Set(), subs: new Set() })
                  }}
                />
                {visibleDisciplines.length > 0 && (
                  <input
                    value={subQuery}
                    onChange={(e) => setSubQuery(e.target.value)}
                    placeholder="Find a sub-field, e.g. ocean…"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                  />
                )}
              </div>
              {visibleDisciplines.length === 0 ? (
                <p className="rounded border border-dashed border-slate-300 px-2 py-3 text-center text-[12px] leading-relaxed text-slate-500">
                  No fields listed yet.
                  <br />
                  Search above or pick from <span className="font-medium text-slate-700">Choose fields</span>.
                </p>
              ) : (
                <div className="space-y-2.5">{visibleDisciplines.map(renderDiscipline)}</div>
              )}
            </>
          ) : (
            <p className="rounded border border-dashed border-slate-300 px-2 py-2 text-[12px] leading-relaxed text-slate-600">
              This view searches <span className="font-medium">every field</span>. The groups below
              still narrow it.
            </p>
          )}
        </Group>

        <Group id="degree" title="Degree" open={openGroups.degree} onToggle={toggleGroup} active={activeIn.degree}>
          <div className="flex flex-wrap gap-1">
            {facets.degrees.map((d) => (
              <button
                key={d}
                onClick={() => onChange({ ...filters, degrees: toggled(filters.degrees, d as DegreeType) })}
                className={chip(filters.degrees.has(d))}
              >
                {d === 'MSc' ? 'MSc' : d === 'MRes' ? 'MRes' : 'PhD'}
              </button>
            ))}
          </div>
        </Group>

        <Group id="region" title="Region" open={openGroups.region} onToggle={toggleGroup} active={activeIn.region}>
          <div className="flex flex-wrap gap-1">
            {facets.regions.map((r) => (
              <button
                key={r}
                onClick={() => onChange({ ...filters, regions: toggled(filters.regions, r as Region) })}
                className={chip(filters.regions.has(r))}
              >
                {r}
              </button>
            ))}
          </div>
        </Group>

        <Group
          id="requirements"
          title="Requirements"
          open={openGroups.requirements}
          onToggle={toggleGroup}
          active={activeIn.requirements}
        >
          <label className="flex cursor-pointer items-center justify-between gap-2 text-[12.5px] text-slate-800">
            <span>
              GRE optional or not accepted
              <span className="block text-[11px] text-slate-500">hide programs that require it</span>
            </span>
            <input
              type="checkbox"
              className="size-3.5 accent-indigo-600"
              checked={filters.greFriendly}
              onChange={() => onChange({ ...filters, greFriendly: !filters.greFriendly })}
            />
          </label>

          <div className="mt-3">
            <div className="flex items-baseline justify-between text-[12.5px] text-slate-800">
              <span>Application fee</span>
              <span className="font-medium tabular-nums">
                {feeUnlimited ? 'Any' : `≤ $${filters.maxFee}`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={facets.feeCap}
              step={5}
              value={filters.maxFee}
              onChange={(e) => onChange({ ...filters, maxFee: Number(e.target.value) })}
              className="mt-1 w-full accent-indigo-600"
            />
            {!feeUnlimited && (
              <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-600">
                <input
                  type="checkbox"
                  className="size-3.5 accent-indigo-600"
                  checked={filters.includeUnknownFee}
                  onChange={() =>
                    onChange({ ...filters, includeUnknownFee: !filters.includeUnknownFee })
                  }
                />
                include programs with an unknown fee
              </label>
            )}
          </div>
        </Group>
      </div>
    </aside>
  )
}
