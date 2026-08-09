// Provider registry (spec §28).
//
// One place decides which research implementation is in play and whether it is
// usable at all. The planner must stay fully functional with no provider
// configured (spec §29), so `available()` is checked by the UI before any
// research button does anything, and the reason is shown rather than a failure.

import { hasCredentials, loadBaseUrl } from './llm'
import { researchProgram } from './programResearch'
import { researchFaculty } from './facultyResearch'
import type { ResearchProvider } from './types'

/** Reads real pages via r.jina.ai, then extracts with an OpenAI-compatible model. */
export const pageAndModelProvider: ResearchProvider = {
  name: 'Page reader + model',
  available: () => hasCredentials(),
  unavailableReason: () =>
    'No model API key is configured. Add one in the tracker’s 📊 Overview → DeepSeek settings, then come back — ' +
    'everything else in the planner works without it.',
  researchProgram,
  researchFaculty,
}

export function getProvider(): ResearchProvider {
  return pageAndModelProvider
}

/** For the settings panel: what the research layer is currently pointed at. */
export function providerSummary(): { name: string; endpoint: string; ready: boolean } {
  return { name: pageAndModelProvider.name, endpoint: loadBaseUrl(), ready: pageAndModelProvider.available() }
}

export * from './types'
export { buildProgramReview, buildFacultyReview, defaultAccepted, defaultAcceptedFaculty, applyProgramReview, applyFacultyReview } from './reviewQueue'
export type { ReviewItem, FacultyReviewItem, ReviewAction } from './reviewQueue'
