import { useEffect, useState } from 'react'
import type { CountryPolicy, EuroDataset, EuroField, EuroProgram } from '../types'

// Same fetch convention as the tracker's dataLoader: BASE_URL is '/' in dev and
// './' in the published build, so the URL resolves against the document either
// way. See lib/hashRoute for why the page lives on a hash and not a path — a
// path route would break exactly this fetch.
const BASE = import.meta.env.BASE_URL

let cached: Promise<EuroDataset> | null = null

export function fetchEurope(): Promise<EuroDataset> {
  if (!cached) {
    cached = fetch(`${BASE}data/europe.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`europe.json: HTTP ${res.status}`)
        return res.json() as Promise<EuroDataset>
      })
      .catch((err) => {
        cached = null // let a retry succeed
        throw err
      })
  }
  return cached
}

export interface EuropeData {
  data: EuroDataset | null
  error: string | null
  loading: boolean
}

export function useEurope(): EuropeData {
  const [state, setState] = useState<EuropeData>({ data: null, error: null, loading: true })
  useEffect(() => {
    let alive = true
    fetchEurope()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((err: unknown) =>
        alive && setState({ data: null, error: err instanceof Error ? err.message : String(err), loading: false }),
      )
    return () => {
      alive = false
    }
  }, [])
  return state
}

export function countryIndex(data: EuroDataset): Map<string, CountryPolicy> {
  return new Map(data.countries.map((c) => [c.country, c]))
}

export interface Filters {
  countries: Set<string>
  fields: Set<EuroField>
  /** English-taught only. Nearly everything relevant is, but not all of it. */
  englishOnly: boolean
  /** Hide programmes with no scholarship route for international students. */
  fundedOnly: boolean
  /** Only programmes whose department also takes doctoral students. */
  phdOnly: boolean
  query: string
}

export const emptyFilters = (): Filters => ({
  countries: new Set(),
  fields: new Set(),
  englishOnly: false,
  fundedOnly: false,
  phdOnly: false,
  query: '',
})

export function applyFilters(programs: EuroProgram[], f: Filters): EuroProgram[] {
  const q = f.query.trim().toLowerCase()
  return programs.filter((p) => {
    if (f.countries.size && !f.countries.has(p.country)) return false
    if (f.fields.size && !p.fields.some((x) => f.fields.has(x))) return false
    if (f.englishOnly && !/english/i.test(String(p.language.value ?? ''))) return false
    if (f.fundedOnly && p.scholarship.level !== 'full' && p.scholarship.level !== 'partial') return false
    if (f.phdOnly && p.phd.value !== 'yes') return false
    if (q) {
      const hay = `${p.university} ${p.program_name} ${p.city} ${p.country} ${p.fields.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** Group into country → programmes, countries alphabetical, programmes by university. */
export function groupByCountry(programs: EuroProgram[]): [string, EuroProgram[]][] {
  const map = new Map<string, EuroProgram[]>()
  for (const p of programs) {
    const list = map.get(p.country)
    if (list) list.push(p)
    else map.set(p.country, [p])
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.university.localeCompare(b.university) || a.program_name.localeCompare(b.program_name))
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}
