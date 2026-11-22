// When a program's recommendation letters are due, where that is not simply
// the application deadline.
//
// Stored the way the deadline is — in the words of the page ("Dec 22, 2026 —
// letters are accepted for a week after the deadline") — because programs
// state this as a rule about as often as a date.
//
// A date is read out of that text only when the text leads up to it as the
// letters' own date. "Up to two weeks after December 1" names a date that is
// NOT when letters are due, and showing a writer December 1 — or worse, letting
// them think a later date is safe — is the one mistake this file exists to
// avoid. When no date can be trusted, the words are shown instead.

import type { PlannerProgram } from '../types'
import { parseDeadline, type ParsedDeadline } from './deadlines'

export interface LetterDue {
  /** YYYY-MM-DD — the letters' own date, when the text gives one */
  iso: string | null
  /** the stored text, whole: the rule to show when there is no date */
  note: string
  /** the text had no year, so one was chosen (see nearestYear) */
  yearInferred: boolean
  /** the text's date belongs to another cycle: kept for me, never shown to a writer */
  offCycle: boolean
}

/**
 * Letters fall due within weeks of the application. A date months away from it
 * was read off a page still showing another cycle's dates.
 */
const CYCLE_SLACK_DAYS = 120

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const YEAR = '(?:\\s*,?\\s*\\d{4})?'
const ORDINAL = '(?:st|nd|rd|th)?'

/** The first thing in the text that reads as a calendar date, exactly as written. */
const DATE_TOKEN = new RegExp(
  `\\b\\d{4}-\\d{2}-\\d{2}\\b` +
    `|\\b${MONTH}\\.?\\s+\\d{1,2}${ORDINAL}${YEAR}\\b` +
    `|\\b\\d{1,2}${ORDINAL}\\s+${MONTH}\\.?${YEAR}\\b`,
  'i',
)

/**
 * Words that, standing before a date, make it a reference point rather than
 * the due date: "two weeks AFTER Dec 1", "WITHIN 10 DAYS of Dec 1".
 */
const OFFSET_BEFORE = /\b(after|following|follows?|past|beyond|within|grace|hours?|days?|weeks?|months?)\b/i

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * The year that puts a yearless date nearest the application deadline. Letters
 * are due within weeks of it, so "January 5" beside a December 15, 2026
 * deadline is January 2027 — whatever today's date happens to be.
 */
function nearestYear(iso: string, anchorIso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  const [ay, am, ad] = anchorIso.split('-').map(Number)
  const anchor = Date.UTC(ay, am - 1, ad)
  let best = iso
  let gap = Infinity
  for (const y of [ay - 1, ay, ay + 1]) {
    const g = Math.abs(Date.UTC(y, m - 1, d) - anchor)
    if (g < gap) {
      gap = g
      best = `${y}-${pad(m)}-${pad(d)}`
    }
  }
  return best
}

/**
 * Read a stored letter deadline. null when nothing is stored — the program has
 * no rule of its own on record, and the application deadline stands.
 *
 * `applicationIso` is the application deadline, used only to pick a year for a
 * date written without one.
 */
export function parseLetterDeadline(
  raw: string | null | undefined,
  applicationIso?: string | null,
  today = new Date(),
): LetterDue | null {
  const note = (raw ?? '').replace(/\s+/g, ' ').trim()
  if (!note) return null

  const m = note.match(DATE_TOKEN)
  if (m && m.index !== undefined && !OFFSET_BEFORE.test(note.slice(0, m.index))) {
    const parsed = parseDeadline(m[0], today)
    if (parsed.kind === 'dated' && parsed.iso) {
      const iso = parsed.yearInferred && applicationIso ? nearestYear(parsed.iso, applicationIso) : parsed.iso
      const offCycle = applicationIso
        ? Math.abs(Date.parse(iso) - Date.parse(applicationIso)) > CYCLE_SLACK_DAYS * 86_400_000
        : today.getTime() - Date.parse(iso) > CYCLE_SLACK_DAYS * 86_400_000
      return { iso: offCycle ? null : iso, note, yearInferred: parsed.yearInferred, offCycle }
    }
  }
  return { iso: null, note, yearInferred: false, offCycle: false }
}

const isoOf = (application: ParsedDeadline) => (application.kind === 'dated' ? application.iso : null)

/** A planner program's letter deadline, given its (already resolved) application deadline. */
export function letterDueOf(entry: PlannerProgram, application: ParsedDeadline): LetterDue | null {
  const v = entry.admissions.letterDeadline?.value
  return parseLetterDeadline(v == null ? '' : String(v), isoOf(application))
}

/** The day a writer should go by: the letters' own date, else the application's. */
export function writerDueIso(application: ParsedDeadline, due: LetterDue | null): string | null {
  return due?.iso ?? isoOf(application)
}

/**
 * The fields a checklist row carries for this: the date, or — only when there
 * is no date — the rule, cut to what fits a cell. Nothing at all when the
 * program has no rule of its own, so a checklist without any stays as it was.
 */
export function letterDueCells(due: LetterDue | null): { letterDueIso?: string; letterDueNote?: string } {
  if (!due || due.offCycle) return {}
  if (due.iso) return { letterDueIso: due.iso }
  return { letterDueNote: due.note.length > 140 ? `${due.note.slice(0, 139).trimEnd()}…` : due.note }
}
