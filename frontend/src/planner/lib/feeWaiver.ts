// Application-fee waivers: whether a program will waive its fee for me, what
// that takes, and how far a request has got.
//
// This used to be one line of text on each program's page — "Needs a one page
// letter" on one, "Negative" on the next — which answered a different question
// on every program and could only be read by opening them one at a time. It is
// now two things: a status, which the Programs table shows as a coloured chip,
// and the note, which keeps saying what the waiver takes in my own words.

import type { FeeWaiverStatus, PlannerProgram } from '../types'
import { FEE_WAIVER_ORDER } from './labels'

export interface FeeWaiver {
  status: FeeWaiverStatus
  /** The status was read off the note, not picked — see inferFeeWaiverStatus. */
  inferred: boolean
  /** What the waiver takes, as written on the program's page. '' when blank. */
  note: string
}

const NO_WAIVER =
  /^(negative|no|none|n\/a|unavailable|ineligible)\b|\bnot (available|eligible|offered)\b|\bno (fee )?waivers?\b|\b(cannot|can[’']?t|will not|won[’']?t) be waived\b|non-?waivable|\bdo(es)? not (offer|grant|provide)\b/i

const AUTOMATIC = /\bautomatic(ally)?\b|\bauto-?waived\b/i

/**
 * A status for a note written before there was one to pick.
 *
 * Only ever one of the three things a note can say about the program: there is
 * no waiver, there is one without asking, or there is one to ask for. It never
 * reads progress into the words — "requested" and "granted" are mine to set.
 */
export function inferFeeWaiverStatus(note: string): FeeWaiverStatus {
  const t = note.trim()
  if (!t) return 'unknown'
  if (NO_WAIVER.test(t)) return 'not_available'
  if (AUTOMATIC.test(t)) return 'automatic'
  return 'to_request'
}

/** A program's fee waiver: the status I picked, or else what my note says. */
export function feeWaiverOf(p: PlannerProgram): FeeWaiver {
  const v = p.admissions.feeWaiver?.value
  const note = v == null ? '' : String(v).trim()
  if (p.feeWaiverStatus && FEE_WAIVER_ORDER.includes(p.feeWaiverStatus)) {
    return { status: p.feeWaiverStatus, inferred: false, note }
  }
  return { status: inferFeeWaiverStatus(note), inferred: note !== '', note }
}

/** Nothing to pay: waived without asking, or my request came through. */
export const isFeeWaived = (s: FeeWaiverStatus) => s === 'automatic' || s === 'granted'

/**
 * The fee as a table cell. The stored value is the sentence a page used —
 * "$95 (international) / $75 (domestic) — Graduate School application fee; …"
 * — so keep the amounts and leave the explanation for the tooltip. null when
 * there is no amount to show.
 */
export function feeShort(text: string | null | undefined): string | null {
  const t = (text ?? '').trim()
  if (!t || /^unknown/i.test(t)) return null
  // Up to the first clause break, minus a parenthesis that break cut open.
  let head = t.split(/\s+[—–]\s+|[.;:]\s/)[0].replace(/\s*\([^)]*$/, '').trim()
  // Still a mouthful: the asides in brackets are the part that can go.
  if (head.length > 32) head = head.replace(/\s*\([^)]*\)/g, '').trim()
  return head || null
}
