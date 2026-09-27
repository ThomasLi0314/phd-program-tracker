// The one date format the whole app shows: ISO 8601, YYYY-MM-DD.
//
// Deadlines reached the screen in whatever shape their source used — "Dec 15,
// 2026" on a program card, "31 January 2027" on a master's row, "15 February –
// 31 March" for a window, and the raw sentence a page used in the planner's
// table. Three formats in three views for the same kind of fact means you
// cannot compare two rows at a glance, and "4 January" next to "Jan 4, 2027"
// reads as two different dates.
//
// ISO is the format that ends the argument: unambiguous across locales, sorts
// as text, and is exactly what <input type="date"> stores — so what the picker
// writes is what the table shows. Everything that displays a date goes through
// here, which also means the decision is reversible in one place.

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(text: string | null | undefined): boolean {
  return typeof text === 'string' && ISO_DATE_RE.test(text.trim())
}

/**
 * A date in the app's format. Takes ISO in, gives ISO back, padding a sloppy
 * "2026-1-5" on the way; anything that isn't a date is returned untouched
 * rather than turned into a plausible-looking wrong one.
 */
export function formatDate(iso: string): string {
  const t = iso.trim()
  if (ISO_DATE_RE.test(t)) return t
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) return iso
  const pad = (s: string) => s.padStart(2, '0')
  return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
}

/** What a deadline with no date says instead — a state, never a half-parsed date. */
export const NO_DATE_LABEL = {
  rolling: 'Rolling',
  paused: 'Paused',
  unknown: 'Verify',
} as const
