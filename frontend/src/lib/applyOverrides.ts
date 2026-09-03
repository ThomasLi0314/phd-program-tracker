// Fold a program's user-edited admission-matrix fields into the Program object.
//
// Applied once, centrally, so the index card, the sidebar filters, the sort and
// the deep-dive all read the same value. Doing it only in the deep-dive is what
// produces the thing nobody trusts: a card saying "GRE: Verify" three
// centimetres from a panel saying the user checked it last week.

import type { GreStatus, Program } from '../types'
import { UNKNOWN } from '../types'

/** A user's free text mapped back onto the controlled value the chips and the
 *  GRE filter switch on. Unrecognised text keeps the dataset's status, so a
 *  note like "see department page" doesn't silently flip a filter. */
function normalizeGre(text: string, fallback: GreStatus): GreStatus {
  const t = text.toLowerCase()
  if (/not accept|don'?t accept|will not be considered|not considered/.test(t)) return 'Not Accepted'
  if (/optional|not required|no gre/.test(t)) return 'Optional'
  if (/required/.test(t)) return 'Required'
  return fallback
}

/** "Dec 15, 2026" -> "2026-12-15", so an edited deadline also sorts correctly.
 *  Anything unparseable leaves the dataset's ISO date alone. */
function parseDeadline(text: string, fallback: string | null): string | null {
  const cleaned = text.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  const ms = Date.parse(cleaned)
  if (Number.isNaN(ms)) return fallback
  const d = new Date(ms)
  // A bare "Dec 15" parses to the current year, which would sort wrong; require
  // the text to actually carry a 4-digit year.
  if (!/\b(19|20)\d{2}\b/.test(cleaned)) return fallback
  return d.toISOString().slice(0, 10)
}

/** "$110" / "110 USD" -> 110, for the application-fee slider. */
function parseFee(text: string, fallback: number | null): number | null {
  if (/waiv|none|no fee|free/i.test(text)) return 0
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : fallback
}

function parseLetters(text: string, fallback: number | null): number | null {
  const m = text.match(/\d+/)
  return m ? Number(m[0]) : fallback
}

export function applyFieldOverrides(
  program: Program,
  fields: Record<string, string> | undefined,
): Program {
  if (!fields || Object.keys(fields).length === 0) return program
  const r = program.requirements
  const req = { ...r }

  if (fields.deadline_display) {
    req.deadline_display = fields.deadline_display
    req.deadline = parseDeadline(fields.deadline_display, r.deadline)
  }
  if (fields.fee_display) {
    req.fee_display = fields.fee_display
    req.application_fee_usd = parseFee(fields.fee_display, r.application_fee_usd)
  }
  if (fields.gre) req.gre = normalizeGre(fields.gre, r.gre)
  if (fields.letters) req.letters = parseLetters(fields.letters, r.letters)
  if (fields.english) req.english = fields.english
  if (fields.duration) {
    req.duration = fields.duration
    // The dataset renders "duration · N ECTS"; once the user has written the
    // whole string themselves, appending ECTS again would duplicate it.
    req.ects = null
  }
  if (fields.admission_model) {
    req.admission_model = fields.admission_model
    req.admission_model_note = ''
  }
  if (fields.funding) {
    req.funding = { status: fields.funding, years: null, note: '' }
  }

  return { ...program, requirements: req }
}

/** Map a whole list through their overrides. */
export function withOverrides(
  programs: Program[],
  programFields: Record<string, Record<string, string>>,
): Program[] {
  if (!programFields || Object.keys(programFields).length === 0) return programs
  return programs.map((p) => applyFieldOverrides(p, programFields[p.id]))
}

export { UNKNOWN }
