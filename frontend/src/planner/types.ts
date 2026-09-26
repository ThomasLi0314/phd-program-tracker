// Personal planner overlay types.
//
// DESIGN RULE (spec §2, §32, §33): the shared dataset in src/types.ts stays the
// canonical reference schema and is NOT modified to carry planner-only fields.
// Everything here is an overlay that REFERENCES canonical ids rather than
// copying reference objects. Where the reference schema already names a concept
// (GreStatus, DegreeType) we reuse its type instead of inventing a parallel one.

import type { DegreeType, GreStatus } from '../types'

/** How much I want this program. */
export type InterestLevel = 'dream' | 'strong' | 'interested' | 'maybe' | 'drop'

export type ApplicationStatus =
  | 'considering'
  | 'researching'
  | 'contacting_faculty'
  | 'preparing'
  | 'submitted'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'withdrawn'

export type ContactStatus =
  | 'not_contacted'
  | 'planning'
  | 'drafted'
  | 'sent'
  | 'replied'
  | 'meeting_scheduled'
  | 'no_response'
  | 'not_contacting'

/**
 * Normalized planner recruiting vocabulary (spec §34). The reference dataset
 * uses a coarser 3-value vocabulary; lib/recruitment.ts maps into this one and
 * NEVER invents a positive status from silence (spec §12).
 */
export type PlannerRecruitmentStatus =
  | 'actively_recruiting'
  | 'possibly_recruiting'
  | 'not_recruiting'
  | 'unknown'

export type AdmissionModel =
  | 'program_based'
  | 'direct_advisor'
  | 'rotation'
  | 'committee_based'
  | 'coursework_first'
  | 'unknown'

export type FundingLevel = 'fully_funded' | 'partial' | 'unknown'

/** Where a value came from. */
export type FieldOrigin = 'ai' | 'manual' | 'database'

/**
 * Whether a refresh may overwrite a value (spec §18). `locked` means a future
 * research run must report a disagreement rather than replace the value.
 */
export type FieldOwnership = 'auto' | 'manual' | 'locked'

export type Confidence = 'high' | 'medium' | 'low'

/**
 * Source ranking (spec §4). Lower is more authoritative; official university
 * pages must outrank third-party sites when two sources disagree.
 */
export const SOURCE_TIERS = {
  1: 'Official program admissions page',
  2: 'Official university graduate admissions page',
  3: 'Official department page',
  4: 'Official faculty/lab page',
  5: 'Reputable publication/index',
  6: 'Other source',
} as const

export type SourceTier = keyof typeof SOURCE_TIERS

export interface SourceEvidence {
  url: string
  title: string
  /** Short quoted snippet backing the value, when available. */
  snippet: string
  /** ISO date the source was read. */
  fetchedAt: string
  tier: SourceTier
}

/**
 * One researched fact plus its provenance (spec §4). Phase 1 only ever writes
 * these by hand (origin 'manual' / 'database'); Phase 2's research layer fills
 * the same shape, so no migration is needed when it lands.
 *
 * `value === null` IS "Unknown / Verify". There is deliberately no way to store
 * a guessed value — an unknown field stays null (spec §38).
 */
export interface ResearchField<T> {
  value: T | null
  origin: FieldOrigin
  ownership: FieldOwnership
  confidence: Confidence
  /** ISO date this field was last confirmed. null = never checked. */
  checkedAt: string | null
  sources: SourceEvidence[]
  /** Contradictory readings are preserved, never silently resolved (spec §38). */
  conflicts?: { value: T; source: SourceEvidence }[]
}

export interface AdmissionsResearch {
  deadline?: ResearchField<string>
  applicationsOpen?: ResearchField<boolean>
  /** Reuses the reference GreStatus vocabulary rather than a parallel one (§33). */
  gre?: ResearchField<GreStatus>
  /** Combined English-proficiency requirement, as the reference dataset states it. */
  english?: ResearchField<string>
  toefl?: ResearchField<string>
  ielts?: ResearchField<string>
  englishWaiver?: ResearchField<string>
  minGpa?: ResearchField<string>
  applicationFee?: ResearchField<string>
  feeWaiver?: ResearchField<string>
  letters?: ResearchField<number>
  sop?: ResearchField<string>
  personalStatement?: ResearchField<string>
  cv?: ResearchField<string>
  transcript?: ResearchField<string>
  writingSample?: ResearchField<string>
  otherRequirements?: ResearchField<string>
}

export interface StructureResearch {
  admissionModel?: ResearchField<AdmissionModel>
  contactEncouraged?: ResearchField<string>
  duration?: ResearchField<string>
  qualifyingExams?: ResearchField<string>
  researchAreas?: ResearchField<string>
  institutes?: ResearchField<string>
}

export interface FundingResearch {
  level?: ResearchField<FundingLevel>
  years?: ResearchField<number>
  tuitionWaiver?: ResearchField<string>
  stipend?: ResearchField<string>
  healthInsurance?: ResearchField<string>
  notes?: ResearchField<string>
}

/**
 * A planner program either points at a canonical dataset program or is one I
 * typed in myself. Both cases coexist by design (spec §2).
 */
export type ProgramRef = { kind: 'database'; programId: string } | { kind: 'custom' }

/**
 * A planner faculty member either points at a person in the dataset or is
 * custom.
 *
 * IMPORTANT: reference `Faculty.id` is only unique WITHIN one program, so it
 * cannot identify a person across programs. `mergeKey` (lib/mergeAdvisors) —
 * `universityGroup(university)::normalize(name)` — is the stable cross-program
 * person identity, which is exactly what many-to-many (spec §7) requires.
 * `seenAs` keeps every (programId, facultyId) pair the person appears under so
 * we can still read their stars, notes, outreach records and link overrides,
 * all of which are keyed by advisorKey.
 */
export type FacultyRef =
  | { kind: 'database'; mergeKey: string; seenAs: { programId: string; facultyId: string }[] }
  | { kind: 'custom' }

export interface ContactState {
  status: ContactStatus
  /** ISO dates. */
  initialContactAt: string | null
  followUpAt: string | null
  meetingAt: string | null
  notes: string
}

/** Phase 3 shape, declared now so the model doesn't need migrating later (§14). */
export interface FitAnalysis {
  /** Subjective organisation aid, NOT an admissions probability. */
  overall: number
  overlap: { theme: string; stars: number }[]
  whyFits: string[]
  mismatches: string[]
  connections: string[]
  generatedAt: string
}

/**
 * A heading the user invents to group their programs — "Reach", "Ocean
 * modelling", "Europe". The planner never assigns one: the point is that the
 * grouping is the applicant's own judgement, not a computed bucket.
 */
export interface PlannerCategory {
  id: string
  name: string
}

export interface PlannerProgram {
  id: string
  ref: ProgramRef
  /** PlannerCategory.id, or null for "no category". */
  categoryId?: string | null
  /**
   * Identity. For `kind:'database'` these are a DISPLAY CACHE so tables can
   * render and sort before the field chunk loads — referenceBridge always
   * prefers the live dataset, which stays authoritative. For `kind:'custom'`
   * these ARE the source of truth.
   */
  university: string
  programName: string
  department: string
  degree: DegreeType | null
  links: { program: string; portal: string }
  /** Target admission cycle; defaults from settings but overridable per program. */
  cycle: string
  interest: InterestLevel
  status: ApplicationStatus
  /** My own writing. Never touched by any refresh (spec §17). */
  notes: string
  admissions: AdmissionsResearch
  structure: StructureResearch
  funding: FundingResearch
  /** PlannerFaculty.id — many-to-many with faculty (spec §7). */
  facultyIds: string[]
  createdAt: string
  updatedAt: string
  lastResearchedAt: string | null
}

export interface PlannerFaculty {
  id: string
  ref: FacultyRef
  name: string
  university: string
  department: string
  title: string
  links: { faculty: string; personal: string; lab: string; scholar: string }
  email: string
  /** PlannerProgram.id — a person can advise through several programs (§7). */
  programIds: string[]
  recruiting: ResearchField<PlannerRecruitmentStatus>
  oneLiner?: ResearchField<string>
  /** 3–8 concise research themes (spec §10). */
  themes: string[]
  detailed?: ResearchField<string>
  recentResearch?: ResearchField<string>
  recentPapers: { title: string; year: number | null; url: string }[]
  fit?: FitAnalysis
  contact: ContactState
  /** My own writing. Never touched by any refresh (spec §17). */
  notes: string
  createdAt: string
  updatedAt: string
  lastResearchedAt: string | null
}

export interface PlannerSettings {
  /** Default target cycle, globally configurable (spec §3). */
  cycle: string
  /** Days after which researched admissions fields are flagged stale (spec §19). */
  staleAfterDays: number
}

export interface PlannerState {
  schemaVersion: 1
  settings: PlannerSettings
  /** The user's own groupings, in the order they arranged them. */
  categories: PlannerCategory[]
  /** "My Research Profile" — free text, fully editable (spec §13). */
  researchProfile: string
  programs: PlannerProgram[]
  faculty: PlannerFaculty[]
  updatedAt: string
}
