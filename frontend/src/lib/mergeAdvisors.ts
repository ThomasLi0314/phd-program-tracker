// Collapse the same professor appearing under several program entries into one
// advisor card.
//
// WHY THIS IS CONSERVATIVE: a name alone is NOT an identity. Across the dataset,
// 152 names appear at two or more universities and nearly all of them are
// DIFFERENT PEOPLE who happen to share a common name (Wei Wang at UCLA and at
// UCSD; Bo Li, Kai Zhang, Chao Wang, …). Merging on name alone would silently
// fuse strangers into one record — exactly the kind of fabricated fact this
// project forbids.
//
// So the rule is: **same name AND same university**. The only cross-university
// merges are hand-verified aliases below, where one institution is listed under
// two labels (e.g. the MIT–WHOI joint program appears as its own "university"
// and again under MIT; 38 of its scientists were duplicated that way).
//
// This is a DISPLAY grouping only — mock_data.json is never modified, and every
// program entry keeps its own advisorKey so stars/notes/outreach still resolve
// on each program's deep-dive.
import type { Faculty, Program } from '../types'
import { advisorKey } from './starredAdvisors'

export interface AdvisorHit {
  faculty: Faculty
  program: Program
}

export interface MergedAdvisor {
  /** Stable identity = the primary entry's advisorKey. */
  key: string
  /** Display record: richest summary, unioned tags, best-known links. */
  faculty: Faculty
  /** Every program entry for this person, primary first. */
  entries: AdvisorHit[]
  /** advisorKey of every entry — stars/notes are read across and written to all. */
  keys: string[]
}

/**
 * Universities the dataset lists under more than one label, verified by hand
 * against mock_data.json. Keys and values are already normalized.
 */
const UNIVERSITY_ALIASES: Record<string, string> = {
  // The MIT–WHOI Joint Program is stored both as its own program (university
  // "MIT–WHOI Joint Program") and under MIT — 38 shared scientists.
  'mit whoi joint program': 'massachusetts institute of technology',
  // Courant is NYU's math institute; 14 shared names.
  'new york university courant': 'new york university',
  'new york university courant institute': 'new york university',
}

/** Lowercase, strip diacritics and punctuation, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Canonical university identity, resolving the verified aliases above. */
export function universityGroup(university: string): string {
  const n = normalize(university)
  return UNIVERSITY_ALIASES[n] ?? n
}

/** Identity key for a person: normalized name scoped to their university. */
export function mergeKey(name: string, university: string): string {
  return `${universityGroup(university)}::${normalize(name)}`
}

const STATUS_RANK: Record<string, number> = {
  'Looking for Students': 0,
  'Not Advising': 1,
  'Unknown/Verify': 2,
}

/**
 * The entry whose card content we show. Richest summary wins — this is what
 * keeps a curated 513-char bio instead of a scanner's one-liner for the same
 * person. Ties break deterministically so renders are stable.
 */
function pickPrimary(entries: AdvisorHit[]): AdvisorHit {
  return [...entries].sort(
    (a, b) =>
      (b.faculty.summary?.length ?? 0) - (a.faculty.summary?.length ?? 0) ||
      (b.faculty.title?.length ?? 0) - (a.faculty.title?.length ?? 0) ||
      a.program.id.localeCompare(b.program.id),
  )[0]
}

/** Union tags across entries, case-insensitively deduped, primary's first. */
function unionTags(entries: AdvisorHit[], cap = 8): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of entries) {
    for (const t of e.faculty.tags ?? []) {
      const k = normalize(t)
      if (!k || seen.has(k)) continue
      seen.add(k)
      out.push(t)
      if (out.length >= cap) return out
    }
  }
  return out
}

/**
 * Build one display Faculty from a person's entries. Facts are taken from real
 * entries only — nothing is synthesized. A definite recruitment status from any
 * entry beats "Unknown/Verify", but two conflicting definite statuses fall back
 * to the primary's rather than picking a winner.
 */
function mergeFaculty(entries: AdvisorHit[], primary: AdvisorHit): Faculty {
  const f = primary.faculty
  const definite = entries
    .map((e) => e.faculty.recruitment_status)
    .filter((s) => s && s !== 'Unknown/Verify')
  const conflicting = new Set(definite).size > 1
  const recruitment_status =
    f.recruitment_status !== 'Unknown/Verify' || conflicting || definite.length === 0
      ? f.recruitment_status
      : definite[0]

  const firstLink = (which: 'homepage' | 'scholar'): string | null => {
    for (const e of entries) {
      const v = e.faculty.links?.[which]
      if (v) return v
    }
    return null
  }

  return {
    ...f,
    tags: unionTags(entries),
    recruitment_status,
    links: { homepage: firstLink('homepage'), scholar: firstLink('scholar') },
  }
}

/**
 * Group hits by person. Order is preserved: each merged advisor lands at the
 * position of its first hit, so an upstream sort still decides the list order.
 */
export function mergeAdvisors(hits: AdvisorHit[]): MergedAdvisor[] {
  const groups = new Map<string, AdvisorHit[]>()
  const order: string[] = []
  for (const h of hits) {
    const k = mergeKey(h.faculty.name, h.program.university)
    const g = groups.get(k)
    if (g) g.push(h)
    else {
      groups.set(k, [h])
      order.push(k)
    }
  }

  return order.map((k) => {
    const entries = groups.get(k)!
    const primary = pickPrimary(entries)
    // Primary first, then the rest by university/program for a stable list.
    const rest = entries
      .filter((e) => e !== primary)
      .sort(
        (a, b) =>
          a.program.university.localeCompare(b.program.university) ||
          a.program.program_name.localeCompare(b.program.program_name),
      )
    const ordered = [primary, ...rest]
    return {
      key: advisorKey(primary.program.id, primary.faculty.id),
      faculty: mergeFaculty(ordered, primary),
      entries: ordered,
      keys: ordered.map((e) => advisorKey(e.program.id, e.faculty.id)),
    }
  })
}

/** Highest star level any of this person's program entries carries. */
export function groupLevel(keys: string[], levels: Map<string, number>): number {
  let best = 0
  for (const k of keys) best = Math.max(best, levels.get(k) ?? 0)
  return best
}

/** First non-empty note across this person's program entries. */
export function groupNote(keys: string[], notes: Map<string, string>): string {
  for (const k of keys) {
    const n = notes.get(k)
    if (n) return n
  }
  return ''
}

/** First homepage override across this person's entries, else the dataset's. */
export function groupHomepage(
  m: MergedAdvisor,
  homepages: Record<string, string>,
): string {
  for (const k of m.keys) {
    const h = homepages[k]
    if (h) return h
  }
  return m.faculty.links.homepage ?? ''
}

/** First outreach record across this person's entries. */
export function groupRecord<T>(keys: string[], records: Record<string, T>): T | undefined {
  for (const k of keys) {
    const r = records[k]
    if (r) return r
  }
  return undefined
}

/** Best-known recruitment status across the group, for sorting. */
export function statusRank(status: string): number {
  return STATUS_RANK[status] ?? 2
}
