// What the plan shows for an entry: my own value when I typed one, otherwise
// the dataset's, otherwise an honest "Unknown / Verify". Each resolved value
// says which of the three answered, so the UI never passes a national tuition
// rule or last year's deadline off as something I confirmed.

import type { CountryPolicy, EuroProgram, ScholarshipLevel } from '../types'
import { effectiveTuition, isUnknown, tuitionLabels } from '../types'
import { parseDeadline, type ParsedDeadline } from '../../planner/lib/deadlines'
import type { MastersPlanEntry } from './types'

export type Origin = 'mine' | 'program' | 'country' | 'none'

export interface Resolved {
  text: string | null
  origin: Origin
  note?: string
  source?: string
}

export interface ResolvedEntry {
  live: EuroProgram | null
  countryPolicy: CountryPolicy | undefined
  university: string
  programName: string
  city: string
  country: string
  website: string
  portal: string
  deadline: Resolved & { parsed: ParsedDeadline }
  scholarshipDeadline: Resolved
  tuition: Resolved & { label: string }
  applicationFee: Resolved
  english: Resolved
  scholarshipLevel: ScholarshipLevel | null
}

/**
 * Parse a master's deadline. Two shapes the PhD parser was not written for:
 *
 *  - an application WINDOW ("15 February – 31 March", "1 Oct 2026 – 31 Mar
 *    2027"): the deadline is where the window ends, not where it opens;
 *  - "Closed for 2026 entry; round 2 previously closed 7 January": a note about
 *    last cycle, not a date to count down to.
 */
export function parseMastersDeadline(text: string | null | undefined, today = new Date()): ParsedDeadline {
  const t = (text ?? '').trim()
  if (!t) return parseDeadline('', today)
  if (/\bclosed\b|not yet open/i.test(t)) return { kind: 'unknown', iso: null, yearInferred: false, raw: t }
  const parts = t.split(/\s[–—]\s|\s-\s/)
  if (parts.length > 1) {
    const end = parseDeadline(parts[parts.length - 1], today)
    if (end.kind === 'dated') return { ...end, raw: t }
  }
  return parseDeadline(t, today)
}

const mine = (value: string | null): Resolved | null => (value ? { text: value, origin: 'mine' } : null)

export function resolveEntry(
  entry: MastersPlanEntry,
  byId: Map<string, EuroProgram>,
  countries: Map<string, CountryPolicy>,
): ResolvedEntry {
  const live = entry.ref.kind === 'database' ? (byId.get(entry.ref.programId) ?? null) : null
  const countryName = live?.country ?? entry.country
  const countryPolicy = countries.get(countryName)

  const fromDataset = (s: { value: string | null; note?: string; source?: string } | undefined): Resolved =>
    s && !isUnknown(s) ? { text: String(s.value), origin: 'program', note: s.note, source: s.source } : { text: null, origin: 'none' }

  const deadline = mine(entry.mine.deadline) ?? fromDataset(live?.deadline)

  let tuition: Resolved = mine(entry.mine.tuition) ?? { text: null, origin: 'none' }
  if (tuition.origin === 'none' && live) {
    const t = effectiveTuition(live, countryPolicy)
    if (!isUnknown(t.non_eu)) {
      tuition = {
        text: String(t.non_eu.value),
        origin: t.from === 'program' ? 'program' : 'country',
        note: t.non_eu.note,
        source: t.non_eu.source,
      }
    }
  }

  return {
    live,
    countryPolicy,
    university: live?.university ?? entry.university,
    programName: live?.program_name ?? entry.programName,
    city: live?.city ?? entry.city,
    country: countryName,
    website: live?.links.program || entry.links.program,
    portal: entry.links.portal,
    deadline: { ...deadline, parsed: parseMastersDeadline(deadline.text) },
    scholarshipDeadline: mine(entry.mine.scholarshipDeadline) ?? { text: null, origin: 'none' },
    tuition: { ...tuition, label: tuitionLabels(countryPolicy).international },
    applicationFee: mine(entry.mine.applicationFee) ?? { text: null, origin: 'none' },
    english: mine(entry.mine.english) ?? fromDataset(live?.english),
    scholarshipLevel: live?.scholarship.level ?? null,
  }
}

/** Where a resolved value came from, in words, for tooltips and the export. */
export function originLabel(r: Resolved, country?: CountryPolicy): string {
  if (r.origin === 'mine') return 'my entry'
  if (r.origin === 'program') return 'database'
  if (r.origin === 'country')
    return country?.basis === 'per-programme' ? 'regional range, not this programme' : 'national rule'
  return ''
}
