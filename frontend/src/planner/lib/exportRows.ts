// The plan as spreadsheet rows — shared by the live Google Sheet (googleSheet)
// and the recommendation-letter checklist (letterChecklist).
//
// Pure: everything it reads is passed in, so the Programs page (which exports
// the rows it is showing) and the planner shell (which keeps the Sheet current
// with every program) build exactly the same cells.

import type { Program } from '../../types'
import type { PlannerFaculty, PlannerProgram, PlannerState } from '../types'
import { facultyOccurrencePairs, programIdentity, resolveProgram } from './referenceBridge'
import { deadlineLabel, resolveDeadline, type ParsedDeadline } from './deadlines'
import { money, rentShare, SCOPE_LABEL, stipendShort, type HousingPlace } from '../../lib/costOfLiving'
import { effectiveContact, findRecord, type OutreachSnapshot } from './outreachBridge'
import { APPLICATION_LABELS, CONTACT_LABELS, FUNDING_LABELS, UNKNOWN_LABEL } from './labels'
import type { ExportProgramRow } from './exportExcel'

export interface ExportContext {
  state: PlannerState
  byId: Map<string, Program>
  programs: Program[]
  placeFor: (university: string) => HousingPlace | null
  outreach: OutreachSnapshot
}

/**
 * "Oceanography (PhD)" — but "Earth and Environmental Sciences PhD" as it is,
 * not "… PhD (PhD)": the degree is added only when the name doesn't already
 * say it (dots ignored, so "Ph.D. in …" counts).
 */
export function programLabel(name: string, degree: string | null | undefined): string {
  if (!degree) return name
  const bare = (t: string) => t.replace(/\./g, '').toLowerCase()
  return bare(name).includes(bare(degree)) ? name : `${name} (${degree})`
}

/** The deadline as a sheet cell: the date, or what stands in for one. */
export function deadlineCell(parsed: ParsedDeadline): string {
  if (parsed.kind === 'dated' && parsed.iso) {
    return `${deadlineLabel(parsed)}${parsed.yearInferred ? ' (year inferred)' : ''}`
  }
  return parsed.kind === 'unknown' ? UNKNOWN_LABEL : deadlineLabel(parsed)
}

/**
 * One row per program, in the order given, each with its linked faculty.
 * Unknown values are written as the same "Unknown / Verify" the planner shows;
 * nothing is guessed to fill a cell.
 */
export function buildExportRows(entries: PlannerProgram[], ctx: ExportContext): ExportProgramRow[] {
  const { state, byId, programs, placeFor, outreach } = ctx
  const facultyById = new Map(state.faculty.map((f) => [f.id, f]))
  const categoryName = new Map(state.categories.map((c) => [c.id, c.name]))

  return entries.map((entry) => {
    const live = resolveProgram(entry, byId)
    const id = programIdentity(entry, live)
    const linked = entry.facultyIds
      .map((fid) => facultyById.get(fid))
      .filter((f): f is PlannerFaculty => !!f)

    const deadline = deadlineCell(resolveDeadline(entry.admissions.deadline, live?.requirements.deadline))
    const funding = entry.funding.level?.value ? FUNDING_LABELS[entry.funding.level.value] : UNKNOWN_LABEL
    const s = live?.requirements.funding.stipend
    const short = s ? stipendShort(s) : null
    const stipend = short
      ? `${short}${s!.scope ? ` (${(SCOPE_LABEL[s!.scope] ?? '').toLowerCase()}${s!.academic_year ? `, ${s!.academic_year}` : ''})` : ''}`
      : s
        ? 'No official figure found'
        : UNKNOWN_LABEL
    const place = placeFor(id.university)
    const share = rentShare(s, place)
    const rent =
      place && place.average != null
        ? `${money(place.average, place.currency)}/mo — ${place.city}${share != null ? ` — ${Math.round(share * 100)}% of stipend` : ''}`
        : UNKNOWN_LABEL

    const advisors = linked.map((f) => {
      const occ = f.ref.kind === 'database' ? facultyOccurrencePairs(f.ref.mergeKey, programs) : []
      const eff = effectiveContact(f, findRecord(f, outreach, occ))
      return {
        name: f.name,
        status: CONTACT_LABELS[eff.status],
        research: f.themes.slice(0, 5).join('; '),
        link: f.links.faculty || f.links.personal || f.links.lab || f.links.scholar || '',
      }
    })

    return {
      category: (entry.categoryId && categoryName.get(entry.categoryId)) || '',
      university: id.university,
      program: programLabel(id.programName, id.degree),
      deadline,
      funding,
      stipend,
      rent,
      status: APPLICATION_LABELS[entry.status],
      notes: entry.notes.trim(),
      link: id.website || id.portal || '',
      advisors,
    }
  })
}

/**
 * Every program in the plan in a fixed order, for the Google Sheet: under the
 * user's categories in the order they made them, unfiled last, by university
 * within each — the Programs page's default view. Independent of whatever
 * filter or sort the page happens to have, so the Sheet doesn't reshuffle
 * because someone typed in a search box.
 */
export function sheetOrder(state: PlannerState, byId: Map<string, Program>): PlannerProgram[] {
  const rank = new Map(state.categories.map((c, i) => [c.id, i]))
  const unfiled = state.categories.length
  const group = (p: PlannerProgram) => (p.categoryId ? (rank.get(p.categoryId) ?? unfiled) : unfiled)
  const uni = (p: PlannerProgram) => programIdentity(p, resolveProgram(p, byId)).university
  return [...state.programs].sort((a, b) => group(a) - group(b) || uni(a).localeCompare(uni(b)))
}
