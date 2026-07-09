import { useMemo } from 'react'
import type { Faculty, Program } from '../types'
import { Badge, RecruitmentBadge } from './Badge'
import { advisorKey } from '../lib/starredAdvisors'

interface AdvisorHit {
  faculty: Faculty
  program: Program
}

const STATUS_RANK: Record<string, number> = {
  'Looking for Students': 0,
  'Unknown/Verify': 1,
  'Not Advising': 2,
}

function haystack(hit: AdvisorHit): string {
  const { faculty: f, program: p } = hit
  return [
    f.name,
    f.title,
    f.sub_field,
    f.tags.join(' '),
    f.summary,
    p.university,
    p.program_name,
    p.discipline.primary,
    p.discipline.subs.join(' '),
  ]
    .join(' ')
    .toLowerCase()
}

function matchesQuery(hit: AdvisorHit, terms: string[]): boolean {
  if (terms.length === 0) return true
  const text = haystack(hit)
  return terms.every((t) => text.includes(t))
}

function AdvisorCard({
  hit,
  starred,
  onToggleStar,
  onOpenProgram,
}: {
  hit: AdvisorHit
  starred: boolean
  onToggleStar: () => void
  onOpenProgram: () => void
}) {
  const { faculty: f, program: p } = hit
  return (
    <article className="mb-3 break-inside-avoid rounded border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-serif text-[15px] font-bold leading-tight text-slate-900">{f.name}</h4>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{f.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <RecruitmentBadge status={f.recruitment_status} />
          <button
            onClick={onToggleStar}
            title={starred ? 'Remove from starred advisors' : 'Star this advisor'}
            aria-label={starred ? 'Unstar advisor' : 'Star advisor'}
            aria-pressed={starred}
            className={`text-[15px] leading-none transition-transform hover:scale-110 ${
              starred ? 'text-amber-400' : 'text-slate-300 hover:text-amber-400'
            }`}
          >
            {starred ? '★' : '☆'}
          </button>
        </div>
      </div>

      <button
        onClick={onOpenProgram}
        className="mt-1.5 flex w-full items-center justify-between gap-2 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50"
        title="Open this program's deep-dive"
      >
        <span className="text-[12px] font-medium text-indigo-800">
          {p.university}
          <span className="font-normal text-indigo-500"> — {p.program_name}</span>
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-indigo-600">
          {p.degree_type} · {p.region} →
        </span>
      </button>

      <div className="mt-2 flex flex-wrap gap-1">
        <Badge tone="slate">{f.sub_field}</Badge>
        {f.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
          >
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{f.summary}</p>
      <div className="mt-2 flex gap-3 text-[11px] font-medium">
        {f.links.homepage && (
          <a
            href={f.links.homepage}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Homepage ↗
          </a>
        )}
        {f.links.scholar && (
          <a
            href={f.links.scholar}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Google Scholar ↗
          </a>
        )}
      </div>
    </article>
  )
}

export function AdvisorExplorer({
  programs,
  query,
  onQueryChange,
  onOpenProgram,
  starred,
  onToggleStar,
}: {
  programs: Program[]
  query: string
  onQueryChange: (q: string) => void
  onOpenProgram: (programId: string) => void
  starred: Set<string>
  onToggleStar: (key: string) => void
}) {
  const allHits = useMemo(
    () => programs.flatMap((p) => p.faculty.map((f) => ({ faculty: f, program: p }))),
    [programs],
  )

  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const hit of allHits) {
      counts.set(hit.faculty.sub_field, (counts.get(hit.faculty.sub_field) ?? 0) + 1)
      for (const t of hit.faculty.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([tag]) => tag)
  }, [allHits])

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query])
  const hits = useMemo(
    () =>
      allHits
        .filter((h) => matchesQuery(h, terms))
        .sort(
          (a, b) =>
            (STATUS_RANK[a.faculty.recruitment_status] ?? 1) -
              (STATUS_RANK[b.faculty.recruitment_status] ?? 1) ||
            a.program.university.localeCompare(b.program.university) ||
            a.faculty.name.localeCompare(b.faculty.name),
        ),
    [allHits, terms],
  )

  // Rendering thousands of cards in a CSS multi-column layout freezes the page,
  // so only mount the first RENDER_CAP; the count line reports the true total.
  const RENDER_CAP = 120
  const visible = hits.slice(0, RENDER_CAP)
  const schools = new Set(hits.map((h) => h.program.id))

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <header className="mb-3">
          <h1 className="font-serif text-lg font-bold text-slate-900">Advisor Explorer</h1>
          <p className="text-[12px] text-slate-500">
            Search a research direction — advisors across the whole database are searched
            automatically (no field selection needed), recruiting advisors first.
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder='e.g. "ocean turbulence", "physics-informed ML", "mathematical biology"…'
            autoFocus
            className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {topTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onQueryChange(query === tag ? '' : tag)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  query === tag
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] font-medium text-slate-500">
            {hits.length} advisor{hits.length === 1 ? '' : 's'} across {schools.size} program
            {schools.size === 1 ? '' : 's'}
            {hits.length > RENDER_CAP && (
              <span className="text-slate-400">
                {' '}
                · showing first {RENDER_CAP} — type to narrow the search
              </span>
            )}
          </p>
        </header>

        {hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            No advisors match “{query}” under the current sidebar filters.
          </p>
        ) : (
          <div className="gap-3 lg:columns-2 2xl:columns-3">
            {visible.map((h) => {
              const key = advisorKey(h.program.id, h.faculty.id)
              return (
                <AdvisorCard
                  key={key}
                  hit={h}
                  starred={starred.has(key)}
                  onToggleStar={() => onToggleStar(key)}
                  onOpenProgram={() => onOpenProgram(h.program.id)}
                />
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
