// "My master's plan" — the application planner for the Master's Abroad page.
//
// It is the PhD planner's sibling, not a copy of it. A taught master's has no
// advisor to find and no funding package to decode; what you track is whether
// the application goes out on time, what it will cost, whether you are also
// applying for a scholarship, and which documents are still missing. So the
// overlay is smaller, and it lives under its own storage key.
//
// The same rule as the PhD planner holds: the dataset in ../types stays the
// reference, and an entry only POINTS at a dataset programme. The values I type
// in (`mine`) sit beside the dataset's values and win over them for display;
// they never overwrite the reference, and an empty one falls back to it.

import type { InterestLevel } from '../../planner/types'
import type { Tone } from '../../planner/lib/labels'

export type MastersStatus =
  | 'considering'
  | 'preparing'
  | 'submitted'
  | 'interview'
  | 'waitlisted'
  | 'offer'
  | 'accepted'
  | 'declined'
  | 'rejected'
  | 'withdrawn'

/** My scholarship application for this programme — separate from the admission. */
export type ScholarshipApp =
  | 'undecided'
  | 'planning'
  | 'applied'
  | 'awarded'
  | 'not_awarded'
  | 'not_applying'

export interface ChecklistItem {
  id: string
  label: string
  done: boolean
}

export type MastersRef = { kind: 'database'; programId: string } | { kind: 'custom' }

/** Values I entered myself. null = not entered, so the dataset's value shows. */
export interface MineValues {
  deadline: string | null
  scholarshipDeadline: string | null
  tuition: string | null
  applicationFee: string | null
  english: string | null
}

export interface MastersPlanEntry {
  id: string
  ref: MastersRef
  /**
   * Identity. For database entries this is a display cache (the live dataset
   * wins once it has loaded); for custom entries it is the only copy.
   */
  university: string
  programName: string
  city: string
  country: string
  links: { program: string; portal: string }
  /** Intake I am applying for; defaults from the plan's cycle. */
  intake: string
  interest: InterestLevel
  status: MastersStatus
  scholarship: ScholarshipApp
  mine: MineValues
  checklist: ChecklistItem[]
  /** ISO date the application went out, when I record it. */
  submittedOn: string | null
  /** My own writing. Nothing else ever touches it. */
  notes: string
  createdAt: string
  updatedAt: string
}

export interface MastersPlanState {
  schemaVersion: 1
  settings: { cycle: string }
  programs: MastersPlanEntry[]
  updatedAt: string
}

export const EMPTY_MINE: MineValues = {
  deadline: null,
  scholarshipDeadline: null,
  tuition: null,
  applicationFee: null,
  english: null,
}

/** What almost every taught master's asks for. Editable per programme. */
export const DEFAULT_CHECKLIST = [
  'Transcripts',
  'CV / résumé',
  'Statement of purpose / motivation letter',
  'Reference letters',
  'English test score',
  'Passport copy',
  'Application fee paid',
]

export const STATUS_ORDER: MastersStatus[] = [
  'considering',
  'preparing',
  'submitted',
  'interview',
  'waitlisted',
  'offer',
  'accepted',
  'declined',
  'rejected',
  'withdrawn',
]

export const STATUS_LABELS: Record<MastersStatus, string> = {
  considering: 'Considering',
  preparing: 'Preparing',
  submitted: 'Submitted',
  interview: 'Interview',
  waitlisted: 'Waitlisted',
  offer: 'Offer',
  accepted: 'Accepted offer',
  declined: 'Declined offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const STATUS_TONES: Record<MastersStatus, Tone> = {
  considering: 'slate',
  preparing: 'amber',
  submitted: 'emerald',
  interview: 'emerald',
  waitlisted: 'sky',
  offer: 'emerald',
  accepted: 'indigo',
  declined: 'slate',
  rejected: 'rose',
  withdrawn: 'slate',
}

/** The application has gone out (or the question is settled) — no deadline alarm. */
export const PAST_DEADLINE_STATUSES: MastersStatus[] = [
  'submitted',
  'interview',
  'waitlisted',
  'offer',
  'accepted',
  'declined',
  'rejected',
  'withdrawn',
]

export const OFFER_STATUSES: MastersStatus[] = ['offer', 'accepted', 'declined']

export const SCHOLARSHIP_ORDER: ScholarshipApp[] = [
  'undecided',
  'planning',
  'applied',
  'awarded',
  'not_awarded',
  'not_applying',
]

export const SCHOLARSHIP_LABELS: Record<ScholarshipApp, string> = {
  undecided: 'Not decided',
  planning: 'Planning to apply',
  applied: 'Applied',
  awarded: 'Awarded',
  not_awarded: 'Not awarded',
  not_applying: 'Not applying',
}
