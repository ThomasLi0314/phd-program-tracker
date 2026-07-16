// Work out which school + program an advisor belongs to, so they can be added
// from the Advisor list instead of from inside a program.
//
// The school comes from the page's DOMAIN first, because that is the one signal
// that can't be paraphrased: ceoas.oregonstate.edu is Oregon State no matter how
// the page words its own name. The page's stated university name is only a
// fallback for schools absent from the domain map.
//
// The program is then SCORED, not guessed by a model: we already know every
// program that school has, so this is a small matching problem where a
// deterministic, testable function beats another API call. The UI always shows
// the pick in an editable dropdown — the routing proposes, the user disposes.
import { UNIVERSITY_DOMAINS } from './universityDomains'

export interface ProgramOption {
  id: string
  university: string
  program_name: string
  primary: string
  subs: string[]
}

export interface RouteHints {
  /** The page we fetched the advisor's card from. */
  url: string
  /** University name as the page states it (may be empty/absent). */
  university?: string
  /** Department/school/college as the page states it. */
  department?: string
  /** Extracted card fields, useful for disambiguating sibling programs. */
  subField?: string
  tags?: string[]
}

export interface RouteResult {
  university: string | null
  programId: string | null
  /** Every program at the matched school, best first. Feeds the dropdown. */
  candidates: ProgramOption[]
  confidence: 'high' | 'low' | 'none'
  /** Plain-English account of how we got here, shown to the user. */
  note: string
}

const STOP = new Set([
  'of', 'and', 'the', 'in', 'for', 'a', 'an', 'at',
  'department', 'dept', 'school', 'college', 'division', 'institute', 'program',
  'programme', 'graduate', 'phd', 'ph', 'd', 'doctoral', 'doctorate', 'msc', 'ms',
  'sciences', 'science', 'studies', 'university', 'joint',
])

export function tokens(s: string): string[] {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Universities whose root domain the host sits under. Returns ALL matches: a
 * host like mit.edu legitimately maps to both "Massachusetts Institute of
 * Technology" and "MIT–WHOI Joint Program", and the program scoring below is a
 * better judge of which one than an arbitrary tie-break here.
 */
export function universitiesForHost(host: string): string[] {
  if (!host) return []
  const out: string[] = []
  for (const [uni, domains] of Object.entries(UNIVERSITY_DOMAINS)) {
    for (const d of domains) {
      if (host === d || host.endsWith('.' + d)) {
        out.push(uni)
        break
      }
    }
  }
  return out
}

/** Match a stated university name against the ones we actually have. */
export function universityByName(name: string, universities: string[]): string[] {
  const t = tokens(name)
  if (!t.length) return []
  let best: string[] = []
  let bestScore = 0
  for (const u of universities) {
    const ut = new Set(tokens(u))
    if (!ut.size) continue
    const hits = t.filter((x) => ut.has(x)).length
    // Require most of the dataset name's tokens to be present, so "University of
    // California, Davis" can't be satisfied by the word "california" alone.
    const score = hits / ut.size
    if (score >= 0.6 && score > bestScore) {
      bestScore = score
      best = [u]
    } else if (score >= 0.6 && score === bestScore) {
      best.push(u)
    }
  }
  return best
}

/** How well a program fits the department/sub-field we read off the page. */
export function scoreProgram(p: ProgramOption, hints: RouteHints): number {
  const hay = new Set([
    ...tokens(p.program_name),
    ...tokens(p.primary),
    ...p.subs.flatMap((s) => tokens(s)),
  ])
  if (!hay.size) return 0

  const count = (src: string | undefined, weight: number) => {
    const t = tokens(src ?? '')
    if (!t.length) return 0
    return t.filter((x) => hay.has(x)).length * weight
  }

  // Department is the strongest signal — it's the unit that owns the program.
  // Sub-field disambiguates siblings ("Physical Oceanography" vs "Applied Math").
  // Tags are noisiest, so they only break ties.
  return (
    count(hints.department, 3) +
    count(hints.subField, 2) +
    (hints.tags ?? []).reduce((n, tag) => n + count(tag, 0.5), 0)
  )
}

/**
 * Route an advisor to a school + program. Never invents a school: if the domain
 * and the stated name both fail, it says so and leaves the choice to the user
 * rather than dropping them into a plausible-looking wrong program.
 */
export function routeAdvisor(hints: RouteHints, programs: ProgramOption[]): RouteResult {
  const host = hostOf(hints.url)
  const universities = [...new Set(programs.map((p) => p.university))]

  let matched = universitiesForHost(host)
  let how = matched.length ? `its domain (${host})` : ''

  if (!matched.length && hints.university) {
    matched = universityByName(hints.university, universities)
    if (matched.length) how = `the university named on the page`
  }
  // Only schools we actually hold programs for can be routed to.
  matched = matched.filter((u) => universities.includes(u))

  if (!matched.length) {
    return {
      university: null,
      programId: null,
      candidates: [],
      confidence: 'none',
      note: host
        ? `Couldn't tell which school ${host} belongs to — it may not be in the database yet. Pick one below.`
        : `Couldn't identify the school. Pick one below.`,
    }
  }

  const pool = programs.filter((p) => matched.includes(p.university))
  const scored = pool
    .map((p) => ({ p, s: scoreProgram(p, hints) }))
    .sort((a, b) => b.s - a.s || a.p.program_name.localeCompare(b.p.program_name))
  const candidates = scored.map((x) => x.p)
  const top = scored[0]
  const runnerUp = scored[1]

  if (!top) {
    return {
      university: matched[0],
      programId: null,
      candidates: [],
      confidence: 'none',
      note: `${matched[0]} has no programs in the database.`,
    }
  }

  // One program, or a clear winner → high confidence. A tie means we genuinely
  // don't know, and saying so is more useful than a coin flip.
  const clear = scored.length === 1 || (top.s > 0 && (!runnerUp || top.s >= runnerUp.s * 1.5))
  return {
    university: top.p.university,
    programId: top.p.id,
    candidates,
    confidence: clear ? 'high' : top.s > 0 ? 'low' : 'none',
    note:
      scored.length === 1
        ? `Matched ${top.p.university} from ${how}; it has one program in the database.`
        : clear
          ? `Matched ${top.p.university} from ${how}, then picked the closest of its ${scored.length} programs.`
          : `Matched ${top.p.university} from ${how}, but its programs fit about equally well — check the program below.`,
  }
}
