import type { Dataset, DegreeType, Program, Region } from '../types'

export interface FieldEntry {
  primary: string
  slug: string
  count: number
  /** programs in this field that have at least one faculty member scanned */
  withFaculty: number
  /** total faculty across all programs in this field */
  facultyCount: number
  subs: string[]
  /** sub-fields that appear on at least one faculty-bearing program */
  subsWithFaculty: string[]
}

export interface DataIndex {
  meta: Dataset['meta']
  total: number
  fields: FieldEntry[]
  degrees: DegreeType[]
  regions: Region[]
  feeCap: number
}

// BASE_URL is '/' in dev and './' in the relative-base production build, so
// the same fetches work locally, behind the tunnel, and on GitHub Pages.
const BASE = import.meta.env.BASE_URL

export async function fetchIndex(): Promise<DataIndex> {
  const res = await fetch(`${BASE}data/index.json`)
  if (!res.ok) throw new Error(`index.json: HTTP ${res.status}`)
  return res.json()
}

const fieldCache = new Map<string, Promise<Program[]>>()

/** Fetch one field's programs, cached for the session. */
export function fetchField(slug: string): Promise<Program[]> {
  let cached = fieldCache.get(slug)
  if (!cached) {
    cached = fetch(`${BASE}data/fields/${slug}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`fields/${slug}.json: HTTP ${res.status}`)
        return res.json()
      })
      .then((chunk: { primary: string; programs: Program[] }) => chunk.programs)
    // Drop failed fetches from the cache so a retry can succeed.
    cached.catch(() => fieldCache.delete(slug))
    fieldCache.set(slug, cached)
  }
  return cached
}
