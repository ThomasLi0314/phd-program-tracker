import { useState } from 'react'
import type { DegreeType, Region } from '../types'
import type { Facets, Filters } from '../lib/filters'
import { isDefault, subKey } from '../lib/filters'
import type { FieldEntry } from '../lib/dataLoader'
import { FieldSearch } from './FieldSearch'
import { FieldPicker } from './FieldPicker'

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="mb-1.5 mt-4 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 first:mt-0">
      {children}
    </h3>
  )
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

export function FilterSidebar({
  facets,
  filters,
  onChange,
  matchCount,
  totalCount,
  metaNote,
  fields,
  loadingFields,
  onPickField,
  shownFields,
  onToggleShownField,
  onSetShownFields,
  onClearShownFields,
  showDiscipline,
}: {
  facets: Facets
  filters: Filters
  onChange: (f: Filters) => void
  matchCount: number
  totalCount: number
  metaNote: string
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
}) {
  const feeUnlimited = filters.maxFee >= facets.feeCap
  // Fields whose advisor-less sub-fields are currently revealed.
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set())
  const toggleExpanded = (primary: string) =>
    setExpandedSubs((prev) => toggled(prev, primary))

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
  // Per field, the set of sub-fields that actually have advisors scanned.
  const advSubsByPrimary = new Map(fields.map((f) => [f.primary, new Set(f.subsWithFaculty)]))

  const renderSub = (primary: string, sub: string) => {
    const key = subKey(primary, sub)
    return (
      <label
        key={key}
        className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900"
      >
        <input
          type="checkbox"
          className="size-3 accent-indigo-600"
          checked={filters.subs.has(key)}
          onChange={() => onChange({ ...filters, subs: toggled(filters.subs, key) })}
        />
        {sub}
      </label>
    )
  }

  const renderDiscipline = ({
    primary,
    subs,
    count,
  }: {
    primary: string
    subs: string[]
    count: number
  }) => {
    const advSubs = advSubsByPrimary.get(primary) ?? new Set<string>()
    const shownSubs = subs.filter((s) => advSubs.has(s))
    const hiddenSubs = subs.filter((s) => !advSubs.has(s))
    const isExpanded = expandedSubs.has(primary)
    return (
      <div key={primary}>
        {/* The ✕ is a sibling of the label, not a child: a button inside a label
            is also a label activation, so it needed preventDefault and stayed
            fragile under keyboard/AT. */}
        <div className="flex items-center gap-1.5">
          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-[13px] font-medium text-slate-800">
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
              <span className="animate-pulse text-[10px] font-normal text-indigo-500">loading…</span>
            )}
            {(facultyCountByPrimary.get(primary) ?? 0) > 0 && (
              <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold tabular-nums text-amber-700">
                {facultyCountByPrimary.get(primary)}★
              </span>
            )}
            <span className="text-[10px] tabular-nums text-slate-400">{count}</span>
          </label>
          <button
            onClick={() => hideField(primary)}
            aria-label={`Hide ${primary} from the sidebar`}
            title={`Hide ${primary} from the sidebar`}
            className="shrink-0 text-[11px] leading-none text-slate-300 transition-colors hover:text-rose-500"
          >
            ✕
          </button>
        </div>
        {(shownSubs.length > 0 || hiddenSubs.length > 0) && (
          <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
            {shownSubs.map((sub) => renderSub(primary, sub))}
            {isExpanded && hiddenSubs.map((sub) => renderSub(primary, sub))}
            {hiddenSubs.length > 0 && (
              <button
                onClick={() => toggleExpanded(primary)}
                className="mt-0.5 text-[10px] font-medium text-slate-400 hover:text-indigo-600"
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
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-slate-200 bg-slate-50/60">
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-semibold text-slate-700">
            {matchCount}
            <span className="font-normal text-slate-400"> / {totalCount} programs</span>
          </span>
          {!isDefault(filters, facets.feeCap) && (
            <button
              className="text-[11px] font-medium text-indigo-600 hover:underline"
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
        </div>

        {showDiscipline ? (
          <>
            <SectionTitle>Discipline</SectionTitle>
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
            </div>
            {visibleDisciplines.length === 0 ? (
              <p className="rounded border border-dashed border-slate-300 px-2 py-3 text-center text-[11px] leading-relaxed text-slate-400">
                No fields shown yet.
                <br />
                Search above or pick from{' '}
                <span className="font-medium text-slate-500">Choose fields</span>.
              </p>
            ) : (
              <div className="space-y-2">{visibleDisciplines.map(renderDiscipline)}</div>
            )}
          </>
        ) : (
          <p className="rounded border border-dashed border-slate-300 px-2 py-2 text-[11px] leading-relaxed text-slate-500">
            This view searches <span className="font-medium">every field</span> — the filters below
            still narrow it.
          </p>
        )}

        <SectionTitle>Degree Type</SectionTitle>
        <div className="flex flex-wrap gap-1">
          {facets.degrees.map((d) => {
            const active = filters.degrees.has(d)
            const label =
              d === 'MSc' ? 'MSc (European)' : d === 'MRes' ? 'MRes (Research)' : 'PhD'
            return (
              <button
                key={d}
                onClick={() =>
                  onChange({ ...filters, degrees: toggled(filters.degrees, d as DegreeType) })
                }
                className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

        <SectionTitle>Hard Requirements</SectionTitle>
        <label className="flex cursor-pointer items-center justify-between gap-2 text-xs text-slate-700">
          <span>
            GRE Optional / Not&nbsp;Required
            <span className="block text-[10px] text-slate-400">hide GRE-required programs</span>
          </span>
          <input
            type="checkbox"
            className="size-3.5 accent-indigo-600"
            checked={filters.greFriendly}
            onChange={() => onChange({ ...filters, greFriendly: !filters.greFriendly })}
          />
        </label>

        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs text-slate-700">
            <span>Application fee</span>
            <span className="font-medium tabular-nums text-slate-900">
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
            <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-500">
              <input
                type="checkbox"
                className="size-3 accent-indigo-600"
                checked={filters.includeUnknownFee}
                onChange={() =>
                  onChange({ ...filters, includeUnknownFee: !filters.includeUnknownFee })
                }
              />
              include fee-unknown programs
            </label>
          )}
        </div>

        <SectionTitle>Region</SectionTitle>
        <div className="flex flex-wrap gap-1">
          {facets.regions.map((r) => {
            const active = filters.regions.has(r)
            return (
              <button
                key={r}
                onClick={() =>
                  onChange({ ...filters, regions: toggled(filters.regions, r as Region) })
                }
                className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
                }`}
              >
                {r}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-slate-200 px-3 py-2">
        <p className="text-[10px] leading-snug text-slate-400">{metaNote}</p>
      </div>
    </aside>
  )
}
