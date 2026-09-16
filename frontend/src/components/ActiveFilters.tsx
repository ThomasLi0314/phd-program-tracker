// The conditions currently narrowing the list, each removable in place. With
// the sidebar collapsed this is the only thing that says why a program is
// missing — an invisible filter is the worst kind.

import type { Facets, Filters } from '../lib/filters'
import { isDefault, defaultFilters } from '../lib/filters'

interface Chip {
  key: string
  label: string
  remove: () => void
}

export function ActiveFilters({
  filters,
  facets,
  onChange,
}: {
  filters: Filters
  facets: Facets
  onChange: (f: Filters) => void
}) {
  if (isDefault(filters, facets.feeCap)) return null

  const subLabel = (key: string): string => {
    const [primary, canonical] = key.split('|')
    const d = facets.disciplines.find((x) => x.primary === primary)
    return d?.subs.find((s) => s.key === canonical)?.label ?? canonical
  }
  const without = <T,>(set: Set<T>, v: T) => new Set([...set].filter((x) => x !== v))

  const chips: Chip[] = [
    ...[...filters.primaries].map((p) => ({
      key: `p:${p}`,
      label: p,
      remove: () =>
        onChange({
          ...filters,
          primaries: without(filters.primaries, p),
          // Dropping a field also drops its sub-field picks, or they would keep
          // filtering with no visible owner.
          subs: new Set([...filters.subs].filter((k) => !k.startsWith(`${p}|`))),
        }),
    })),
    ...[...filters.subs].map((k) => ({
      key: `s:${k}`,
      label: subLabel(k),
      remove: () => onChange({ ...filters, subs: without(filters.subs, k) }),
    })),
    ...[...filters.degrees].map((d) => ({
      key: `d:${d}`,
      label: d,
      remove: () => onChange({ ...filters, degrees: without(filters.degrees, d) }),
    })),
    ...[...filters.regions].map((r) => ({
      key: `r:${r}`,
      label: r,
      remove: () => onChange({ ...filters, regions: without(filters.regions, r) }),
    })),
    ...(filters.greFriendly
      ? [{ key: 'gre', label: 'GRE optional', remove: () => onChange({ ...filters, greFriendly: false }) }]
      : []),
    ...(filters.maxFee < facets.feeCap
      ? [
          {
            key: 'fee',
            label: `Fee ≤ $${filters.maxFee}${filters.includeUnknownFee ? '' : ' · known only'}`,
            remove: () => onChange({ ...filters, maxFee: facets.feeCap, includeUnknownFee: true }),
          },
        ]
      : []),
  ]

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filters</span>
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.remove}
          title={`Remove: ${c.label}`}
          className="group inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[12px] font-medium text-indigo-800 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
        >
          {c.label}
          <span className="text-indigo-400 group-hover:text-rose-500">✕</span>
        </button>
      ))}
      <button
        onClick={() => onChange(defaultFilters(facets.feeCap))}
        className="ml-1 text-[12px] font-medium text-slate-500 underline decoration-dotted hover:text-slate-800"
      >
        Clear all
      </button>
    </div>
  )
}
