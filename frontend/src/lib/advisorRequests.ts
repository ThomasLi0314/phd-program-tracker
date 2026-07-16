// Turn the advisors a user added locally into a request list that can be merged
// into the shared dataset.
//
// The published site is static: the browser CANNOT write mock_data.json. So an
// added advisor lives in localStorage — the same place the user already lost
// everything once. Promoting one to the real dataset needs a rebuild + push, so
// the app's job is to hand over a precise, checkable request.
//
// Only advisors carrying a `source_url` are worth promoting: that's the page the
// card's facts were actually read from, so the merge can be verified against it
// rather than trusted. Recruitment status is never included — the dataset sets
// it from an official statement, not from a card.
import type { Faculty } from '../types'

export interface AdvisorRequest {
  programId: string
  university: string
  program: string
  name: string
  title: string
  sub_field: string
  tags: string[]
  summary: string
  source_url: string
  fetched_at: string
  homepage: string | null
  scholar: string | null
}

export interface RequestBundle {
  kind: 'advisor-requests'
  version: 1
  note: string
  requests: AdvisorRequest[]
  /** Added advisors with no source page — listed so they aren't silently dropped. */
  unsourced: { programId: string; name: string }[]
}

/** Build the bundle from the overrides' addedFaculty map. */
export function buildRequests(
  addedFaculty: Record<string, Faculty[]>,
  programMeta: (programId: string) => { university: string; program: string } | null,
): RequestBundle {
  const requests: AdvisorRequest[] = []
  const unsourced: { programId: string; name: string }[] = []

  for (const [programId, list] of Object.entries(addedFaculty ?? {})) {
    for (const f of list ?? []) {
      if (!f?.name) continue
      if (!f.source_url) {
        unsourced.push({ programId, name: f.name })
        continue
      }
      const meta = programMeta(programId)
      requests.push({
        programId,
        university: meta?.university ?? '',
        program: meta?.program ?? '',
        name: f.name,
        title: f.title ?? '',
        sub_field: f.sub_field ?? '',
        tags: Array.isArray(f.tags) ? f.tags : [],
        summary: f.summary ?? '',
        source_url: f.source_url,
        fetched_at: f.fetched_at ?? '',
        homepage: f.links?.homepage ?? null,
        scholar: f.links?.scholar ?? null,
      })
    }
  }

  return {
    kind: 'advisor-requests',
    version: 1,
    note:
      'Advisors added in the browser, each extracted from the source_url listed. ' +
      'Re-verify each source before merging into mock_data.json; recruitment_status is ' +
      'deliberately omitted and must come from an official statement.',
    requests,
    unsourced,
  }
}

export function countRequests(addedFaculty: Record<string, Faculty[]>): {
  sourced: number
  unsourced: number
} {
  let sourced = 0
  let unsourced = 0
  for (const list of Object.values(addedFaculty ?? {})) {
    for (const f of list ?? []) {
      if (!f?.name) continue
      if (f.source_url) sourced++
      else unsourced++
    }
  }
  return { sourced, unsourced }
}
