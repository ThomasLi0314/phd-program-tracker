import { useMemo, useState } from 'react'
import type { Faculty, OutreachRecord, Program } from '../types'
import { Badge, RecruitmentBadge } from './Badge'
import { StarRating } from './StarRating'
import { AdvisorNote } from './AdvisorNote'
import { OutreachBadge } from './OutreachBadge'
import { EditableLink } from './EditableLink'
import { PoolLoading } from './PoolLoading'
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

/** A starred person: one entry even when they advise in several programs. */
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
  { id: 'field', label: 'Field · 领域' },
  { id: 'school', label: 'School · 学校' },
  { id: 'level', label: 'Priority · 星级' },
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

function StarredCard({
  hit,
  onSetLevel,
  onOpenProgram,
  note,
  onSaveNote,
  record,
  homepage,
  onSetHomepage,
}: {
  hit: AdvisorHit
  onSetLevel: (n: number) => void
  onOpenProgram: (programId: string) => void
  note: string
  onSaveNote: (text: string) => void
  record?: OutreachRecord
  homepage: string
  onSetHomepage: (url: string) => void
}) {
  const f = hit.advisor.faculty
  const seen = new Set<string>()
  const rows = hit.advisor.entries.filter((e) => !seen.has(e.program.id) && seen.add(e.program.id))
  return (
    <article className="mb-3 break-inside-avoid rounded border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-serif text-[15px] font-bold leading-tight text-slate-900">{f.name}</h4>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{f.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <RecruitmentBadge status={f.recruitment_status} />
          <StarRating level={hit.level} onSetLevel={onSetLevel} />
        </div>
      </div>

      <div className="mt-1.5 space-y-1">
        {rows.map((e) => (
          <button
            key={e.program.id}
            onClick={() => onOpenProgram(e.program.id)}
            className="flex w-full items-center justify-between gap-2 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50"
            title="Open this program's deep-dive"
          >
            <span className="min-w-0 truncate text-[12px] font-medium text-indigo-800">
              {e.program.university}
              <span className="font-normal text-indigo-500"> — {e.program.program_name}</span>
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-indigo-600">
              {e.program.degree_type} · {e.program.region} →
            </span>
          </button>
        ))}
      </div>

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

export function StarredAdvisors({
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
   *  Lets the empty state tell "you starred nobody" apart from "your stars are
   *  filtered out of this pool" instead of asserting the former. */
  starCount: number
  programs: Program[]
  /** Locally-added advisors, keyed by program id — starrable like any other. */
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

  // Every starred advisor, one entry per PERSON. Merging matters here too: a
  // star is written to all of a person's program entries, so without this the
  // same professor would be listed once per program they advise in.
  const allHits = useMemo(() => {
    const raw: MergeHit[] = []
    for (const p of programs) {
      for (const f of p.faculty) raw.push({ faculty: f, program: p })
      // Advisors the user added can be starred like any other, so they have to
      // be resolvable here — otherwise starring one shows an empty Starred tab.
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

  // A merged advisor can span several programs, so their fields/schools are the
  // union across their entries — filtering on any one of them must find them.
  const fieldsOf = (h: AdvisorHit) => h.advisor.entries.map((e) => e.program.discipline.primary)
  const schoolsOf = (h: AdvisorHit) => h.advisor.entries.map((e) => e.program.university)

  const allFields = useMemo(() => [...new Set(allHits.flatMap(fieldsOf))].sort(), [allHits])
  const allSchools = useMemo(() => [...new Set(allHits.flatMap(schoolsOf))].sort(), [allHits])
  const allLevels = useMemo(
    () => [...new Set(allHits.map((h) => h.level))].sort((a, b) => b - a),
    [allHits],
  )

  const terms = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query])

  const filtered = useMemo(
    () =>
      allHits.filter((h) => {
        if (fieldFilter.size && !fieldsOf(h).some((f) => fieldFilter.has(f))) return false
        if (school && !schoolsOf(h).includes(school)) return false
        if (levelFilter.size && !levelFilter.has(h.level)) return false
        if (terms.length) {
          const f = h.advisor.faculty
          const hay = `${f.name} ${f.title} ${f.sub_field} ${f.tags.join(' ')} ${h.advisor.entries
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
          ? // A person advising across several fields lands under the field the
            // user is filtering on, else their primary program's field.
            (fieldsOf(h).find((f) => fieldFilter.has(f)) ?? h.program.discipline.primary)
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
  }, [filtered, groupBy])

  const totalStarred = allHits.length
  const shown = filtered.length
  const hasFilter = fieldFilter.size > 0 || levelFilter.size > 0 || !!school || terms.length > 0
  const groupNoun = groupBy === 'field' ? 'field' : groupBy === 'school' ? 'school' : 'priority tier'

  const toggleField = (v: string) =>
    setFieldFilter((s) => {
      const n = new Set(s)
      n.has(v) ? n.delete(v) : n.add(v)
      return n
    })
  const toggleLevel = (v: number) =>
    setLevelFilter((s) => {
      const n = new Set(s)
      n.has(v) ? n.delete(v) : n.add(v)
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
        ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <header className="mb-3">
          <h1 className="font-serif text-lg font-bold text-slate-900">Starred Advisors</h1>
          <p className="text-[12px] text-slate-500">
            Advisors you starred. Group by field, school, or priority, and filter the list below.
            Within each group, higher-priority advisors (★★★) come first. Click the stars to change a
            priority; clear all three to remove.
          </p>
        </header>

        {loading && totalStarred === 0 ? (
          <PoolLoading what="your starred advisors" />
        ) : totalStarred === 0 && starCount > 0 ? (
          // Stars exist but none survived the pool — never claim they're gone.
          <div className="py-16 text-center">
            <p className="text-sm font-medium text-amber-700">
              You have {starCount} starred advisor{starCount === 1 ? '' : 's'}, but none are
              visible here.
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
              The sidebar filters (degree, region, GRE, application fee) also narrow this list.
              Clear them to see everything you starred.
            </p>
          </div>
        ) : totalStarred === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-400">You haven't starred any advisors yet.</p>
            <p className="mt-1 text-[12px] text-slate-400">
              In the <span className="font-medium text-slate-600">Advisors</span> tab or any
              program's deep-dive, click the ☆☆☆ on an advisor card to set a priority.
            </p>
          </div>
        ) : (
          <>
            {/* Group-by + filter bar */}
            <div className="mb-4 space-y-2.5 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Group by
                </span>
                <div className="flex gap-1">
                  {GROUP_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setGroupBy(o.id)}
                      className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors ${
                        groupBy === o.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, topic, school…"
                  className="min-w-[200px] flex-1 rounded border border-slate-300 px-2.5 py-1 text-[12px] text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
                />
                <select
                  value={school}
                  onChange={(e) => setSchool(e.target.value)}
                  className="max-w-[220px] rounded border border-slate-300 bg-white px-2 py-1 text-[12px] text-slate-700 focus:border-indigo-400 focus:outline-none"
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
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Priority
                  </span>
                  {allLevels.map((lv) => (
                    <button
                      key={lv}
                      onClick={() => toggleLevel(lv)}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${chip(
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
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Field
                </span>
                {allFields.map((fl) => (
                  <button
                    key={fl}
                    onClick={() => toggleField(fl)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${chip(
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
                    className="ml-1 text-[11px] font-medium text-slate-400 underline hover:text-slate-600"
                  >
                    clear filters
                  </button>
                )}
              </div>
            </div>

            <p className="mb-3 text-[11px] font-medium text-slate-500">
              Showing {shown} of {totalStarred} starred advisor{totalStarred === 1 ? '' : 's'} across{' '}
              {groups.length} {groupNoun}
              {groups.length === 1 ? '' : 's'}
            </p>

            {shown === 0 ? (
              <div className="py-16 text-center">
                <p className="text-sm text-slate-400">No starred advisors match these filters.</p>
                <button
                  onClick={clearAll}
                  className="mt-2 text-[12px] font-medium text-indigo-600 underline hover:text-indigo-700"
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
                          <span className="ml-1.5 text-[12px] font-medium text-slate-500">
                            Priority {g.level}
                          </span>
                        </h2>
                      ) : (
                        <h2 className="font-serif text-[15px] font-bold text-slate-800">{g.key}</h2>
                      )}
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800">
                        {g.hits.length} ★
                      </span>
                    </div>
                    <div className="gap-3 lg:columns-2 2xl:columns-3">
                      {g.hits.map((h) => {
                        const keys = h.advisor.keys
                        return (
                          <StarredCard
                            key={h.advisor.key}
                            hit={h}
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
