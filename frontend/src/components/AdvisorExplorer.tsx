import { useMemo } from 'react'
import type { OutreachRecord, Program } from '../types'
import { Badge, RecruitmentBadge } from './Badge'
import { StarRating } from './StarRating'
import { AdvisorNote } from './AdvisorNote'
import { OutreachBadge } from './OutreachBadge'
import { EditableLink } from './EditableLink'
import { PoolLoading } from './PoolLoading'
import {
  groupHomepage,
  groupLevel,
  groupNote,
  groupRecord,
  mergeAdvisors,
  statusRank,
  type AdvisorHit,
  type MergedAdvisor,
} from '../lib/mergeAdvisors'

/** Search text spans the person's card AND every program they appear under. */
function haystack(m: MergedAdvisor): string {
  const f = m.faculty
  return [
    f.name,
    f.title,
    f.sub_field,
    f.tags.join(' '),
    f.summary,
    ...m.entries.map(
      (e) =>
        `${e.program.university} ${e.program.program_name} ${e.program.discipline.primary} ${e.program.discipline.subs.join(' ')}`,
    ),
  ]
    .join(' ')
    .toLowerCase()
}

function matchesQuery(m: MergedAdvisor, terms: string[]): boolean {
  if (terms.length === 0) return true
  const text = haystack(m)
  return terms.every((t) => text.includes(t))
}

/** One row per program this person can advise in — deduped by program id, since
 *  a stale slug bug can list the same person twice inside one program. */
function programRows(m: MergedAdvisor): AdvisorHit[] {
  const seen = new Set<string>()
  return m.entries.filter((e) => !seen.has(e.program.id) && seen.add(e.program.id))
}

function AdvisorCard({
  advisor,
  level,
  onSetLevel,
  onOpenProgram,
  note,
  onSaveNote,
  record,
  homepage,
  onSetHomepage,
}: {
  advisor: MergedAdvisor
  level: number
  onSetLevel: (n: number) => void
  onOpenProgram: (programId: string) => void
  note: string
  onSaveNote: (text: string) => void
  record?: OutreachRecord
  homepage: string
  onSetHomepage: (url: string) => void
}) {
  const f = advisor.faculty
  const rows = programRows(advisor)
  return (
    <article className="mb-3 break-inside-avoid rounded border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-serif text-[15px] font-bold leading-tight text-slate-900">{f.name}</h4>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{f.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <RecruitmentBadge status={f.recruitment_status} />
          <StarRating level={level} onSetLevel={onSetLevel} />
        </div>
      </div>

      {/* One person, every program they can take students through. */}
      <div className="mt-1.5 space-y-1">
        {rows.map((e) => (
          <button
            key={e.program.id}
            onClick={() => onOpenProgram(e.program.id)}
            className="flex w-full items-center justify-between gap-2 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50"
            title="Open this program's deep-dive"
          >
            <span className="min-w-0 text-[12px] font-medium text-indigo-800">
              {e.program.university}
              <span className="font-normal text-indigo-500"> — {e.program.program_name}</span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-indigo-600">
              {e.program.degree_type} · {e.program.region} →
            </span>
          </button>
        ))}
      </div>
      {rows.length > 1 && (
        <p className="mt-1 text-[10px] text-slate-400">
          Same advisor, {rows.length} programs — starring or noting applies to all of them.
        </p>
      )}

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
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-medium">
        <EditableLink label="Homepage" url={homepage} onSave={onSetHomepage} />
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
      <div>
        <OutreachBadge record={record} />
      </div>
      <AdvisorNote note={note} onSave={onSaveNote} />
    </article>
  )
}

export function AdvisorExplorer({
  loading,
  programs,
  query,
  onQueryChange,
  onOpenProgram,
  levels,
  onSetLevel,
  notes,
  onSetNote,
  outreach,
  homepages,
  onSetHomepage,
}: {
  /** true while the per-field chunks are still arriving — see PoolLoading. */
  loading: boolean
  programs: Program[]
  query: string
  onQueryChange: (q: string) => void
  onOpenProgram: (programId: string) => void
  levels: Map<string, number>
  onSetLevel: (key: string, level: number) => void
  notes: Map<string, string>
  onSetNote: (key: string, text: string) => void
  outreach: Record<string, OutreachRecord>
  homepages: Record<string, string>
  onSetHomepage: (key: string, url: string) => void
}) {
  // One card per person: the same professor is often listed under several of
  // their university's programs (see lib/mergeAdvisors for why this is scoped
  // to a single university).
  const allAdvisors = useMemo(() => {
    const hits: AdvisorHit[] = []
    for (const p of programs) for (const f of p.faculty) hits.push({ faculty: f, program: p })
    return mergeAdvisors(hits)
  }, [programs])

  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const a of allAdvisors) {
      counts.set(a.faculty.sub_field, (counts.get(a.faculty.sub_field) ?? 0) + 1)
      for (const t of a.faculty.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([tag]) => tag)
  }, [allAdvisors])

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query])
  const hits = useMemo(
    () =>
      allAdvisors
        .filter((a) => matchesQuery(a, terms))
        .sort(
          (a, b) =>
            statusRank(a.faculty.recruitment_status) - statusRank(b.faculty.recruitment_status) ||
            a.entries[0].program.university.localeCompare(b.entries[0].program.university) ||
            a.faculty.name.localeCompare(b.faculty.name),
        ),
    [allAdvisors, terms],
  )

  // Rendering thousands of cards in a CSS multi-column layout freezes the page,
  // so only mount the first RENDER_CAP; the count line reports the true total.
  const RENDER_CAP = 120
  const visible = hits.slice(0, RENDER_CAP)
  const schools = new Set(hits.flatMap((h) => h.entries.map((e) => e.program.id)))

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
            <span className="text-slate-400"> · one card per person</span>
            {hits.length > RENDER_CAP && (
              <span className="text-slate-400">
                {' '}
                · showing first {RENDER_CAP} — type to narrow the search
              </span>
            )}
          </p>
        </header>

        {loading && hits.length === 0 ? (
          <PoolLoading what="advisors" />
        ) : hits.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            No advisors match “{query}” under the current sidebar filters.
          </p>
        ) : (
          <div className="gap-3 lg:columns-2 2xl:columns-3">
            {visible.map((a) => (
              // Stars/notes/homepage read across the person's program entries and
              // write to all of them, so the value shows on every card everywhere.
              <AdvisorCard
                key={a.key}
                advisor={a}
                level={groupLevel(a.keys, levels)}
                onSetLevel={(n) => a.keys.forEach((k) => onSetLevel(k, n))}
                onOpenProgram={onOpenProgram}
                note={groupNote(a.keys, notes)}
                onSaveNote={(text) => a.keys.forEach((k) => onSetNote(k, text))}
                record={groupRecord(a.keys, outreach)}
                homepage={groupHomepage(a, homepages)}
                onSetHomepage={(u) => a.keys.forEach((k) => onSetHomepage(k, u))}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
