import { useMemo, useState } from 'react'
import type { Faculty, OutreachRecord, Program } from '../types'
import { PoolLoading } from './PoolLoading'
import { AddAdvisorPanel } from './AddAdvisorPanel'
import { AdvisorCard, type AdvisorDensity } from './AdvisorCard'
import { termsOf } from './Highlight'
import { usePref } from '../lib/viewPrefs'
import { groupByCanonical } from '../lib/subfields'
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

type SortKey = 'relevance' | 'recruiting' | 'name' | 'school'

const count = (hay: string, term: string): number => {
  if (!term) return 0
  let n = 0
  let i = hay.indexOf(term)
  while (i !== -1 && n < 5) {
    n++
    i = hay.indexOf(term, i + term.length)
  }
  return n
}

/**
 * How well a person matches the query. A hit in the name or the main research
 * area outweighs a passing mention in a long summary; every term must appear
 * somewhere or the person is not a match at all.
 */
function relevance(m: MergedAdvisor, terms: string[]): number {
  if (terms.length === 0) return 0
  const f = m.faculty
  const name = f.name.toLowerCase()
  const area = f.sub_field.toLowerCase()
  const tags = f.tags.join(' ').toLowerCase()
  const summary = f.summary.toLowerCase()
  const title = f.title.toLowerCase()
  const programs = m.entries
    .map((e) => `${e.program.university} ${e.program.program_name} ${e.program.discipline.primary}`)
    .join(' ')
    .toLowerCase()
  let score = 0
  for (const t of terms) {
    let hit = 0
    if (name.includes(t)) hit += 10
    if (area.includes(t)) hit += 6
    hit += Math.min(3, count(tags, t)) * 3
    hit += Math.min(3, count(summary, t))
    if (title.includes(t)) hit += 1
    if (programs.includes(t)) hit += 2
    if (hit === 0) return -1
    score += hit
  }
  return score
}

/** One row per program this person can advise in — deduped by program id. */
function programRows(m: MergedAdvisor): Program[] {
  const seen = new Set<string>()
  return m.entries.filter((e) => !seen.has(e.program.id) && seen.add(e.program.id)).map((e) => e.program)
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
  addedFaculty,
  onAddFaculty,
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
  addedFaculty: Record<string, Faculty[]>
  onAddFaculty: (programId: string, f: Faculty) => void
}) {
  const [adding, setAdding] = useState(false)
  const [density, setDensity] = usePref<AdvisorDensity>('advisorDensity', 'card')
  const [sortPref, setSortPref] = useState<SortKey | null>(null)

  // One card per person: the same professor is often listed under several of
  // their university's programs (see lib/mergeAdvisors for why this is scoped
  // to a single university).
  const allAdvisors = useMemo(() => {
    const hits: AdvisorHit[] = []
    for (const p of programs) {
      for (const f of p.faculty) hits.push({ faculty: f, program: p })
      for (const f of addedFaculty[p.id] ?? []) hits.push({ faculty: f, program: p })
    }
    return mergeAdvisors(hits)
  }, [programs, addedFaculty])

  // Topics worth one click. Grouped on the canonical key so "machine learning"
  // and "Machine Learning" are one chip, labelled by the fuller spelling.
  const topTags = useMemo(() => {
    const raw: string[] = []
    for (const a of allAdvisors) {
      if (a.faculty.sub_field && a.faculty.sub_field !== 'Unspecified') raw.push(a.faculty.sub_field)
      raw.push(...a.faculty.tags)
    }
    return groupByCanonical(raw, (s) => s)
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 14)
      .map((g) => g.label)
  }, [allAdvisors])

  const terms = useMemo(() => termsOf(query), [query])
  const sortBy: SortKey = sortPref ?? (terms.length ? 'relevance' : 'recruiting')

  const hits = useMemo(() => {
    const scored = allAdvisors
      .map((a) => ({ a, score: relevance(a, terms) }))
      .filter((x) => terms.length === 0 || x.score > 0)
    const byName = (x: MergedAdvisor, y: MergedAdvisor) => x.faculty.name.localeCompare(y.faculty.name)
    const bySchool = (x: MergedAdvisor, y: MergedAdvisor) =>
      x.entries[0].program.university.localeCompare(y.entries[0].program.university)
    const byRecruiting = (x: MergedAdvisor, y: MergedAdvisor) =>
      statusRank(x.faculty.recruitment_status) - statusRank(y.faculty.recruitment_status)
    scored.sort((x, y) => {
      if (sortBy === 'relevance') return y.score - x.score || byRecruiting(x.a, y.a) || byName(x.a, y.a)
      if (sortBy === 'name') return byName(x.a, y.a)
      if (sortBy === 'school') return bySchool(x.a, y.a) || byName(x.a, y.a)
      return byRecruiting(x.a, y.a) || bySchool(x.a, y.a) || byName(x.a, y.a)
    })
    return scored.map((x) => x.a)
  }, [allAdvisors, terms, sortBy])

  // Rendering thousands of cards freezes the page, so only mount the first
  // RENDER_CAP; the count line reports the true total.
  const RENDER_CAP = 120
  const visible = hits.slice(0, RENDER_CAP)
  const schools = new Set(hits.flatMap((h) => h.entries.map((e) => e.program.id)))

  const cards = visible.map((a) => (
    // Stars/notes/homepage read across the person's program entries and
    // write to all of them, so the value shows on every card everywhere.
    <AdvisorCard
      key={a.key}
      faculty={a.faculty}
      rows={programRows(a)}
      density={density}
      terms={terms}
      level={groupLevel(a.keys, levels)}
      onSetLevel={(n) => a.keys.forEach((k) => onSetLevel(k, n))}
      onOpenProgram={onOpenProgram}
      note={groupNote(a.keys, notes)}
      onSaveNote={(text) => a.keys.forEach((k) => onSetNote(k, text))}
      record={groupRecord(a.keys, outreach)}
      homepage={groupHomepage(a, homepages)}
      onSetHomepage={(u) => a.keys.forEach((k) => onSetHomepage(k, u))}
    />
  ))

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <header className="mb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-lg font-bold text-slate-900">Advisors</h1>
              <p className="text-[12.5px] text-slate-600">
                Search a research direction across every program in the database.
              </p>
            </div>
            <button
              onClick={() => setAdding((v) => !v)}
              className={`shrink-0 rounded border px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                adding
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400 hover:text-indigo-700'
              }`}
              title="Add a professor who isn't in the database — the school and program are worked out from their page"
            >
              ＋ Add advisor
            </button>
          </div>
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder='e.g. "ocean turbulence", "physics-informed ML", "mathematical biology"…'
            autoFocus
            className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {topTags.map((tag) => (
              <button
                key={tag}
                onClick={() => onQueryChange(query === tag ? '' : tag)}
                className={`rounded-full border px-2 py-0.5 text-[12px] font-medium transition-colors ${
                  query === tag
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px] font-medium text-slate-600">
              {loading && hits.length === 0
                ? 'Loading…'
                : `${hits.length.toLocaleString()} advisor${hits.length === 1 ? '' : 's'} across ${schools.size.toLocaleString()} program${schools.size === 1 ? '' : 's'}`}
              {hits.length > RENDER_CAP && (
                <span className="text-slate-500"> · showing the first {RENDER_CAP}, type to narrow</span>
              )}
            </p>
            <div className="flex items-center gap-2 text-[12px]">
              <label className="flex items-center gap-1 text-slate-600">
                sort
                <select
                  value={sortBy}
                  onChange={(e) => setSortPref(e.target.value as SortKey)}
                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[12px] font-medium text-slate-700 focus:border-indigo-400 focus:outline-none"
                >
                  <option value="relevance" disabled={terms.length === 0}>
                    Relevance
                  </option>
                  <option value="recruiting">Recruiting first</option>
                  <option value="school">School</option>
                  <option value="name">Name</option>
                </select>
              </label>
              <div className="flex overflow-hidden rounded border border-slate-300 font-medium">
                {(['card', 'compact'] as AdvisorDensity[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setDensity(d)}
                    className={`px-2 py-0.5 ${density === d ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
                  >
                    {d === 'card' ? 'Cards' : 'List'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        {adding && (
          <AddAdvisorPanel
            programs={programs}
            addedFaculty={addedFaculty}
            onAdd={onAddFaculty}
            onClose={() => setAdding(false)}
            onOpenProgram={onOpenProgram}
          />
        )}

        {loading && hits.length === 0 ? (
          <PoolLoading what="advisors" />
        ) : hits.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-slate-500">
            No advisor matches “{query}” under the current filters.
          </p>
        ) : density === 'compact' ? (
          <div className="rounded-md border border-slate-200 bg-white">{cards}</div>
        ) : (
          <div className="gap-3 lg:columns-2 2xl:columns-3">{cards}</div>
        )}
      </div>
    </main>
  )
}
