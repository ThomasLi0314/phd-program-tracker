// Recommendation letters: who is writing for which program, and how far along
// each letter is. The people are entered once (PlannerState.recommenders); each
// program keeps its own list of letters pointing at them.

import type { LetterStatus, PlannerProgram, ProgramLetter, Recommender } from '../types'
import { LETTER_LABELS } from './labels'

/** A program's letters — none for plans saved before letters were tracked. */
export function lettersOf(p: PlannerProgram): ProgramLetter[] {
  return Array.isArray(p.letters) ? p.letters : []
}

/**
 * How many letters the program asks for, from its Admissions field — a number
 * from the database, or whatever I typed over it. null when nobody knows.
 */
export function requiredLetters(p: PlannerProgram): number | null {
  const v = p.admissions.letters?.value as unknown
  if (typeof v === 'number' && v > 0) return v
  if (typeof v === 'string') {
    const m = v.match(/\d+/)
    if (m && Number(m[0]) > 0) return Number(m[0])
  }
  return null
}

/** Done, from the applicant's side: nothing left to chase. */
export const isLetterIn = (s: LetterStatus) => s === 'received'

export interface LetterSummary {
  /** letters assigned and not declined */
  active: number
  received: number
  /** what the program asks for, if known */
  required: number | null
  /** the bar to measure against: what is required, else what I've lined up */
  target: number
  /** every letter in, and at least as many as required */
  complete: boolean
}

export function letterSummary(p: PlannerProgram): LetterSummary {
  const letters = lettersOf(p)
  const active = letters.filter((l) => l.status !== 'declined').length
  const received = letters.filter((l) => isLetterIn(l.status)).length
  const required = requiredLetters(p)
  const target = required ?? active
  return { active, received, required, target, complete: target > 0 && received >= target }
}

/** "Lee: Letter received; Smith: Invitation sent" — for the Google Sheet. */
export function lettersText(p: PlannerProgram, byId: Map<string, Recommender>): string {
  return lettersOf(p)
    .map((l) => `${byId.get(l.recommenderId)?.name ?? 'Unknown writer'}: ${LETTER_LABELS[l.status]}`)
    .join('; ')
}
