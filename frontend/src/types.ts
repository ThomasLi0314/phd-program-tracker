export type DegreeType = 'PhD' | 'MSc' | 'MRes'
export type Region = 'US' | 'UK' | 'Europe' | 'Canada' | 'Asia-Pacific'
export type GreStatus = 'Required' | 'Optional' | 'Not Accepted' | 'Unknown/Verify'
export type RecruitmentStatus = 'Looking for Students' | 'Not Advising' | 'Unknown/Verify'

export const UNKNOWN = 'Unknown/Verify'

export interface FacultyLinks {
  homepage: string | null
  scholar: string | null
}

export interface Faculty {
  id: string
  name: string
  title: string
  sub_field: string
  tags: string[]
  summary: string
  recruitment_status: RecruitmentStatus
  links: FacultyLinks
}

export interface Funding {
  status: string
  years: number | null
  note: string
}

export interface Requirements {
  deadline: string | null
  deadline_display: string
  application_fee_usd: number | null
  fee_display: string
  gre: GreStatus
  letters: number | null
  english: string
  admission_model: string
  admission_model_note: string
  funding: Funding
  pre_application_contact: string
  contact_note: string
  ects: number | null
  duration: string
}

export interface Discipline {
  primary: string
  subs: string[]
}

export interface Program {
  id: string
  university: string
  program_name: string
  degree_type: DegreeType
  region: Region
  country: string
  discipline: Discipline
  requirements: Requirements
  links: { program: string; admissions?: string }
  data_currency: string
  faculty: Faculty[]
}

export interface Dataset {
  meta: {
    version: number
    generated_at: string
    cycle: string
    source: string
    note: string
  }
  programs: Program[]
}
