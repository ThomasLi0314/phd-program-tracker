// European master's programmes — a second dataset alongside the US PhD database.
//
// It is deliberately NOT the tracker's `Program` shape. The questions you ask of
// a European master's are different ones: what does it cost me as a non-EU
// applicant, is there money to be had, and will my English be accepted. Those
// have no home in a schema built around PhD advisors and funding packages.
//
// Two levels of truth, because that is how European tuition actually works:
// most of it is set by national or state law, not by the department. A country
// policy is verified once and applies to every programme under it; a programme
// only carries its own tuition when its page states a figure of its own.

/** The user's research directions. One programme can sit in several. */
export type EuroField =
  | 'Mathematics'
  | 'Applied Mathematics'
  | 'Computational Science'
  | 'Atmosphere & Ocean'
  | 'Physics'
  | 'Applied Physics'
  | 'Computer Science'
  | 'Engineering'

export const EURO_FIELDS: EuroField[] = [
  'Mathematics',
  'Applied Mathematics',
  'Computational Science',
  'Atmosphere & Ocean',
  'Physics',
  'Applied Physics',
  'Computer Science',
  'Engineering',
]

export type EuroDegree = 'MSc' | 'MA' | 'MRes' | 'MPhil' | 'MEng' | 'MASt'

/** How much of the tuition a scholarship can realistically cover. */
export type ScholarshipLevel =
  /** full-tuition (and sometimes stipend) awards exist for international students */
  | 'full'
  /** partial awards, fee reductions, or a small number of competitive places */
  | 'partial'
  /** no programme- or university-level award for international master's students */
  | 'none'
  /** not stated on any page read — never guessed */
  | 'unknown'

/**
 * A value with the page it came from. `value: null` means "Unknown / Verify" —
 * it is never filled in by inference, so a null here is information, not a gap
 * someone forgot to close.
 */
export interface Sourced<T = string> {
  value: T | null
  /** Caveats the bare value would lose ("per semester, doubled from 2025"). */
  note?: string
  /** The page this was read from. */
  source?: string
}

export interface TuitionPolicy {
  /** What an EU/EEA (and usually Swiss) citizen pays. */
  eu: Sourced
  /** What everyone else pays — the number that actually matters here. */
  non_eu: Sourced
}

export interface CountryPolicy {
  country: string
  /** ISO 3166-1 alpha-2, used for the flag and for stable grouping. */
  code: string
  tuition: TuitionPolicy
  /**
   * What the two tuition tiers are actually called here. Europe splits on
   * citizenship (EU/EEA vs everyone else); Hong Kong on local vs non-local;
   * Singapore on whether the MOE subsidy applies. Printing "EU" above a
   * Singapore fee would be a quiet lie, so the country says what it means.
   */
  labels?: { local: string; international: string }
  /**
   * Whether the figures above are a rule every programme inherits (Germany,
   * France, Austria) or only a description of how fees get set, with the
   * numbers being a range observed across the rows listed (Singapore, Hong
   * Kong, where each taught master's prices itself). Decides whether the UI
   * says "national rule" or "regional pattern" on an inherited value.
   */
  basis?: 'national' | 'per-programme'
  /** Living costs / blocked account / visa financial proof, when published. */
  living_cost?: Sourced
  /** National scholarship schemes (DAAD, Eiffel, Holland Scholarship…). */
  scholarships: Sourced
  /** Anything that changes the calculus: recent fee reforms, work rights. */
  note?: string
}

export interface EuroProgram {
  id: string
  university: string
  city: string
  country: string
  program_name: string
  degree: EuroDegree
  fields: EuroField[]
  /** Language of instruction. */
  language: Sourced
  /** "2 years (120 ECTS)" as published. */
  duration: Sourced
  /**
   * Programme-specific tuition. Absent means the country policy applies —
   * which is the common case in Germany, France, Austria and Norway.
   */
  tuition?: Partial<TuitionPolicy>
  scholarship: Sourced & { level: ScholarshipLevel }
  /** English test thresholds, verbatim where possible. */
  english: Sourced
  /** Application deadline for non-EU applicants, which is usually the earlier one. */
  deadline: Sourced
  /** Whether the same department also admits doctoral students, and how. */
  phd: Sourced<'yes' | 'no'> & { url?: string }
  links: { program: string; admissions?: string; tuition?: string }
  /** ISO date the pages above were read. */
  checked_at: string
}

export interface EuroDataset {
  meta: {
    version: number
    generated_at: string
    cycle: string
    note: string
  }
  countries: CountryPolicy[]
  programs: EuroProgram[]
}

export const UNKNOWN_LABEL = 'Unknown / Verify'

/** Names for a country's two tuition tiers, defaulting to the European split. */
export function tuitionLabels(country: CountryPolicy | undefined): {
  local: string
  international: string
} {
  return country?.labels ?? { local: 'EU/EEA', international: 'Non-EU' }
}

/** Read a sourced value for display, collapsing null to the honest label. */
export function show(s: Sourced | undefined): string {
  if (!s || s.value == null || s.value === '') return UNKNOWN_LABEL
  return String(s.value)
}

export function isUnknown(s: Sourced | undefined): boolean {
  return !s || s.value == null || s.value === ''
}

/**
 * The tuition a programme actually charges: its own figure when it publishes
 * one, otherwise the country's. Returns which level answered so the UI can say
 * "national rule" rather than implying the department was checked.
 */
export function effectiveTuition(
  program: EuroProgram,
  country: CountryPolicy | undefined,
): { eu: Sourced; non_eu: Sourced; from: 'program' | 'country' | 'none' } {
  const own = program.tuition
  const hasOwn = own && (!isUnknown(own.eu) || !isUnknown(own.non_eu))
  if (hasOwn) {
    return {
      eu: own.eu ?? country?.tuition.eu ?? { value: null },
      non_eu: own.non_eu ?? country?.tuition.non_eu ?? { value: null },
      from: 'program',
    }
  }
  if (country) return { eu: country.tuition.eu, non_eu: country.tuition.non_eu, from: 'country' }
  return { eu: { value: null }, non_eu: { value: null }, from: 'none' }
}
