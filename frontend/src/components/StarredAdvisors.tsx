import { useMemo } from 'react'
import type { Faculty, Program } from '../types'
import { Badge, RecruitmentBadge } from './Badge'
import { advisorKey } from '../lib/starredAdvisors'

interface AdvisorHit {
  faculty: Faculty
  program: Program
}

interface FieldGroup {
  primary: string
  hits: AdvisorHit[]
}

const STATUS_RANK: Record<string, number> = {
  'Looking for Students': 0,
  'Unknown/Verify': 1,
  'Not Advising': 2,
}

function StarredCard({
  hit,
  onToggleStar,
  onOpenProgram,
}: {
  hit: AdvisorHit
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
            title="Remove from starred advisors"
            className="text-[15px] leading-none text-amber-400 transition-transform hover:scale-110"
            aria-label="Unstar advisor"
          >
            ★
          </button>
        </div>
      </div>

      <button
        onClick={onOpenProgram}
        className="mt-1.5 flex w-full items-center justify-between gap-2 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-50"
        title="Open this program's deep-dive"
      >
        <span className="min-w-0 truncate text-[12px] font-medium text-indigo-800">
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

export function StarredAdvisors({
  programs,
  starred,
  onToggleStar,
  onOpenProgram,
}: {
  programs: Program[]
  starred: Set<string>
  onToggleStar: (key: string) => void
  onOpenProgram: (programId: string) => void
}) {
  // Resolve starred keys back to advisor hits, grouped by discipline.
  const groups = useMemo(() => {
    const byField = new Map<string, FieldGroup>()
    for (const p of programs) {
      for (const f of p.faculty) {
        if (!starred.has(advisorKey(p.id, f.id))) continue
        const primary = p.discipline.primary
        let g = byField.get(primary)
        if (!g) {
          g = { primary, hits: [] }
          byField.set(primary, g)
        }
        g.hits.push({ faculty: f, program: p })
      }
    }
    for (const g of byField.values()) {
      g.hits.sort(
        (a, b) =>
          (STATUS_RANK[a.faculty.recruitment_status] ?? 1) -
            (STATUS_RANK[b.faculty.recruitment_status] ?? 1) ||
          a.program.university.localeCompare(b.program.university) ||
          a.faculty.name.localeCompare(b.faculty.name),
      )
    }
    // Groups sorted by number of starred advisors (descending), then name.
    return [...byField.values()].sort(
      (a, b) => b.hits.length - a.hits.length || a.primary.localeCompare(b.primary),
    )
  }, [programs, starred])

  const total = groups.reduce((n, g) => n + g.hits.length, 0)

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-6xl px-5 py-4">
        <header className="mb-3">
          <h1 className="font-serif text-lg font-bold text-slate-900">Starred Advisors</h1>
          <p className="text-[12px] text-slate-500">
            Advisors you starred in the Advisor Explorer, grouped by field and ranked by how many
            you starred in each. Click ★ to remove; click a program to open its deep-dive.
          </p>
          <p className="mt-2 text-[11px] font-medium text-slate-500">
            {total} starred advisor{total === 1 ? '' : 's'} across {groups.length} field
            {groups.length === 1 ? '' : 's'}
          </p>
        </header>

        {total === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm text-slate-400">You haven't starred any advisors yet.</p>
            <p className="mt-1 text-[12px] text-slate-400">
              Go to the <span className="font-medium text-slate-600">Advisors</span> tab, search a
              research direction, and click the ☆ on any advisor card.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.primary}>
                <div className="mb-2 flex items-baseline gap-2 border-b border-slate-200 pb-1">
                  <h2 className="font-serif text-[15px] font-bold text-slate-800">{g.primary}</h2>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800">
                    {g.hits.length} ★
                  </span>
                </div>
                <div className="gap-3 lg:columns-2 2xl:columns-3">
                  {g.hits.map((h) => (
                    <StarredCard
                      key={advisorKey(h.program.id, h.faculty.id)}
                      hit={h}
                      onToggleStar={() => onToggleStar(advisorKey(h.program.id, h.faculty.id))}
                      onOpenProgram={() => onOpenProgram(h.program.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
