import { useMemo, useState } from 'react'
import type { Faculty, OutreachRecord, Program } from '../types'
import { PoolLoading } from './PoolLoading'
import { AdvisorCard, type AdvisorDensity } from './AdvisorCard'
import { termsOf } from './Highlight'
import { usePref } from '../lib/viewPrefs'
import { MAX_PRIORITY } from '../lib/starredAdvisors'
import {
  groupHomepage,
  groupLevel,
  groupNote,
  groupRecord,
  mergeAdvisors,
  statusRank,
  type AdvisorHit as MergeHit,
  type MergedAdvisor,
} from '../lib/mergeAdvisors'

/** A saved person: one entry even when they advise in several programs. */
interface AdvisorHit {
  advisor: MergedAdvisor
  /** Primary program — decides field/school grouping and the deep-dive link. */
  program: Program
  level: number
}

interface Group {
  key: string
  level: number
  hits: AdvisorHit[]
}

type GroupBy = 'field' | 'school' | 'level'

const GROUP_OPTIONS: { id: GroupBy; label: string }[] = [
  { id: 'field', label: 'Field' },
  { id: 'school', label: 'School' },
  { id: 'level', label: 'Priority' },
]

const stars = (level: number) =>
  '★'.repeat(level) + '☆'.repeat(Math.max(0, MAX_PRIORITY - level))

function sortHits(a: AdvisorHit, b: AdvisorHit) {
  // Highest priority first, then recruiting, then university, then name.
  return (
    b.level - a.level ||
    statusRank(a.advisor.faculty.recruitment_status) -
      statusRank(b.advisor.faculty.recruitment_status) ||
    a.program.university.localeCompare(b.program.university) ||
    a.advisor.faculty.name.localeCompare(b.advisor.faculty.name)
  )
}

function programRows(m: MergedAdvisor): Program[] {
  const seen = new Set<string>()
  return m.entries.filter((e) => !seen.has(e.program.id) && seen.add(e.program.id)).map((e) => e.program)
}

export function SavedAdvisors({
  loading,
  starCount,
  programs,
  addedFaculty,
  levels,
  onSetLevel,
  onOpenProgram,
  notes,
  onSetNote,
  outreach,
  homepages,
  onSetHomepage,
}: {
  /** true while the per-field chunks are still arriving — see PoolLoading. */
  loading: boolean
  /** How many stars are actually saved, independent of what's in `programs`.
   *  Lets the empty state tell "you saved nobody" apart from "your saved
   *  advisors are filtered out of this pool" instead of asserting the former. */
  starCount: number
  programs: Program[]
  /** Locally-added advisors, keyed by program id — saveable like any other. */
  addedFaculty: Record<string, Faculty[]>
  levels: Map<string, number>
  onSetLevel: (key: string, level: number) => void
  onOpenProgram: (programId: string) => void
  notes: Map<string, string>
  onSetNote: (key: string, text: string) => void
  outreach: Record<string, OutreachRecord>
  homepages: Record<string, string>
  onSetHomepage: (key: string, url: string) => void
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('field')
  const [query, setQuery] = useState('')
  const [fieldFilter, setFieldFilter] = useState<Set<string>>(new Set())
  const [levelFilter, setLevelFilter] = useState<Set<number>>(new Set())
  const [school, setSchool] = useState('')
  const [density, setDensity] = usePref<AdvisorDensity>('savedDensity', 'card')

  // Every saved advisor, one entry per PERSON. A star is written to all of a
  // person's program entries, so without merging the same professor would be
  // listed once per program they advise in.
  const allHits = useMemo(() => {
    const raw: MergeHit[] = []
    for (const p of programs) {
      for (const f of p.faculty) raw.push({ faculty: f, program: p })
      for (const f of addedFaculty[p.id] ?? []) raw.push({ faculty: f, program: p })
    }
    const hits: AdvisorHit[] = []
    for (const advisor of mergeAdvisors(raw)) {
      const level = groupLevel(advisor.keys, levels)
      if (!level) continue
      hits.push({ advisor, program: advisor.entries[0].program, level })
    }
    return hits
  }, [programs, levels, addedFaculty])

  const fieldsOf = (h: AdvisorHit) => h.advisor.entries.map((e) => e.program.discipline.primary)
  const schoolsOf = (h: AdvisorHit) => h.advisor.entries.map((e) => e.program.university)

  const allFields = useMemo(() => [...new Set(allHits.flatMap(fieldsOf))].sort(), [allHits])
  const allSchools = useMemo(() => [...new Set(allHits.flatMap(schoolsOf))].sort(), [allHits])
  const allLevels = useMemo(
    () => [...new Set(allHits.map((h) => h.level))].sort((a, b) => b - a),
    [allHits],
  )

  const terms = useMemo(() => termsOf(query), [query])

  const filtered = useMemo(
    () =>
      allHits.filter((h) => {
        if (fieldFilter.size && !fieldsOf(h).some((f) => fieldFilter.has(f))) return false
        if (school && !schoolsOf(h).includes(school)) return false
        if (levelFilter.size && !levelFilter.has(h.level)) return false
        if (terms.length) {
          const f = h.advisor.faculty
          const hay = `${f.name} ${f.title} ${f.sub_field} ${f.tags.join(' ')} ${f.summary} ${h.advisor.entries
            .map((e) => `${e.program.university} ${e.program.program_name} ${e.program.discipline.primary}`)
            .join(' ')}`.toLowerCase()
          if (!terms.every((t) => hay.includes(t))) return false
        }
        return true
      }),
    [allHits, fieldFilter, school, levelFilter, terms],
  )

  const groups = useMemo(() => {
    const map = new Map<string, Group>()
    for (const h of filtered) {
      const key =
        groupBy === 'field'
          ? (fieldsOf(h).find((f) => fieldFilter.has(f)) ?? h.program.discipline.primary)
          : groupBy === 'school'
            ? h.program.university
            : String(h.level)
      let g = map.get(key)
      if (!g) {
        g = { key, level: h.level, hits: [] }
        map.set(key, g)
      }
      g.hits.push(h)
    }
    for (const g of map.values()) g.hits.sort(sortHits)
    const arr = [...map.values()]
    if (groupBy === 'level') arr.sort((a, b) => Number(b.key) - Number(a.key))
    else arr.sort((a, b) => b.hits.length - a.hits.length || a.key.localeCompare(b.key))
    return arr
  }, [filtered, groupBy, fieldFilter])

  const totalStarred = allHits.length
  const shown = filtered.length
  const hasFilter = fieldFilter.size > 0 || levelFilter.size > 0 || !!school || terms.length > 0

  const toggleIn = <T,>(set: (fn: (s: Set<T>) => Set<T>) => void, v: T) =>
    set((s) => {
      const n = new Set(s)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })
  const clearAll = () => {
    setFieldFilter(new Set())
    setLevelFilter(new Set())
    setSchool('')
    setQuery('')
  }

  const chip = (active: boolean, tone: 'indigo' | 'amber') =>
    active
      ? tone === 'amber'
        ? 'bg-amber-500 text-white'
        : 'bg-indigo-600 text-white'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <header className="mb-3">
          <h1 className="font-serif text-lg font-bold text-slate-900">Saved advisors</h1>
          <p className="text-[12.5px] text-slate-600">
            Everyone you gave a priority (★ to ★★★). Click the stars on any card to change it; clear
            them to remove the person from this list.
          </p>
        </header>

        {loading && totalStarred === 0 ? (
          <PoolLoading what="your saved advisors" />
        ) : totalStarred === 0 && starCount > 0 ? (
          // Stars exist but none survived the pool — never claim they're gone.
          <div className="py-16 text-center">
            <p className="text-[13.5px] font-medium text-amber-800">
              You have {starCount} saved advisor{starCount === 1 ? '' : 's'}, but none are visible
              here.
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
              The sidebar filters on the Explore tab (degree, region, GRE, fee) also narrow this list.
              Clear them to see everyone you saved.
            </p>
          </div>
        ) : totalStarred === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[13.5px] text-slate-600">You haven't saved any advisors yet.</p>
            <p className="mt-1 text-[12.5px] text-slate-500">
              In <span className="font-medium text-slate-700">Explore → Advisors</span> or on a
              program's Faculty tab, click the ☆☆☆ on a card to give someone a priority.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-4 space-y-2.5 rounded-md border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Group by
                </span>
                <div className="flex gap-1">
                  {GROUP_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setGroupBy(o.id)}
                      className={`rounded px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                        groupBy === o.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex overflow-hidden rounded border border-slate-300 text-[12px] font-medium">
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

              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, topic, school…"
                  className="min-w-[200px] flex-1 rounded border border-slate-300 px-2.5 py-1 text-[12.5px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                />
                <select
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  className="max-w-[240px] rounded border border-slate-300 bg-white px-2 py-1 text-[12.5px] text-slate-700 focus:border-indigo-400 focus:outline-none"
                >
                  <option value="">All schools ({allSchools.length})</option>
                  {allSchools.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {allLevels.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Priority
                  </span>
                  {allLevels.map((lv) => (
                    <button
                      key={lv}
                      onClick={() => toggleIn(setLevelFilter, lv)}
                      className={`rounded-full px-2 py-0.5 text-[12px] font-semibold transition-colors ${chip(
                        levelFilter.has(lv),
                        'amber',
                      )}`}
                      title={`Priority ${lv}`}
                    >
                      {stars(lv)}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Field
                </span>
                {allFields.map((fl) => (
                  <button
                    key={fl}
                    onClick={() => toggleIn(setFieldFilter, fl)}
                    className={`rounded-full px-2 py-0.5 text-[12px] font-medium transition-colors ${chip(
                      fieldFilter.has(fl),
                      'indigo',
                    )}`}
                  >
                    {fl}
                  </button>
                ))}
                {hasFilter && (
                  <button
                    onClick={clearAll}
                    className="ml-1 text-[12px] font-medium text-slate-500 underline hover:text-slate-700"
                  >
                    clear
                  </button>
                )}
              </div>
            </div>

            <p className="mb-3 text-[12px] font-medium text-slate-600">
              {shown} of {totalStarred} saved advisor{totalStarred === 1 ? '' : 's'} · {groups.length}{' '}
              {groupBy === 'field' ? 'field' : groupBy === 'school' ? 'school' : 'priority tier'}
              {groups.length === 1 ? '' : 's'}
            </p>

            {shown === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[13px] text-slate-500">No saved advisors match these filters.</p>
                <button
                  onClick={clearAll}
                  className="mt-2 text-[12.5px] font-medium text-indigo-600 underline hover:text-indigo-700"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {groups.map((g) => (
                  <section key={g.key}>
                    <div className="mb-2 flex items-baseline gap-2 border-b border-slate-200 pb-1">
                      {groupBy === 'level' ? (
                        <h2 className="font-serif text-[15px] font-bold tracking-wide text-amber-500">
                          {stars(g.level)}
                          <span className="ml-1.5 text-[12.5px] font-medium text-slate-600">
                            Priority {g.level}
                          </span>
                        </h2>
                      ) : (
                        <h2 className="font-serif text-[15px] font-bold text-slate-800">{g.key}</h2>
                      )}
                      <span className="text-[12px] tabular-nums text-slate-500">{g.hits.length}</span>
                    </div>
                    <div className={density === 'card' ? 'gap-3 lg:columns-2 2xl:columns-3' : 'rounded-md border border-slate-200 bg-white'}>
                      {g.hits.map((h) => {
                        const keys = h.advisor.keys
                        return (
                          <AdvisorCard
                            key={h.advisor.key}
                            faculty={h.advisor.faculty}
                            rows={programRows(h.advisor)}
                            density={density}
                            terms={terms}
                            level={h.level}
                            onSetLevel={(n) => keys.forEach((k) => onSetLevel(k, n))}
                            onOpenProgram={onOpenProgram}
                            note={groupNote(keys, notes)}
                            onSaveNote={(text) => keys.forEach((k) => onSetNote(k, text))}
                            record={groupRecord(keys, outreach)}
                            homepage={groupHomepage(h.advisor, homepages)}
                            onSetHomepage={(u) => keys.forEach((k) => onSetHomepage(k, u))}
                          />
                        )
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
