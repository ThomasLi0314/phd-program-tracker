// One place for every planner vocabulary's display text, order and tone, so a
// status never renders as "preparing" in one view and "Preparing" in another.

import type {
  AdmissionModel,
  ApplicationStatus,
  ContactStatus,
  FundingLevel,
  InterestLevel,
} from '../types'

export type Tone = 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky'

export const INTEREST_ORDER: InterestLevel[] = ['dream', 'strong', 'interested', 'maybe', 'drop']

export const INTEREST_LABELS: Record<InterestLevel, string> = {
  dream: 'Dream',
  strong: 'Strong Interest',
  interested: 'Interested',
  maybe: 'Maybe',
  drop: 'Drop',
}

export const INTEREST_TONES: Record<InterestLevel, Tone> = {
  dream: 'rose',
  strong: 'indigo',
  interested: 'sky',
  maybe: 'slate',
  drop: 'slate',
}

export const APPLICATION_ORDER: ApplicationStatus[] = [
  'considering',
  'researching',
  'contacting_faculty',
  'preparing',
  'submitted',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
]

export const APPLICATION_LABELS: Record<ApplicationStatus, string> = {
  considering: 'Considering',
  researching: 'Researching',
  contacting_faculty: 'Contacting Faculty',
  preparing: 'Preparing Application',
  submitted: 'Submitted',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
}

export const APPLICATION_TONES: Record<ApplicationStatus, Tone> = {
  considering: 'slate',
  researching: 'sky',
  contacting_faculty: 'indigo',
  preparing: 'amber',
  submitted: 'emerald',
  interview: 'emerald',
  offer: 'emerald',
  rejected: 'rose',
  withdrawn: 'slate',
}

/** Statuses that mean the application actually went out (dashboard tile). */
export const SUBMITTED_STATUSES: ApplicationStatus[] = ['submitted', 'interview', 'offer', 'rejected']

export const CONTACT_ORDER: ContactStatus[] = [
  'not_contacted',
  'planning',
  'drafted',
  'sent',
  'replied',
  'meeting_scheduled',
  'no_response',
  'not_contacting',
]

export const CONTACT_LABELS: Record<ContactStatus, string> = {
  not_contacted: 'Not Contacted',
  planning: 'Planning to Contact',
  drafted: 'Email Drafted',
  sent: 'Email Sent',
  replied: 'Replied',
  meeting_scheduled: 'Meeting Scheduled',
  no_response: 'No Response',
  not_contacting: 'Not Contacting',
}

export const CONTACT_TONES: Record<ContactStatus, Tone> = {
  not_contacted: 'slate',
  planning: 'sky',
  drafted: 'amber',
  sent: 'indigo',
  replied: 'emerald',
  meeting_scheduled: 'emerald',
  no_response: 'rose',
  not_contacting: 'slate',
}

export const ADMISSION_MODEL_LABELS: Record<AdmissionModel, string> = {
  program_based: 'Program-based',
  direct_advisor: 'Direct advisor',
  rotation: 'Rotation',
  committee_based: 'Committee-based',
  coursework_first: 'Coursework-first',
  unknown: 'Unknown',
}

export const FUNDING_LABELS: Record<FundingLevel, string> = {
  fully_funded: 'Fully Funded',
  partial: 'Partial',
  unknown: 'Unknown',
}

/** What the UI shows wherever a researched value is absent (spec §38). */
export const UNKNOWN_LABEL = 'Unknown / Verify'

export const TONE_CLASSES: Record<Tone, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
}
