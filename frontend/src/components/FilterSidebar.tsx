import type { DegreeType, Region } from '../types'
import type { Facets, Filters } from '../lib/filters'
import { isDefault, subKey } from '../lib/filters'
import type { FieldEntry } from '../lib/dataLoader'
import { FieldSearch } from './FieldSearch'

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
}) {
  const feeUnlimited = filters.maxFee >= facets.feeCap

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

        <SectionTitle>Discipline</SectionTitle>
        <div className="mb-2">
          <FieldSearch fields={fields} onPick={onPickField} />
        </div>
        <div className="space-y-2">
          {facets.disciplines.map(({ primary, subs, count }) => (
            <div key={primary}>
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium text-slate-800">
                <input
                  type="checkbox"
                  className="size-3.5 accent-indigo-600"
                  checked={filters.primaries.has(primary)}
                  onChange={() =>
                    onChange({ ...filters, primaries: toggled(filters.primaries, primary) })
                  }
                />
                <span className="flex-1">{primary}</span>
                {loadingFields.has(primary) && (
                  <span className="animate-pulse text-[10px] font-normal text-indigo-500">
                    loading…
                  </span>
                )}
                <span className="text-[10px] tabular-nums text-slate-400">{count}</span>
              </label>
              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                {subs.map((sub) => {
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
                })}
              </div>
            </div>
          ))}
        </div>

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
