// "Europe Master's" — the second page of the program database.
//
// The US PhD side of this app answers "who could advise me". This side answers a
// different question: a taught master's in Europe is something you largely pay
// for, so the columns that matter are cost, funding and whether your English
// certificate clears the bar. It shares the bundle and the hash router with the
// tracker and the planner, and nothing else.

import { useMemo, useState } from 'react'
import { useEurope, applyFilters, countryIndex, emptyFilters, groupByCountry } from './lib/dataset'
import type { Filters } from './lib/dataset'
import { EURO_FIELDS, effectiveTuition, isUnknown } from './types'
import type { CountryPolicy, EuroField, EuroProgram } from './types'
import { DetailCell, Fact, FieldChip, Flag, ScholarshipChip } from './components/Bits'
import { CountryPolicies } from './views/CountryPolicies'

function toggle<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function FilterBar({
  filters,
  setFilters,
  countries,
  counts,
}: {
  filters: Filters
  setFilters: (f: Filters) => void
  countries: CountryPolicy[]
  counts: Map<string, number>
}) {
  const chip = (active: boolean) =>
    `rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset transition-colors ${
      active
        ? 'bg-indigo-600 text-white ring-indigo-600'
        : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
    }`

  return (
    <div className="shrink-0 space-y-2 border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Field
        </span>
        {EURO_FIELDS.map((f) => (
          <button
            key={f}
            className={chip(filters.fields.has(f))}
            onClick={() => setFilters({ ...filters, fields: toggle(filters.fields, f) })}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Country
        </span>
        {countries.map((c) => (
          <button
            key={c.country}
            className={chip(filters.countries.has(c.country))}
            onClick={() => setFilters({ ...filters, countries: toggle(filters.countries, c.country) })}
          >
            <Flag code={c.code} />
            {c.country}
            <span className="ml-1 tabular-nums opacity-60">{counts.get(c.country) ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          Filter
        </span>
        <input
          value={filters.query}
          onChange={(e) => setFilters({ ...filters, query: e.target.value })}
          placeholder="Search university or programme…"
          className="w-64 rounded border border-slate-200 px-2 py-1 text-[12px] outline-none focus:border-indigo-400"
        />
        {(
          [
            ['englishOnly', 'English-taught'],
            ['fundedOnly', 'Has scholarship route'],
            ['phdOnly', 'Also admits PhD'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-1 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={filters[key]}
              onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })}
              className="accent-indigo-600"
            />
            {label}
          </label>
        ))}
        {(filters.countries.size > 0 ||
          filters.fields.size > 0 ||
          filters.query ||
          filters.englishOnly ||
          filters.fundedOnly ||
          filters.phdOnly) && (
          <button
            onClick={() => setFilters(emptyFilters())}
            className="text-[11px] text-slate-400 underline decoration-dotted hover:text-slate-600"
          >
            clear
          </button>
        )}
      </div>
    </div>
  )
}

function ProgramRow({
  p,
  country,
  open,
  onToggle,
}: {
  p: EuroProgram
  country: CountryPolicy | undefined
  open: boolean
  onToggle: () => void
}) {
  const tuition = effectiveTuition(p, country)

  return (
    <>
      <tr
        className={`cursor-pointer border-t border-slate-100 align-top hover:bg-indigo-50/40 ${
          open ? 'bg-indigo-50/60' : ''
        }`}
        onClick={onToggle}
      >
        <td className="py-1.5 pl-3 pr-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[10px] text-slate-300">{open ? '▾' : '▸'}</span>
            <div>
              <div className="text-[12.5px] font-medium leading-tight text-slate-800">{p.program_name}</div>
              <div className="text-[11px] leading-tight text-slate-500">
                {p.university} · {p.city}
              </div>
            </div>
          </div>
        </td>
        <td className="px-2 py-1.5">
          <div className="flex flex-wrap gap-0.5">
            {p.fields.map((f) => (
              <FieldChip key={f} field={f} short />
            ))}
          </div>
        </td>
        <td className="px-2 py-1.5 text-[11.5px] text-slate-600">
          <Fact value={p.language} compact />
        </td>
        <td className="px-2 py-1.5 text-[11.5px] text-slate-600">
          <Fact value={p.duration} compact />
        </td>
        <td className="px-2 py-1.5 text-[11.5px]">
          <div className="font-medium text-slate-800">
            <Fact value={tuition.non_eu} compact />
          </div>
          <div className="text-[10.5px] text-slate-400">
            EU: <Fact value={tuition.eu} compact />
            {tuition.from === 'country' && (
              <span className="ml-1 italic" title={`From the ${p.country} national rule`}>
                · national
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-1.5">
          <ScholarshipChip level={p.scholarship.level} />
        </td>
        <td className="px-2 py-1.5 text-[11.5px] text-slate-600">
          <Fact value={p.english} compact />
        </td>
        <td className="px-2 py-1.5 text-[11.5px] text-slate-600">
          <Fact value={p.deadline} compact />
        </td>
        <td className="px-2 py-1.5 text-center text-[11.5px]">
          {p.phd.value === 'yes' ? (
            <span className="text-emerald-600" title={p.phd.note ?? 'Department also admits doctoral students'}>
              ●
            </span>
          ) : p.phd.value === 'no' ? (
            <span className="text-slate-300">–</span>
          ) : (
            <span className="text-amber-500" title="Unknown / Verify">
              ?
            </span>
          )}
        </td>
        <td className="py-1.5 pl-2 pr-3 text-right">
          <a
            href={p.links.program}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="whitespace-nowrap text-[11px] font-medium text-indigo-600 hover:underline"
          >
            Open ↗
          </a>
        </td>
      </tr>

      {open && (
        <tr className="border-t border-indigo-100 bg-indigo-50/30">
          <td colSpan={10} className="px-3 py-3">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
              <DetailCell label="Tuition — non-EU">
                <Fact value={tuition.non_eu} />
                {tuition.from === 'country' && (
                  <div className="mt-0.5 text-[10.5px] italic text-slate-500">
                    From the {p.country} national rule — the programme page publishes no separate figure.
                  </div>
                )}
              </DetailCell>
              <DetailCell label="Tuition — EU/EEA">
                <Fact value={tuition.eu} />
              </DetailCell>
              <DetailCell label="Scholarships">
                <ScholarshipChip level={p.scholarship.level} />
                {/* The chip already says "not stated"; repeating it as a value
                    below just doubles the noise. */}
                {!isUnknown(p.scholarship) && (
                  <div className="mt-0.5">
                    <Fact value={p.scholarship} />
                  </div>
                )}
              </DetailCell>
              <DetailCell label="Language requirement">
                <Fact value={p.english} />
              </DetailCell>
              <DetailCell label="Deadline">
                <Fact value={p.deadline} />
              </DetailCell>
              <DetailCell label="Doctoral study">
                {p.phd.value === 'yes' ? 'Yes — ' : p.phd.value === 'no' ? 'No — ' : ''}
                {p.phd.note ?? (p.phd.value == null ? 'Unknown / Verify' : '')}
                {p.phd.url && (
                  <>
                    {' '}
                    <a href={p.phd.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                      doctoral page ↗
                    </a>
                  </>
                )}
              </DetailCell>
              <DetailCell label="Fields">
                <div className="flex flex-wrap gap-1">
                  {p.fields.map((f) => (
                    <FieldChip key={f} field={f} />
                  ))}
                </div>
              </DetailCell>
              <DetailCell label="Links">
                <div className="flex flex-col gap-0.5">
                  <a href={p.links.program} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                    Programme page ↗
                  </a>
                  {p.links.admissions && (
                    <a href={p.links.admissions} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                      Admission requirements ↗
                    </a>
                  )}
                  {p.links.tuition && (
                    <a href={p.links.tuition} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                      Fees page ↗
                    </a>
                  )}
                  <span className="text-[10px] text-slate-400">checked {p.checked_at}</span>
                </div>
              </DetailCell>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

const COLUMNS = [
  'Programme',
  'Field',
  'Language',
  'Length',
  'Tuition / year',
  'Scholarship',
  'English',
  'Deadline',
  'PhD',
  '',
]

export default function EuropeApp() {
  const { data, error, loading } = useEurope()
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [tab, setTab] = useState<'programs' | 'countries'>('programs')
  const [openId, setOpenId] = useState<string | null>(null)

  const countries = useMemo(() => (data ? countryIndex(data) : new Map()), [data])
  const shown = useMemo(() => (data ? applyFilters(data.programs, filters) : []), [data, filters])
  const grouped = useMemo(() => groupByCountry(shown), [shown])
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of data?.programs ?? []) m.set(p.country, (m.get(p.country) ?? 0) + 1)
    return m
  }, [data])

  const fieldCounts = useMemo(() => {
    const m = new Map<EuroField, number>()
    for (const p of data?.programs ?? []) for (const f of p.fields) m.set(f, (m.get(f) ?? 0) + 1)
    return m
  }, [data])

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900 px-4 py-2 text-white">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-[15px] font-bold tracking-tight">Europe — Master's Programmes</h1>
          <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-300 ring-1 ring-inset ring-teal-400/40">
            {data?.meta.cycle ?? '…'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {(
            [
              ['programs', `Programmes${data ? ` (${data.programs.length})` : ''}`],
              ['countries', `Country rules${data ? ` (${data.countries.length})` : ''}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`rounded px-2 py-1 text-[11px] font-medium transition-colors ${
                tab === id ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <a
            href="#/planner"
            className="rounded border border-indigo-400/50 bg-indigo-500/15 px-2 py-1 text-[11px] font-medium text-indigo-200 transition-colors hover:bg-indigo-500/25"
          >
            My PhD Planner →
          </a>
          <a
            href="#/"
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700"
          >
            ← US PhD Database
          </a>
        </div>
      </header>

      {loading && (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Loading European programmes…
        </div>
      )}

      {error && (
        <div className="m-4 rounded border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700">
          Could not load <code>data/europe.json</code>: {error}
        </div>
      )}

      {data && tab === 'countries' && <CountryPolicies countries={data.countries} counts={counts} />}

      {data && tab === 'programs' && (
        <>
          <FilterBar filters={filters} setFilters={setFilters} countries={data.countries} counts={counts} />

          <div className="min-h-0 flex-1 overflow-auto">
            {shown.length === 0 ? (
              <div className="p-8 text-center text-[13px] text-slate-400">
                No programme matches these filters.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur">
                  <tr>
                    {COLUMNS.map((c, i) => (
                      <th
                        key={c || i}
                        className="border-b border-slate-200 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-500 first:pl-3 last:pr-3"
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                {grouped.map(([country, programs]) => (
                  <tbody key={country}>
                    <tr>
                      <td colSpan={10} className="bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-500">
                        <Flag code={countries.get(country)?.code ?? 'EU'} />
                        {country}
                        <span className="ml-1.5 font-normal text-slate-400">
                          {programs.length} programme{programs.length === 1 ? '' : 's'}
                        </span>
                        {countries.get(country) && (
                          <span className="ml-2 font-normal text-slate-400">
                            · non-EU tuition:{' '}
                            {isUnknown(countries.get(country)!.tuition.non_eu)
                              ? 'Unknown / Verify'
                              : String(countries.get(country)!.tuition.non_eu.value)}
                          </span>
                        )}
                      </td>
                    </tr>
                    {programs.map((p) => (
                      <ProgramRow
                        key={p.id}
                        p={p}
                        country={countries.get(p.country)}
                        open={openId === p.id}
                        onToggle={() => setOpenId(openId === p.id ? null : p.id)}
                      />
                    ))}
                  </tbody>
                ))}
              </table>
            )}
          </div>

          <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-1.5 text-[10.5px] text-slate-400">
            <span className="text-slate-500">
              Click a row for sources and caveats · <span className="text-slate-300">*</span> = the
              figure has a caveat (hover) · <span className="italic text-slate-300">unknown</span> = not
              stated on any page read, never guessed
            </span>
            <br />
            {shown.length} of {data.programs.length} programmes · {grouped.length} countries shown ·{' '}
            {[...fieldCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([f, n]) => `${f} ${n}`)
              .join(' · ')}
            <span className="ml-2">· data {data.meta.generated_at}</span>
          </footer>
        </>
      )}
    </div>
  )
}
