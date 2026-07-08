import type { DegreeType, Program, Region } from '../types'

export interface Filters {
  /** whole primary fields selected, e.g. "Geosciences" */
  primaries: Set<string>
  /** sub-field selections keyed "Primary|Sub" */
  subs: Set<string>
  degrees: Set<DegreeType>
  regions: Set<Region>
  /** keep only programs where GRE is Optional or Not Accepted */
  greFriendly: boolean
  /** USD ceiling; >= feeCap means "no limit" */
  maxFee: number
  includeUnknownFee: boolean
}

export interface Facets {
  disciplines: { primary: string; subs: string[]; count: number }[]
  degrees: DegreeType[]
  regions: Region[]
  feeCap: number
}

export const subKey = (primary: string, sub: string) => `${primary}|${sub}`

const DEGREE_ORDER: DegreeType[] = ['PhD', 'MSc', 'MRes']
const REGION_ORDER: Region[] = ['US', 'UK', 'Europe', 'Canada', 'Asia-Pacific']

export function deriveFacets(programs: Program[]): Facets {
  const byPrimary = new Map<string, Set<string>>()
  const primaryCounts = new Map<string, number>()
  for (const p of programs) {
    const { primary, subs } = p.discipline
    if (!byPrimary.has(primary)) byPrimary.set(primary, new Set())
    for (const s of subs) byPrimary.get(primary)!.add(s)
    primaryCounts.set(primary, (primaryCounts.get(primary) ?? 0) + 1)
  }
  const disciplines = [...byPrimary.entries()]
    .map(([primary, subs]) => ({
      primary,
      subs: [...subs].sort(),
      count: primaryCounts.get(primary) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.primary.localeCompare(b.primary))

  const degreesPresent = new Set(programs.map((p) => p.degree_type))
  const regionsPresent = new Set(programs.map((p) => p.region))

  const fees = programs
    .map((p) => p.requirements.application_fee_usd)
    .filter((f): f is number => f !== null)
  const maxFee = fees.length ? Math.max(...fees) : 0
  const feeCap = Math.max(25, Math.ceil(maxFee / 25) * 25)

  return {
    disciplines,
    degrees: DEGREE_ORDER.filter((d) => degreesPresent.has(d)),
    regions: REGION_ORDER.filter((r) => regionsPresent.has(r)),
    feeCap,
  }
}

export function defaultFilters(feeCap: number): Filters {
  return {
    primaries: new Set(),
    subs: new Set(),
    degrees: new Set(),
    regions: new Set(),
    greFriendly: false,
    maxFee: feeCap,
    includeUnknownFee: true,
  }
}

export function isDefault(f: Filters, feeCap: number): boolean {
  return (
    f.primaries.size === 0 &&
    f.subs.size === 0 &&
    f.degrees.size === 0 &&
    f.regions.size === 0 &&
    !f.greFriendly &&
    f.maxFee >= feeCap &&
    f.includeUnknownFee
  )
}

export type SortKey = 'university' | 'deadline' | 'fee'

export function sortPrograms(programs: Program[], key: SortKey): Program[] {
  const sorted = [...programs]
  if (key === 'university') {
    sorted.sort(
      (a, b) =>
        a.university.localeCompare(b.university) || a.program_name.localeCompare(b.program_name),
    )
  } else if (key === 'deadline') {
    // dated deadlines soonest-first; undated (paused/rolling/unknown) last
    sorted.sort((a, b) => {
      const da = a.requirements.deadline
      const db = b.requirements.deadline
      if (da === null && db === null) return a.university.localeCompare(b.university)
      if (da === null) return 1
      if (db === null) return -1
      return da.localeCompare(db)
    })
  } else {
    // fee low-to-high; unknown fees last
    sorted.sort((a, b) => {
      const fa = a.requirements.application_fee_usd
      const fb = b.requirements.application_fee_usd
      if (fa === null && fb === null) return a.university.localeCompare(b.university)
      if (fa === null) return 1
      if (fb === null) return -1
      return fa - fb
    })
  }
  return sorted
}

export function programMatches(p: Program, f: Filters, feeCap: number): boolean {
  // Discipline: empty selection = no constraint. A program matches if its
  // primary field is selected, or any of its sub-fields is selected.
  if (f.primaries.size > 0 || f.subs.size > 0) {
    const primaryHit = f.primaries.has(p.discipline.primary)
    const subHit = p.discipline.subs.some((s) => f.subs.has(subKey(p.discipline.primary, s)))
    if (!primaryHit && !subHit) return false
  }

  if (f.degrees.size > 0 && !f.degrees.has(p.degree_type)) return false
  if (f.regions.size > 0 && !f.regions.has(p.region)) return false

  if (f.greFriendly) {
    const gre = p.requirements.gre
    if (gre !== 'Optional' && gre !== 'Not Accepted') return false
  }

  if (f.maxFee < feeCap) {
    const fee = p.requirements.application_fee_usd
    if (fee === null) {
      if (!f.includeUnknownFee) return false
    } else if (fee > f.maxFee) {
      return false
    }
  }

  return true
}
