// The adapter between the canonical reference dataset and the planner overlay
// (spec §33: "create adapters where planner requirements are richer").
//
// Nothing here copies a reference program into the planner wholesale. When I
// add a database program, the planner stores its canonical id plus a small
// display cache, and every read prefers the live dataset — so a dataset refresh
// still improves what the planner shows (spec §2).

import type { Faculty, Program } from '../../types'
import { UNKNOWN } from '../../types'
import { mergeKey } from '../../lib/mergeAdvisors'
import { advisorKey } from '../../lib/starredAdvisors'
import type {
  AdmissionModel,
  AdmissionsResearch,
  FacultyRef,
  FundingResearch,
  PlannerFaculty,
  PlannerProgram,
  StructureResearch,
} from '../types'
import { databaseField, unknownField } from './researchField'
import { newId } from './storage'
import { fromReference } from './recruitment'

/** "Unknown/Verify" and empty strings both mean "we don't know" → null. */
function orNull(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  return !t || t === UNKNOWN ? null : t
}

function mapAdmissionModel(s: string | null | undefined): AdmissionModel | null {
  const t = orNull(s)
  if (!t) return null
  const l = t.toLowerCase()
  if (l.includes('committee')) return 'committee_based'
  if (l.includes('rotation')) return 'rotation'
  if (l.includes('direct') || l.includes('advisor')) return 'direct_advisor'
  if (l.includes('coursework')) return 'coursework_first'
  if (l.includes('program')) return 'program_based'
  return null
}

function mapFundingLevel(s: string | null | undefined) {
  const t = orNull(s)
  if (!t) return null
  const l = t.toLowerCase()
  if (l.includes('fully')) return 'fully_funded' as const
  if (l.includes('partial')) return 'partial' as const
  return null
}

/**
 * Seed the researched sections from what the dataset already verified. These
 * arrive as origin 'database' with `checkedAt` from the program's own
 * data_currency date where available, so the planner never presents scanned
 * data as if I had confirmed it myself.
 */
function admissionsFromReference(p: Program): AdmissionsResearch {
  const r = p.requirements
  const checkedAt = currencyDate(p.data_currency)
  const f = <T,>(v: T | null) => databaseField<T>(v, { checkedAt })
  return {
    deadline: f(orNull(r.deadline_display)),
    // GreStatus is reused verbatim rather than re-encoded (spec §33).
    gre: f(r.gre === UNKNOWN ? null : r.gre),
    english: f(orNull(r.english)),
    applicationFee: f(orNull(r.fee_display)),
    letters: f(typeof r.letters === 'number' ? r.letters : null),
  }
}

function structureFromReference(p: Program): StructureResearch {
  const r = p.requirements
  const checkedAt = currencyDate(p.data_currency)
  return {
    admissionModel: databaseField(mapAdmissionModel(r.admission_model), { checkedAt }),
    contactEncouraged: databaseField(orNull(r.pre_application_contact), { checkedAt }),
    duration: databaseField(orNull(r.duration), { checkedAt }),
    researchAreas: databaseField(p.discipline.subs.join(', ') || null, { checkedAt }),
  }
}

function fundingFromReference(p: Program): FundingResearch {
  const fu = p.requirements.funding
  const checkedAt = currencyDate(p.data_currency)
  return {
    level: databaseField(mapFundingLevel(fu.status), { checkedAt }),
    years: databaseField(typeof fu.years === 'number' ? fu.years : null, { checkedAt }),
    notes: databaseField(orNull(fu.note), { checkedAt }),
  }
}

/** The dataset's own value for one researched field, as the planner seeded it.
 *  Used to put a database value back after I've overwritten it. */
export function referenceField(
  p: Program,
  section: 'admissions' | 'structure' | 'funding',
  key: string,
) {
  const sec =
    section === 'admissions'
      ? admissionsFromReference(p)
      : section === 'structure'
        ? structureFromReference(p)
        : fundingFromReference(p)
  return (sec as Record<string, ReturnType<typeof databaseField<unknown>> | undefined>)[key]
}

/** Pull the leading ISO date out of a data_currency sentence, if it has one. */
function currencyDate(s: string | undefined): string | null {
  const m = s?.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : null
}

/** Build a planner program that REFERENCES a dataset program. */
export function programFromReference(p: Program, cycle: string): PlannerProgram {
  const now = new Date().toISOString()
  return {
    id: newId('prog'),
    ref: { kind: 'database', programId: p.id },
    university: p.university,
    programName: p.program_name,
    department: '',
    degree: p.degree_type,
    links: { program: p.links.program ?? '', portal: p.links.admissions ?? '' },
    cycle,
    interest: 'interested',
    status: 'considering',
    notes: '',
    admissions: admissionsFromReference(p),
    structure: structureFromReference(p),
    funding: fundingFromReference(p),
    facultyIds: [],
    createdAt: now,
    updatedAt: now,
    lastResearchedAt: null,
  }
}

/** Build a planner program I typed in myself. Everything starts unknown. */
export function customProgram(
  input: { university: string; programName: string; website?: string },
  cycle: string,
): PlannerProgram {
  const now = new Date().toISOString()
  return {
    id: newId('prog'),
    ref: { kind: 'custom' },
    university: input.university.trim(),
    programName: input.programName.trim(),
    department: '',
    degree: 'PhD',
    links: { program: (input.website ?? '').trim(), portal: '' },
    cycle,
    interest: 'interested',
    status: 'considering',
    notes: '',
    admissions: {},
    structure: {},
    funding: {},
    facultyIds: [],
    createdAt: now,
    updatedAt: now,
    lastResearchedAt: null,
  }
}

/** Build a planner faculty entry that REFERENCES a person in the dataset. */
export function facultyFromReference(f: Faculty, p: Program): PlannerFaculty {
  const now = new Date().toISOString()
  const ref: FacultyRef = {
    kind: 'database',
    mergeKey: mergeKey(f.name, p.university),
    seenAs: [{ programId: p.id, facultyId: f.id }],
  }
  return {
    id: newId('fac'),
    ref,
    name: f.name,
    university: p.university,
    department: '',
    title: f.title,
    links: {
      faculty: f.links.homepage ?? '',
      personal: '',
      lab: '',
      scholar: f.links.scholar ?? '',
    },
    email: '',
    programIds: [],
    // The dataset's status is carried over, but silence stays 'unknown' — this
    // mapping can never manufacture a positive claim (spec §12).
    recruiting: databaseField(fromReference(f.recruitment_status), {
      checkedAt: currencyDate(p.data_currency),
    }),
    oneLiner: databaseField(f.summary || null, { checkedAt: currencyDate(p.data_currency) }),
    themes: [f.sub_field, ...f.tags].filter((t) => t && t !== 'Unspecified').slice(0, 8),
    recentPapers: [],
    contact: {
      status: 'not_contacted',
      initialContactAt: null,
      followUpAt: null,
      meetingAt: null,
      notes: '',
    },
    notes: '',
    createdAt: now,
    updatedAt: now,
    lastResearchedAt: null,
  }
}

/** Build a planner faculty entry I typed in myself. */
export function customFaculty(input: {
  name: string
  university?: string
  department?: string
  homepage?: string
}): PlannerFaculty {
  const now = new Date().toISOString()
  return {
    id: newId('fac'),
    ref: { kind: 'custom' },
    name: input.name.trim(),
    university: (input.university ?? '').trim(),
    department: (input.department ?? '').trim(),
    title: '',
    links: { faculty: (input.homepage ?? '').trim(), personal: '', lab: '', scholar: '' },
    email: '',
    programIds: [],
    recruiting: unknownField(),
    themes: [],
    recentPapers: [],
    contact: {
      status: 'not_contacted',
      initialContactAt: null,
      followUpAt: null,
      meetingAt: null,
      notes: '',
    },
    notes: '',
    createdAt: now,
    updatedAt: now,
    lastResearchedAt: null,
  }
}

/** Live reference program behind a planner entry, when its chunk has loaded. */
export function resolveProgram(
  entry: PlannerProgram,
  byId: Map<string, Program>,
): Program | null {
  return entry.ref.kind === 'database' ? (byId.get(entry.ref.programId) ?? null) : null
}

/**
 * Every (program, faculty) pair this person appears under in the dataset.
 *
 * Reference faculty ids are only unique within a program, so identity across
 * programs is the mergeKey — the same rule the Advisor Explorer uses to show
 * one card per person.
 */
export function facultyOccurrences(
  key: string,
  programs: Program[],
): { program: Program; faculty: Faculty }[] {
  const out: { program: Program; faculty: Faculty }[] = []
  for (const p of programs) {
    for (const f of p.faculty) {
      if (mergeKey(f.name, p.university) === key) out.push({ program: p, faculty: f })
    }
  }
  return out
}

/**
 * advisorKeys for a planner faculty entry — the handles under which the main
 * tracker stores their stars, notes, homepage override and outreach record.
 * This is how the planner reads existing contact evidence instead of forking
 * its own copy of it.
 */
export function advisorKeysFor(entry: PlannerFaculty): string[] {
  if (entry.ref.kind !== 'database') return []
  return entry.ref.seenAs.map((s) => advisorKey(s.programId, s.facultyId))
}

/**
 * What to actually show for a program. The live dataset wins over the cached
 * copy, but anything I typed in myself wins over both — my edits are never
 * overwritten by a dataset refresh (spec §17).
 */
export function programIdentity(entry: PlannerProgram, live: Program | null) {
  return {
    university: live?.university ?? entry.university,
    programName: live?.program_name ?? entry.programName,
    degree: entry.degree ?? live?.degree_type ?? null,
    department: entry.department,
    website: entry.links.program || live?.links.program || '',
    portal: entry.links.portal || live?.links.admissions || '',
    discipline: live?.discipline.primary ?? '',
    fromDatabase: entry.ref.kind === 'database',
  }
}

/** Refresh the display cache from live data without touching my own edits. */
export function syncDisplayCache(entry: PlannerProgram, live: Program | null): PlannerProgram {
  if (!live) return entry
  if (entry.university === live.university && entry.programName === live.program_name) return entry
  return { ...entry, university: live.university, programName: live.program_name }
}
