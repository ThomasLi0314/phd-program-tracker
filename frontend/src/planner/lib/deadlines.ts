// Turning a human-written deadline into something sortable.
//
// Deadlines are stored as the sentence a real page used — "Dec 15, 2026 (for
// Fall 2027 entry; 'The application deadline is December 15.')" — because that
// wording carries caveats a bare date would lose. The dashboard, though, was
// sorting those strings alphabetically, which put "Apr 1, 2027" above
// "Dec 1, 2026" and listed "Unknown/Verify…" as if it were a date.
//
// So parse a real date out of the prose, and when that is not possible say so
// instead of inventing an order.

export type DeadlineKind =
  /** a real calendar date we can sort and count down to */
  | 'dated'
  /** the program accepts applications continuously */
  | 'rolling'
  /** admissions are suspended for this cycle */
  | 'paused'
  /** nothing usable — belongs in "needs attention", not in a deadline list */
  | 'unknown'

export interface ParsedDeadline {
  kind: DeadlineKind
  /** YYYY-MM-DD, only when kind === 'dated'. */
  iso: string | null
  /** True when the source text had no year and we inferred the next occurrence. */
  yearInferred: boolean
  raw: string
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

function unparsed(raw: string, kind: DeadlineKind): ParsedDeadline {
  return { kind, iso: null, yearInferred: false, raw }
}

/**
 * Parse a stored deadline string.
 *
 * `today` is injectable so the year-inference behaviour is testable rather than
 * dependent on when the suite happens to run.
 */
export function parseDeadline(raw: string | null | undefined, today = new Date()): ParsedDeadline {
  const text = (raw ?? '').trim()
  if (!text) return unparsed('', 'unknown')

  // "Unknown/Verify (…)" and friends carry no date, however long the sentence.
  if (/^unknown\s*\/?\s*verify/i.test(text)) return unparsed(text, 'unknown')
  if (/\bpaused\b|\bsuspended\b|not admitting|no admissions/i.test(text)) return unparsed(text, 'paused')
  if (/\brolling\b|\bcontinuous\b/i.test(text)) return unparsed(text, 'rolling')

  // Explicit ISO wins — it's what the reference dataset stores machine-readably.
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  if (iso) return { kind: 'dated', iso: `${iso[1]}-${iso[2]}-${iso[3]}`, yearInferred: false, raw: text }

  // "Dec 15, 2026" / "December 15 2026" / "15 December 2026"
  const named = text.match(
    /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?\b/,
  )
  const dayFirst = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s*,?\s*(\d{4})?\b/)

  let month: number | undefined
  let day: number | undefined
  let year: number | undefined

  if (named && MONTHS[named[1].toLowerCase()]) {
    month = MONTHS[named[1].toLowerCase()]
    day = Number(named[2])
    year = named[3] ? Number(named[3]) : undefined
  } else if (dayFirst && MONTHS[dayFirst[2].toLowerCase()]) {
    month = MONTHS[dayFirst[2].toLowerCase()]
    day = Number(dayFirst[1])
    year = dayFirst[3] ? Number(dayFirst[3]) : undefined
  }

  if (!month || !day || day < 1 || day > 31) return unparsed(text, 'unknown')

  let inferred = false
  if (!year) {
    // A recurring deadline printed without a year ("January 4") means the next
    // one still ahead of us. Guessing the current year would silently mark it
    // overdue for half the year.
    const y = today.getFullYear()
    year = localNoon(y, month, day) >= startOfLocalDay(today) ? y : y + 1
    inferred = true
  }

  return { kind: 'dated', iso: `${year}-${pad(month)}-${pad(day)}`, yearInferred: inferred, raw: text }
}

// A deadline is a calendar date with no timezone, and the countdown is read by
// a person in their own timezone — so everything below works in LOCAL calendar
// days. Mixing a UTC-built target with local "now" shifted the count by a day
// for anyone not on UTC. Anchoring both at local noon also survives DST, where
// a day is 23 or 25 hours long.
function localNoon(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

function startOfLocalDay(t: Date): number {
  return localNoon(t.getFullYear(), t.getMonth() + 1, t.getDate())
}

/** Whole days from today until an ISO date. Negative once it has passed. */
export function daysUntil(iso: string, today = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((localNoon(y, m, d) - startOfLocalDay(today)) / 86_400_000)
}

/** "in 12 days" / "tomorrow" / "3 days ago" — the countdown the list is for. */
export function relativeDeadline(iso: string, today = new Date()): string {
  const n = daysUntil(iso, today)
  if (n === 0) return 'today'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n < 0) return `${Math.abs(n)} days ago`
  if (n < 45) return `in ${n} days`
  const months = Math.round(n / 30)
  return `in ~${months} month${months === 1 ? '' : 's'}`
}

/**
 * The deadline to actually use for a planner program.
 *
 * My own edit always wins. Otherwise prefer the reference dataset's
 * machine-readable ISO date over parsing its prose display string — the prose
 * exists to carry caveats, not to be re-parsed when a clean date is on hand.
 * Kept parameter-loose so it stays testable without dragging in the app types.
 */
export function resolveDeadline(
  stored: { value: unknown; origin?: string } | undefined,
  liveIso: string | null | undefined,
  today = new Date(),
): ParsedDeadline {
  const storedText = stored?.value == null ? '' : String(stored.value)
  const mine = stored && stored.origin !== 'database'
  if (mine && storedText) return parseDeadline(storedText, today)
  if (liveIso && /^\d{4}-\d{2}-\d{2}$/.test(liveIso)) {
    return { kind: 'dated', iso: liveIso, yearInferred: false, raw: storedText || liveIso }
  }
  return parseDeadline(storedText, today)
}

/** Short, sortable label: "Dec 15, 2026". */
export function formatDeadline(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const name = Object.entries(MONTHS).find(([k, v]) => v === m && k.length === 3)?.[0] ?? String(m)
  return `${name[0].toUpperCase()}${name.slice(1)} ${d}, ${y}`
}
