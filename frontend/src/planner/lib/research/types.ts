// Phase 2 research types.
//
// The whole layer produces PROPOSALS, never direct writes. Nothing researched
// reaches the planner without passing through the review queue, so a model can
// never silently overwrite something I verified (spec §20).

import type { Confidence, PlannerRecruitmentStatus, SourceEvidence } from '../../types'

export type ResearchStatus = 'idle' | 'running' | 'complete' | 'partial' | 'failed'

/** Which group on the program detail page a proposal belongs to. */
export type ProgramSection = 'admissions' | 'structure' | 'funding'

/**
 * One proposed value for one field, with the evidence behind it.
 *
 * `groundedInPage` records whether the model's own quoted evidence was actually
 * found in the fetched page text. It is the single most useful integrity signal
 * we have: a plausible-sounding value whose quote does not appear in the source
 * is exactly what fabrication looks like, and it gets demoted rather than shown
 * as fact.
 */
export interface FieldProposal {
  section: ProgramSection
  key: string
  label: string
  /** null means the page did not state it — such proposals are dropped, not shown as "Unknown". */
  value: string | number | null
  evidence: string
  groundedInPage: boolean
  confidence: Confidence
  source: SourceEvidence
}

export interface FacultyProposal {
  /** Which part of the faculty record this fills. */
  key: 'title' | 'university' | 'department' | 'oneLiner' | 'detailed' | 'recentResearch' | 'themes' | 'email' | 'lab' | 'scholar' | 'recruiting'
  label: string
  value: string | string[] | PlannerRecruitmentStatus | null
  evidence: string
  groundedInPage: boolean
  confidence: Confidence
  source: SourceEvidence
}

export interface PageOutcome {
  url: string
  ok: boolean
  chars: number
  error?: string
  tier: SourceEvidence['tier']
}

export interface ProgramResearchResult {
  status: ResearchStatus
  proposals: FieldProposal[]
  pages: PageOutcome[]
  sources: SourceEvidence[]
  /** Non-fatal problems worth telling the user about. */
  warnings: string[]
  error?: string
}

export interface FacultyResearchResult {
  status: ResearchStatus
  proposals: FacultyProposal[]
  pages: PageOutcome[]
  sources: SourceEvidence[]
  warnings: string[]
  error?: string
}

/** Progress callback so the UI can show researching → complete (spec §37). */
export type ProgressFn = (msg: string) => void

/**
 * The provider abstraction (spec §28). Keeping search / extraction / LLM behind
 * one interface means the app is not welded to one vendor, and that the whole
 * planner still works when no provider is configured at all (spec §29).
 */
export interface ResearchProvider {
  readonly name: string
  /** False when no key/endpoint is configured — the UI must degrade, not break. */
  available(): boolean
  /** Plain-English reason shown when unavailable. */
  unavailableReason(): string
  researchProgram(
    input: { university: string; programName: string; cycle: string; urls: string[] },
    onProgress?: ProgressFn,
    signal?: AbortSignal,
  ): Promise<ProgramResearchResult>
  researchFaculty(
    input: { name: string; university: string; cycle: string; urls: string[] },
    onProgress?: ProgressFn,
    signal?: AbortSignal,
  ): Promise<FacultyResearchResult>
}
