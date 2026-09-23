import { Fragment, useMemo, useState } from 'react'
import type { Faculty, Program } from '../types'
import { advisorKey } from '../lib/starredAdvisors'
import { TIERS, tierRank, type TierMap } from '../lib/schoolTiers'
import { deadlineStatus } from '../lib/deadlineStatus'
import type { PlanSummary } from '../lib/planBridge'
import { APPLICATION_LABELS } from '../planner/lib/labels'
import { Badge } from './Badge'
import { PoolLoading } from './PoolLoading'

/** The application page for a program: the admissions link if the dataset has
 *  one, then any user link-fix, then the general program page. */
function admissionsUrl(p: Program, programPages: Record<string, string>): string {
  return p.links.admissions || programPages[p.id] || p.links.program || ''
}

/**
 * How a program's GRE policy reads on this table. Same words as the Explore
 * list, and it follows any edit you made to the field yourself.
 */
function greBadge(gre: string): { label: string; tone: 'indigo' | 'rose' | 'amber'; title?: string } {
  if (gre === 'Not Accepted') return { label: 'Not accepted', tone: 'indigo', title: 'Scores are not considered' }
  if (gre === 'Optional') return { label: 'Optional', tone: 'indigo', title: 'Optional / not required' }
  if (gre === 'Required') return { label: 'Required', tone: 'rose', title: 'A GRE score is required' }
  return { label: 'Not verified', tone: 'amber', title: 'No official statement found yet — check the program page' }
}

/** One school and every saved program under it — the row group the table sorts. */
interface SchoolGroup {
  university: string
  tier: string
  programs: Program[]
}

function homepageOf(p: Program, f: Faculty, homepages: Record<string, string>): string {
  return homepages[advisorKey(p.id, f.id)] || f.links.homepage || ''
}

function AdvisorList({
  program,
  addedFaculty,
  homepages,
  levels,
}: {
  program: Program
  addedFaculty: Faculty[]
  homepages: Record<string, string>
  levels: Map<string, number>
}) {
  const all = [...program.faculty, ...addedFaculty]
  const seen = new Set<string>()
  const people = all
    .filter((f) => !seen.has(f.id) && seen.add(f.id))
    .sort(
      (a, b) =>
        (levels.get(advisorKey(program.id, b.id)) ?? 0) - (levels.get(advisorKey(program.id, a.id)) ?? 0) ||
        a.name.localeCompare(b.name),
    )
  if (people.length === 0) {
    return <p className="px-3 py-2 text-[12.5px] italic text-slate-500">No advisors scanned yet.</p>
  }
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5">
      {people.map((f) => {
        const url = homepageOf(program, f, homepages)
        const level = levels.get(advisorKey(program.id, f.id)) ?? 0
        return (
          <li key={f.id} className="text-[12.5px] leading-snug">
            {level > 0 && <span className="mr-0.5 text-amber-500">{'★'.repeat(level)}</span>}
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" className="font-medium text-indigo-700 hover:underline">
                {f.name} ↗
              </a>
            ) : (
              <span className="text-slate-600" title="No homepage on file">
                {f.name}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function TierSelect({ tier, onSetTier }: { tier: string; onSetTier: (tier: string) => void }) {
  return (
    <select
      value={tier}
      onChange={(e) => onSetTier(e.target.value)}
      title="Your own tier for this school — sorts the table; saved in this browser"
      className={`rounded border px-1.5 py-0.5 text-[11.5px] font-semibold tabular-nums transition-colors ${
        tier ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-500'
      }`}
    >
      <option value="">tier</option>
      {TIERS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}

export function SavedPrograms({
  loading,
  programs,
  cycle,
  tiers,
  onSetTier,
  onToggleSaved,
  onOpenProgram,
  homepages,
  programPages,
  addedFaculty,
  levels,
  plan,
  onAddToPlan,
}: {
  loading: boolean
  programs: Program[]
  cycle: string
  tiers: TierMap
  onSetTier: (university: string, tier: string) => void
  onToggleSaved: (id: string) => void
  onOpenProgram: (id: string) => void
  homepages: Record<string, string>
  programPages: Record<string, string>
  addedFaculty: Record<string, Faculty[]>
  levels: Map<string, number>
  plan: Map<string, PlanSummary>
  onAddToPlan: (p: Program) => void | Promise<void>
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Group programs by school, then order schools by tier (unranked last),
  // breaking ties alphabetically. Programs within a school sort by name.
  const groups = useMemo<SchoolGroup[]>(() => {
    const bySchool = new Map<string, Program[]>()
    for (const p of programs) {
      const list = bySchool.get(p.university)
      if (list) list.push(p)
      else bySchool.set(p.university, [p])
    }
    const out: SchoolGroup[] = []
    for (const [university, list] of bySchool) {
      list.sort((a, b) => a.program_name.localeCompare(b.program_name))
      out.push({ university, tier: tiers[university] ?? '', programs: list })
    }
    out.sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.university.localeCompare(b.university))
    return out
  }, [programs, tiers])

  if (loading && programs.length === 0) {
    return (
      <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
        <PoolLoading what="your saved programs" />
      </main>
    )
  }

  if (programs.length === 0) {
    return (
      <main className="flex h-full flex-1 items-center justify-center bg-slate-50/40 px-6 text-center">
        <div className="max-w-md">
          <p className="font-serif text-lg font-bold text-slate-900">No saved programs yet</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">
            Click ☆ on any program in <span className="font-medium text-slate-800">Explore</span> to
            save it here. Saved is your shortlist; when you decide to apply, add it to your Plan.
          </p>
        </div>
      </main>
    )
  }

  const schoolCount = groups.length

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-5xl px-5 py-4">
        <header className="mb-3">
          <h1 className="font-serif text-lg font-bold text-slate-900">Saved programs</h1>
          <p className="text-[12.5px] text-slate-600">
            {programs.length} program{programs.length === 1 ? '' : 's'} at {schoolCount} school
            {schoolCount === 1 ? '' : 's'}, ranked by the tier you set. Saved is a shortlist —
            programs you are applying to belong in your Plan.
          </p>
        </header>

        <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <th className="w-8 px-2 py-1.5" />
                <th className="px-2 py-1.5">Program</th>
                <th className="hidden px-2 py-1.5 md:table-cell">Deadline</th>
                <th className="hidden px-2 py-1.5 md:table-cell">GRE</th>
                <th className="px-2 py-1.5">Plan</th>
                <th className="px-2 py-1.5">Apply</th>
                <th className="px-2 py-1.5 text-right">Advisors</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.university} className="border-b border-slate-200 last:border-0">
                <tr className="bg-slate-100/70">
                  <td colSpan={7} className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <TierSelect tier={g.tier} onSetTier={(t) => onSetTier(g.university, t)} />
                      <span className="font-serif text-[14px] font-bold text-slate-900">{g.university}</span>
                      <span className="text-[12px] text-slate-500">
                        {g.programs.length} program{g.programs.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </td>
                </tr>
                {g.programs.map((p) => {
                  const url = admissionsUrl(p, programPages)
                  const isOpen = expanded.has(p.id)
                  const advisors = [...p.faculty, ...(addedFaculty[p.id] ?? [])]
                  const savedCount = advisors.filter((f) => (levels.get(advisorKey(p.id, f.id)) ?? 0) > 0).length
                  const dl = deadlineStatus(p, cycle)
                  const gre = greBadge(p.requirements.gre)
                  const inPlan = plan.get(p.id)
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                        <td className="px-2 py-2">
                          <button
                            onClick={() => onToggleSaved(p.id)}
                            title="Remove from Saved programs"
                            aria-label="Remove from Saved programs"
                            className="text-[16px] leading-none text-amber-500 transition-colors hover:text-amber-600"
                          >
                            ★
                          </button>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => onOpenProgram(p.id)}
                            className="text-left text-[13.5px] font-medium leading-snug text-slate-900 hover:text-indigo-700 hover:underline"
                            title="Open this program"
                          >
                            {p.program_name}
                          </button>
                          <span className="ml-1.5 align-middle text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {p.degree_type}
                          </span>
                          <div className="mt-0.5 text-[12px] text-slate-500">
                            {p.discipline.primary}
                            <span className="md:hidden">
                              {' '}
                              · {dl.text} · GRE {gre.label.toLowerCase()}
                            </span>
                          </div>
                        </td>
                        <td className="hidden px-2 py-2 md:table-cell">
                          <Badge tone={dl.tone} title={dl.detail}>
                            {dl.kind === 'confirmed' ? '✓ ' : ''}
                            {dl.text}
                          </Badge>
                        </td>
                        <td className="hidden px-2 py-2 md:table-cell">
                          <Badge tone={gre.tone} title={gre.title}>
                            {gre.label}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-[12.5px]">
                          {inPlan ? (
                            <a
                              href={`#/planner/programs/${inPlan.entryId}`}
                              className="font-medium text-indigo-700 hover:underline"
                              title="Open in your application plan"
                            >
                              {APPLICATION_LABELS[inPlan.status]} ↗
                            </a>
                          ) : (
                            <button
                              onClick={() => void onAddToPlan(p)}
                              className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[12px] font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
                              title="Add to your application plan"
                            >
                              ＋ Plan
                            </button>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[12.5px] font-semibold text-indigo-600 hover:underline"
                            >
                              Apply ↗
                            </a>
                          ) : (
                            <span className="text-[12px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => toggle(p.id)}
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-[12px] font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:text-indigo-700"
                            title="List this program's advisors with homepage links"
                          >
                            {isOpen ? '▾' : '▸'} {advisors.length}
                            {savedCount > 0 && <span className="ml-1 text-amber-600">★{savedCount}</span>}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/80">
                          <td />
                          <td colSpan={6} className="pb-2">
                            <AdvisorList
                              program={p}
                              addedFaculty={addedFaculty[p.id] ?? []}
                              homepages={homepages}
                              levels={levels}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </main>
  )
}
