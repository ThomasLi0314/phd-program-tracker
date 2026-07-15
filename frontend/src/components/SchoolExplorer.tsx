import { useMemo } from 'react'
import type { Program } from '../types'
import { UNKNOWN } from '../types'
import { PoolLoading } from './PoolLoading'

interface SchoolGroup {
  university: string
  country: string
  region: string
  programs: Program[]
}

function compactDeadline(p: Program): string {
  const display = p.requirements.deadline_display
  if (display === UNKNOWN) return 'deadline: verify'
  return display.replace(/\s*\(.*\)\s*/g, '').trim()
}

function SchoolCard({
  group,
  onOpenProgram,
}: {
  group: SchoolGroup
  onOpenProgram: (programId: string) => void
}) {
  const facultyCount = group.programs.reduce((n, p) => n + p.faculty.length, 0)
  return (
    <article className="mb-3 break-inside-avoid rounded border border-slate-200 bg-white">
      <header className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div>
          <h4 className="font-serif text-[15px] font-bold leading-tight text-slate-900">
            {group.university}
          </h4>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {group.country} · {group.region}
          </p>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
          {group.programs.length} program{group.programs.length === 1 ? '' : 's'}
          {facultyCount > 0 && ` · ${facultyCount} faculty`}
        </span>
      </header>
      <div>
        {group.programs.map((p) => (
          <button
            key={p.id}
            onClick={() => onOpenProgram(p.id)}
            title="Open this program's deep-dive"
            className="flex w-full items-baseline justify-between gap-2 border-b border-slate-50 px-3 py-1.5 text-left transition-colors last:border-b-0 hover:bg-indigo-50/60"
          >
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-medium text-slate-800">
                {p.program_name}
              </span>
              <span className="block text-[10px] text-slate-400">
                {p.discipline.primary} · {compactDeadline(p)}
                {p.faculty.length > 0 && ` · ${p.faculty.length} faculty tracked`}
              </span>
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-indigo-600">
              {p.degree_type} →
            </span>
          </button>
        ))}
      </div>
    </article>
  )
}

export function SchoolExplorer({
  loading,
  programs,
  query,
  onQueryChange,
  onOpenProgram,
}: {
  /** true while the per-field chunks are still arriving — see PoolLoading. */
  loading: boolean
  programs: Program[]
  query: string
  onQueryChange: (q: string) => void
  onOpenProgram: (programId: string) => void
}) {
  const groups = useMemo(() => {
    const bySchool = new Map<string, SchoolGroup>()
    for (const p of programs) {
      let g = bySchool.get(p.university)
      if (!g) {
        g = { university: p.university, country: p.country, region: p.region, programs: [] }
        bySchool.set(p.university, g)
      }
      g.programs.push(p)
    }
    for (const g of bySchool.values()) {
      g.programs.sort((a, b) => a.program_name.localeCompare(b.program_name))
    }
    return [...bySchool.values()].sort((a, b) => a.university.localeCompare(b.university))
  }, [programs])

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hits = groups.filter((g) => {
    if (terms.length === 0) return true
    const text = `${g.university} ${g.country} ${g.region}`.toLowerCase()
    return terms.every((t) => text.includes(t))
  })
  const programCount = hits.reduce((n, g) => n + g.programs.length, 0)

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <header className="mb-3">
          <h1 className="font-serif text-lg font-bold text-slate-900">School Explorer</h1>
          <p className="text-[12px] text-slate-500">
            Search a university by name — every school in the database is searched automatically
            (no field selection needed); click a program to open its deep-dive.
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder='e.g. "Stanford", "Princeton", "Michigan"…'
            autoFocus
            className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-2 text-[11px] font-medium text-slate-500">
            {hits.length} school{hits.length === 1 ? '' : 's'} · {programCount} program
            {programCount === 1 ? '' : 's'}
          </p>
        </header>

        {loading && hits.length === 0 ? (
          <PoolLoading what="schools" />
        ) : hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            No school matches “{query}” under the current sidebar filters.
          </p>
        ) : (
          <div className="gap-3 lg:columns-2 2xl:columns-3">
            {hits.map((g) => (
              <SchoolCard key={g.university} group={g} onOpenProgram={onOpenProgram} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
