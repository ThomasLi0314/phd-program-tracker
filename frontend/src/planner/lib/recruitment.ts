// Mapping between the reference dataset's recruiting vocabulary and the
// planner's normalized one (spec §34).
//
// THE RULE THAT MATTERS (spec §12): absence of recruiting language must never
// imply that a professor is recruiting. The reference dataset's
// "Unknown/Verify" maps to 'unknown' and stops there — nothing in this file can
// promote a silent page to 'possibly_recruiting'. That upgrade requires actual
// weak evidence, which only a research run (Phase 2) or I can supply by hand.

import type { RecruitmentStatus } from '../../types'
import type { PlannerRecruitmentStatus } from '../types'

/** Reference → planner. Total and lossless: the reference has only 3 values. */
export function fromReference(status: RecruitmentStatus): PlannerRecruitmentStatus {
  switch (status) {
    case 'Looking for Students':
      return 'actively_recruiting'
    case 'Not Advising':
      return 'not_recruiting'
    default:
      return 'unknown'
  }
}

/**
 * Planner → reference, for anything that has to round-trip into the canonical
 * schema. 'possibly_recruiting' has no reference equivalent and deliberately
 * degrades to "Unknown/Verify" rather than being rounded up to a claim the
 * dataset would then present as verified.
 */
export function toReference(status: PlannerRecruitmentStatus): RecruitmentStatus {
  switch (status) {
    case 'actively_recruiting':
      return 'Looking for Students'
    case 'not_recruiting':
      return 'Not Advising'
    default:
      return 'Unknown/Verify'
  }
}

export const RECRUITMENT_LABELS: Record<PlannerRecruitmentStatus, string> = {
  actively_recruiting: 'Actively Recruiting',
  possibly_recruiting: 'Possibly Recruiting',
  not_recruiting: 'Not Recruiting',
  unknown: 'Unknown',
}

/** Spec §12 uses these dots so status is scannable in dense tables. */
export const RECRUITMENT_DOTS: Record<PlannerRecruitmentStatus, string> = {
  actively_recruiting: '🟢',
  possibly_recruiting: '🟡',
  not_recruiting: '🔴',
  unknown: '⚪',
}

export const RECRUITMENT_ORDER: PlannerRecruitmentStatus[] = [
  'actively_recruiting',
  'possibly_recruiting',
  'not_recruiting',
  'unknown',
]

/** Sort rank — the ones worth emailing first. */
export function recruitmentRank(status: PlannerRecruitmentStatus): number {
  return RECRUITMENT_ORDER.indexOf(status)
}

/** Counts as a lead worth contacting (spec §21's "Actively/Possibly Recruiting" tile). */
export function isLikelyRecruiting(status: PlannerRecruitmentStatus): boolean {
  return status === 'actively_recruiting' || status === 'possibly_recruiting'
}
