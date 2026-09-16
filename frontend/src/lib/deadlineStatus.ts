// What a deadline on a program card actually means.
//
// The dataset carries three different things under one label. Some deadlines
// fall inside the target cycle's application window — the date to plan
// around. Some are last cycle's date, still on the page and already in the
// past: a hint of when this program usually closes, not a date to plan around.
// And some are "Unknown/Verify". Showing all three as "Deadline: <text>" in
// the same amber badge made a stale date look like a commitment, so every
// deadline is classified before it is shown.

import type { Program } from '../types'
import { UNKNOWN } from '../types'
import type { Tone } from '../components/Badge'

export type DeadlineKind =
  /** a future date inside the target cycle's application window */
  | 'confirmed'
  /** a future date beyond the target cycle's window — a later cycle's date */
  | 'upcoming'
  /** the date has passed — a prior cycle's deadline, reference only */
  | 'past'
  | 'paused'
  | 'rolling'
  | 'unknown'

export interface DeadlineStatus {
  kind: DeadlineKind
  /** the compact text for a badge: "Dec 15, 2026" / "Verify" / "Paused" */
  text: string
  /** one-line explanation for a tooltip or the detail tile */
  detail: string
  tone: Tone
  /** YYYY-MM-DD when a real date is known */
  iso: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/**
 * The application window for a cycle: for "Fall 2027" everything from
 * 1 Aug 2026 to 31 Aug 2027. A deadline in there is this cycle's; a program
 * cannot be showing a *future* date that belongs to last year.
 */
export function cycleWindow(cycle: string): { start: string; end: string } | null {
  const year = Number(cycle.match(/\b(20\d{2})\b/)?.[1])
  if (!year) return null
  return { start: `${year - 1}-08-01`, end: `${year}-08-31` }
}

function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function deadlineStatus(p: Program, cycle: string, today = new Date()): DeadlineStatus {
  const r = p.requirements
  const display = (r.deadline_display ?? '').trim()
  const iso = r.deadline && /^\d{4}-\d{2}-\d{2}$/.test(r.deadline) ? r.deadline : null

  if (/\bpaused\b|\bsuspended\b|not admitting|no admissions/i.test(display)) {
    return { kind: 'paused', text: 'Paused', detail: display, tone: 'rose', iso: null }
  }
  if (/\brolling\b|\bcontinuous\b/i.test(display)) {
    return { kind: 'rolling', text: 'Rolling', detail: display, tone: 'sky', iso: null }
  }
  if (!iso) {
    const known = display && display !== UNKNOWN
    return {
      kind: 'unknown',
      text: known ? display.replace(/\s*\(.*\)\s*/g, '').trim().slice(0, 40) : 'Verify',
      detail: known
        ? `${display} — no machine-readable date; confirm on the program page.`
        : 'No deadline confirmed on an official page yet.',
      tone: 'amber',
      iso: null,
    }
  }

  const date = formatIso(iso)
  if (iso < localDay(today)) {
    return {
      kind: 'past',
      text: `${date} · last cycle`,
      detail:
        'This date has passed. It is the prior cycle\'s deadline, kept as a reference for when this program usually closes — not a date to plan around.',
      tone: 'slate',
      iso,
    }
  }

  const win = cycleWindow(cycle)
  if (!win || (iso >= win.start && iso <= win.end)) {
    return {
      kind: 'confirmed',
      text: date,
      detail: `${display} — falls in the ${cycle} application window.`,
      tone: 'emerald',
      iso,
    }
  }
  return {
    kind: 'upcoming',
    text: `${date} · later cycle`,
    detail: `${display} — this date is beyond the ${cycle} application window.`,
    tone: 'sky',
    iso,
  }
}

/** Short label for the kind, for legends and tile captions. */
export const DEADLINE_KIND_LABEL: Record<DeadlineKind, string> = {
  confirmed: 'This cycle',
  upcoming: 'A later cycle',
  past: 'Prior cycle · reference only',
  paused: 'Admissions paused',
  rolling: 'Rolling admissions',
  unknown: 'Not verified yet',
}
