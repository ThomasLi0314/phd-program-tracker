import { Fragment, useMemo, useState } from 'react'
import type { Faculty, Program } from '../types'
import { UNKNOWN } from '../types'
import { advisorKey } from '../lib/starredAdvisors'
import { TIERS, tierRank, type TierMap } from '../lib/schoolTiers'
import { PoolLoading } from './PoolLoading'

/** The PhD application/admissions page for a program: the admissions link if the
 *  dataset has one, then any user link-fix, then the general program page. */
function admissionsUrl(p: Program, programPages: Record<string, string>): string {
  return p.links.admissions || programPages[p.id] || p.links.program || ''
}

function compactDeadline(p: Program): string {
  const d = p.requirements.deadline_display
  if (!d || d === UNKNOWN) return 'Verify'
  if (/paused/i.test(d)) return 'PAUSED'
  return d.replace(/\s*\(.*\)\s*/g, '').trim()
}

/** One school and every My-List program under it — the row group the table sorts. */
interface SchoolGroup {
  university: string
  tier: string
  programs: Program[]
}

function homepageOf(
  p: Program,
  f: Faculty,
  homepages: Record<string, string>,
): string {
  return homepages[advisorKey(p.id, f.id)] || f.links.homepage || ''
}

function AdvisorList({
  program,
  addedFaculty,
  homepages,
}: {
  program: Program
  addedFaculty: Faculty[]
  homepages: Record<string, string>
}) {
  // Every advisor under this program — no fields, no bios, just a link out to
  // each homepage. Added advisors are listed alongside the dataset ones.
  const all = [...program.faculty, ...addedFaculty]
  // A stale slug can list the same person twice inside one program — dedupe by id.
  const seen = new Set<string>()
  const people = all.filter((f) => !seen.has(f.id) && seen.add(f.id))
  if (people.length === 0) {
    return <p className="px-3 py-2 text-[12px] italic text-slate-400">No advisors tracked yet.</p>
  }
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5">
      {people.map((f) => {
        const url = homepageOf(program, f, homepages)
        return (
          <li key={f.id} className="text-[12.5px] leading-snug">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-700 hover:underline"
              >
                {f.name} ↗
              </a>
            ) : (
              <span className="text-slate-500" title="No homepage on file">
                {f.name}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function TierSelect({
  tier,
  onSetTier,
}: {
  tier: string
  onSetTier: (tier: string) => void
}) {
  return (
    <select
      value={tier}
      onChange={(e) => onSetTier(e.target.value)}
      title="Set this school's tier — sorts the table; your own ranking, saved in this browser"
      className={`rounded border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums transition-colors ${
        tier
          ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
          : 'border-slate-300 bg-white text-slate-400'
      }`}
    >
      <option value="">— tier</option>
      {TIERS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}

export function MyListTable({
  loading,
  programs,
  tiers,
  onSetTier,
  onToggleList,
  onOpenProgram,
  homepages,
  programPages,
  addedFaculty,
}: {
  loading: boolean
  programs: Program[]
  tiers: TierMap
  onSetTier: (university: string, tier: string) => void
  onToggleList: (id: string) => void
  onOpenProgram: (id: string) => void
  homepages: Record<string, string>
  programPages: Record<string, string>
  addedFaculty: Record<string, Faculty[]>
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
    out.sort(
      (a, b) => tierRank(a.tier) - tierRank(b.tier) || a.university.localeCompare(b.university),
    )
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
          <p className="font-serif text-lg font-bold text-slate-900">My List is empty</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            Star programs with the ☆ in the Programs tab or a program’s deep-dive. They’ll gather
            here as a ranked table you can tier yourself.
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
          <h1 className="font-serif text-lg font-bold text-slate-900">My List</h1>
          <p className="text-[12px] text-slate-500">
            {programs.length} program{programs.length === 1 ? '' : 's'} across {schoolCount} school
            {schoolCount === 1 ? '' : 's'}, ranked by the tier you set. Open a school’s advisor list
            for homepage links, or jump to the application page.
          </p>
        </header>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="w-8 px-2 py-1.5" />
                <th className="px-2 py-1.5">Program</th>
                <th className="hidden px-2 py-1.5 sm:table-cell">Field</th>
                <th className="hidden px-2 py-1.5 md:table-cell">Deadline</th>
                <th className="px-2 py-1.5">Apply</th>
                <th className="px-2 py-1.5 text-right">Advisors</th>
              </tr>
            </thead>
            {groups.map((g) => (
              <tbody key={g.university} className="border-b border-slate-200 last:border-0">
                {/* School header — carries the tier control for the whole school. */}
                <tr className="bg-slate-100/70">
                  <td colSpan={6} className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <TierSelect tier={g.tier} onSetTier={(t) => onSetTier(g.university, t)} />
                      <span className="font-serif text-[14px] font-bold text-slate-900">
                        {g.university}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {g.programs.length} program{g.programs.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  </td>
                </tr>
                {g.programs.map((p) => {
                  const url = admissionsUrl(p, programPages)
                  const isOpen = expanded.has(p.id)
                  const advisors = [...p.faculty, ...(addedFaculty[p.id] ?? [])]
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                        <td className="px-2 py-2">
                          <button
                            onClick={() => onToggleList(p.id)}
                            title="Remove from My List"
                            aria-label="Remove from My List"
                            className="text-[15px] leading-none text-amber-500 transition-colors hover:text-amber-600"
                          >
                            ★
                          </button>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            onClick={() => onOpenProgram(p.id)}
                            className="text-left text-[13px] font-medium leading-snug text-slate-800 hover:text-indigo-700 hover:underline"
                            title="Open this program’s deep-dive"
                          >
                            {p.program_name}
                          </button>
                          <span className="ml-1.5 rounded bg-slate-700 px-1 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-wide text-white">
                            {p.degree_type}
                          </span>
                          <div className="mt-0.5 text-[11px] text-slate-400 sm:hidden">
                            {p.discipline.primary} · {compactDeadline(p)}
                          </div>
                        </td>
                        <td className="hidden px-2 py-2 text-[12px] text-slate-600 sm:table-cell">
                          {p.discipline.primary}
                        </td>
                        <td className="hidden px-2 py-2 text-[12px] text-slate-600 md:table-cell">
                          {compactDeadline(p)}
                        </td>
                        <td className="px-2 py-2">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[12px] font-semibold text-indigo-600 hover:underline"
                            >
                              Apply ↗
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            onClick={() => toggle(p.id)}
                            className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700"
                            title="List this program’s advisors with homepage links"
                          >
                            {isOpen ? '▾' : '▸'} {advisors.length}
                          </button>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-slate-50/80">
                          <td />
                          <td colSpan={5} className="pb-2">
                            <AdvisorList
                              program={p}
                              addedFaculty={addedFaculty[p.id] ?? []}
                              homepages={homepages}
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
