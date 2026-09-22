// Stipend and rent, side by side.
//
// Stipends live on each program (requirements.funding.stipend, from the
// stipend scan). Rents live in data/housing.json, one place per university
// (HUD + Zillow for the US; published one-bedroom rents elsewhere). This file
// formats both and relates them — without converting currencies: a ratio is
// only shown when stipend and rent are in the same currency.

import { useEffect, useState } from 'react'
import type { Stipend } from '../types'

export interface RentSource {
  label: string
  value: number
  period?: string
  url: string
  note?: string
}

export interface HousingPlace {
  id: string
  city: string
  country: string
  currency: string
  average: number | null
  measure: string
  sources: RentSource[]
  note?: string
}

interface HousingFile {
  meta: { generated_at: string; note: string }
  places: HousingPlace[]
  institutions: Record<string, string>
}

const BASE = import.meta.env.BASE_URL
let cached: Promise<HousingFile> | null = null

function fetchHousing(): Promise<HousingFile> {
  if (!cached) {
    cached = fetch(`${BASE}data/housing.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`housing.json: HTTP ${r.status}`)
        return r.json() as Promise<HousingFile>
      })
      .catch((e) => {
        cached = null // let a later visit retry
        throw e
      })
  }
  return cached
}

/** The rent place for a university, once housing.json has loaded (null: none / not yet). */
export function useHousingPlace(university: string): { place: HousingPlace | null; generatedAt: string | null } {
  const [file, setFile] = useState<HousingFile | null>(null)
  useEffect(() => {
    let alive = true
    fetchHousing()
      .then((f) => alive && setFile(f))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  if (!file) return { place: null, generatedAt: null }
  const id = file.institutions[university]
  return { place: file.places.find((p) => p.id === id) ?? null, generatedAt: file.meta.generated_at }
}

const SYMBOL: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
  CHF: 'CHF ',
  CAD: 'C$',
  SGD: 'S$',
  HKD: 'HK$',
}

export function money(amount: number, currency: string): string {
  const n = amount.toLocaleString('en-US', { maximumFractionDigits: amount % 1 ? 2 : 0 })
  return `${SYMBOL[currency] ?? `${currency} `}${n}`
}

const PERIOD: Record<string, string> = {
  '12-month': ' / year (12 months)',
  '9-month': ' / academic year (9 months)',
  monthly: ' / month',
  quarterly: ' / quarter',
  semester: ' / semester',
  other: '',
}

export function stipendText(s: Stipend): string | null {
  if (s.amount == null || !s.currency) return null
  return `${money(s.amount, s.currency)}${PERIOD[s.period ?? 'other'] ?? ''}`
}

export const SCOPE_LABEL: Record<string, string> = {
  program: "Program's own figure",
  'school-standard': 'School-wide standard rate',
  'university-minimum': 'University-wide minimum',
}

/**
 * What the stipend pays over the months you pay rent. A 9-month stipend is
 * taken as the year's pay (summer support is not assumed); a monthly one is
 * multiplied by 12. Per-quarter and per-semester figures are NOT multiplied
 * out: schools pay three or four quarters (two or three semesters), and the
 * page seldom says which — so no ratio is shown for them.
 */
export function annualStipend(s: Stipend): number | null {
  if (s.amount == null) return null
  if (s.period === '12-month' || s.period === '9-month') return s.amount
  if (s.period === 'monthly') return s.amount * 12
  return null
}

/** Share of the stipend a year of rent takes, or null when not comparable. */
export function rentShare(s: Stipend | undefined, place: HousingPlace | null): number | null {
  if (!s || !place || place.average == null || s.currency !== place.currency) return null
  const annual = annualStipend(s)
  if (!annual) return null
  return (place.average * 12) / annual
}
