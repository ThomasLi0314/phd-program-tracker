// Review-before-apply (spec §20).
//
// Research NEVER writes to the planner directly. It produces proposals; this
// turns them into a reviewable diff, and only what the user accepts is applied.
// Locked fields can be disagreed with but never overwritten (spec §18).

import type { PlannerFaculty, PlannerProgram, PlannerRecruitmentStatus, ResearchField } from '../../types'
import { ADMISSION_MODEL_LABELS, FUNDING_LABELS } from '../labels'
import { RECRUITMENT_LABELS } from '../recruitment'
import { today } from '../researchField'
import type { FacultyProposal, FieldProposal, ProgramSection } from './types'

export type ReviewAction =
  /** the planner had nothing here */
  | 'add'
  /** research agrees with what's already stored */
  | 'agree'
  /** research says the same thing with less detail than what's already stored */
  | 'subsumed'
  /** research disagrees — the user picks */
  | 'conflict'
  /** the user locked this field; we report the disagreement and change nothing */
  | 'locked'

const norm = (s: string) => s.toLowerCase().replace(/[\s'"“”().,;]+/g, ' ').trim()
const negated = (s: string) => /\b(not|no|never|without|non)\b/.test(s)

/**
 * Is the proposal just a terser restatement of what I already have?
 *
 * A live run proposed "$75" against a stored "$75 ('Fee: $75. Fee waivers are
 * available…')" and "4 years" against "4 years ('Program length: 4 years…')".
 * Calling those disagreements is noise that buries the real conflicts.
 *
 * Substring matching alone would be DANGEROUS here: "Required" is a substring of
 * "Not Required", so a genuine contradiction would be silently downgraded. Hence
 * two guards — the stored value must START with the proposal (so the proposal is
 * a prefix that context was appended to), and a negation present on one side but
 * not the other always stays a conflict.
 */
function isLessDetailed(current: string, proposed: string): boolean {
  const c = norm(current)
  const p = norm(proposed)
  if (!c || !p || c === p) return false
  if (negated(c) !== negated(p)) return false
  return c.startsWith(p)
}

export interface ReviewItem {
  id: string
  label: string
  section: ProgramSection
  key: string
  currentDisplay: string | null
  proposedDisplay: string
  proposal: FieldProposal
  action: ReviewAction
}

function displayValue(section: ProgramSection, key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const s = String(value)
  if (key === 'admissionModel') return ADMISSION_MODEL_LABELS[s as keyof typeof ADMISSION_MODEL_LABELS] ?? s
  if (section === 'funding' && key === 'level') return FUNDING_LABELS[s as keyof typeof FUNDING_LABELS] ?? s
  return s
}

function sectionMap(entry: PlannerProgram, section: ProgramSection): Record<string, ResearchField<unknown> | undefined> {
  return entry[section] as Record<string, ResearchField<unknown> | undefined>
}

/** Turn a research run into a reviewable list against the current program. */
export function buildProgramReview(entry: PlannerProgram, proposals: FieldProposal[]): ReviewItem[] {
  const items: ReviewItem[] = []
  for (const p of proposals) {
    const cur = sectionMap(entry, p.section)[p.key]
    const currentDisplay = cur?.value == null ? null : displayValue(p.section, p.key, cur.value)
    const proposedDisplay = displayValue(p.section, p.key, p.value)

    let action: ReviewAction
    if (cur?.ownership === 'locked') {
      // A locked field that AGREES is not worth bothering the user about.
      action = currentDisplay === proposedDisplay ? 'agree' : 'locked'
    } else if (currentDisplay === null) {
      action = 'add'
    } else if (currentDisplay === proposedDisplay) {
      action = 'agree'
    } else if (isLessDetailed(currentDisplay, proposedDisplay)) {
      action = 'subsumed'
    } else {
      action = 'conflict'
    }

    items.push({
      id: `${p.section}/${p.key}`,
      label: p.label,
      section: p.section,
      key: p.key,
      currentDisplay,
      proposedDisplay,
      proposal: p,
      action,
    })
  }
  // Surface what needs a decision first.
  const rank: Record<ReviewAction, number> = { conflict: 0, locked: 1, add: 2, subsumed: 3, agree: 4 }
  return items.sort((a, b) => rank[a.action] - rank[b.action] || a.label.localeCompare(b.label))
}

/** Items that should be ticked by default: new information, never a conflict. */
export function defaultAccepted(items: ReviewItem[]): Set<string> {
  return new Set(
    items
      .filter((i) => i.action === 'add' && i.proposal.groundedInPage)
      .map((i) => i.id),
  )
}

/**
 * Apply the accepted items. Returns the patch to hand to updateProgram.
 *
 * An accepted value arrives as origin 'ai' with its source attached, so the
 * card keeps showing where it came from. A locked field is skipped even if its
 * id is passed in — the lock is enforced here, not only in the UI.
 */
export function applyProgramReview(
  entry: PlannerProgram,
  items: ReviewItem[],
  accepted: Set<string>,
): Partial<PlannerProgram> {
  const next: Record<ProgramSection, Record<string, ResearchField<unknown> | undefined>> = {
    admissions: { ...sectionMap(entry, 'admissions') },
    structure: { ...sectionMap(entry, 'structure') },
    funding: { ...sectionMap(entry, 'funding') },
  }

  for (const item of items) {
    const cur = next[item.section][item.key]
    if (cur?.ownership === 'locked') continue

    // 'subsumed' keeps MY richer value but still counts as a re-confirmation.
    if (item.action === 'agree' || item.action === 'subsumed') {
      // Same value from a fresh source: don't rewrite it, but do record that it
      // was re-confirmed today and keep the citation.
      if (cur) {
        next[item.section][item.key] = {
          ...cur,
          checkedAt: today(),
          sources: mergeSources(cur.sources, item.proposal.source),
        }
      }
      continue
    }

    if (!accepted.has(item.id)) {
      // Rejected conflict: keep my value, but remember the disagreement so it
      // isn't rediscovered from scratch next time (spec §38).
      if (cur && item.action === 'conflict') {
        next[item.section][item.key] = {
          ...cur,
          conflicts: [
            ...(cur.conflicts ?? []).filter((c) => c.source.url !== item.proposal.source.url),
            { value: item.proposal.value, source: item.proposal.source },
          ],
        }
      }
      continue
    }

    next[item.section][item.key] = {
      value: item.proposal.value,
      origin: 'ai',
      ownership: 'auto',
      confidence: item.proposal.confidence,
      checkedAt: today(),
      sources: mergeSources(cur?.sources ?? [], item.proposal.source),
      ...(cur?.conflicts ? { conflicts: cur.conflicts } : {}),
    }
  }

  return {
    admissions: next.admissions as PlannerProgram['admissions'],
    structure: next.structure as PlannerProgram['structure'],
    funding: next.funding as PlannerProgram['funding'],
    lastResearchedAt: new Date().toISOString(),
  }
}

function mergeSources<T extends { url: string }>(existing: T[], incoming: T): T[] {
  return [incoming, ...existing.filter((s) => s.url !== incoming.url)].slice(0, 8)
}

// ---------------------------------------------------------------- faculty ----

export interface FacultyReviewItem {
  id: string
  label: string
  key: FacultyProposal['key']
  currentDisplay: string | null
  proposedDisplay: string
  proposal: FacultyProposal
  action: ReviewAction
}

function currentFacultyValue(entry: PlannerFaculty, key: FacultyProposal['key']): { display: string | null; locked: boolean } {
  switch (key) {
    case 'title':
      return { display: entry.title || null, locked: false }
    case 'university':
      return { display: entry.university || null, locked: false }
    case 'department':
      return { display: entry.department || null, locked: false }
    case 'email':
      return { display: entry.email || null, locked: false }
    case 'lab':
      return { display: entry.links.lab || null, locked: false }
    case 'scholar':
      return { display: entry.links.scholar || null, locked: false }
    case 'themes':
      return { display: entry.themes.length ? entry.themes.join(', ') : null, locked: false }
    case 'oneLiner':
      return { display: entry.oneLiner?.value ?? null, locked: entry.oneLiner?.ownership === 'locked' }
    case 'detailed':
      return { display: entry.detailed?.value ?? null, locked: entry.detailed?.ownership === 'locked' }
    case 'recentResearch':
      return { display: entry.recentResearch?.value ?? null, locked: entry.recentResearch?.ownership === 'locked' }
    case 'recruiting':
      return {
        display: entry.recruiting.value ? RECRUITMENT_LABELS[entry.recruiting.value] : null,
        locked: entry.recruiting.ownership === 'locked',
      }
  }
}

export function buildFacultyReview(entry: PlannerFaculty, proposals: FacultyProposal[]): FacultyReviewItem[] {
  const items = proposals.map((p) => {
    const { display, locked } = currentFacultyValue(entry, p.key)
    const proposedDisplay = Array.isArray(p.value)
      ? p.value.join(', ')
      : p.key === 'recruiting'
        ? RECRUITMENT_LABELS[p.value as keyof typeof RECRUITMENT_LABELS] ?? String(p.value)
        : String(p.value ?? '')

    let action: ReviewAction
    if (locked) action = display === proposedDisplay ? 'agree' : 'locked'
    else if (display === null) action = 'add'
    else if (display === proposedDisplay) action = 'agree'
    else if (isLessDetailed(display, proposedDisplay)) action = 'subsumed'
    else action = 'conflict'

    return { id: p.key, label: p.label, key: p.key, currentDisplay: display, proposedDisplay, proposal: p, action }
  })
  const rank: Record<ReviewAction, number> = { conflict: 0, locked: 1, add: 2, subsumed: 3, agree: 4 }
  return items.sort((a, b) => rank[a.action] - rank[b.action] || a.label.localeCompare(b.label))
}

export function defaultAcceptedFaculty(items: FacultyReviewItem[]): Set<string> {
  return new Set(
    items
      .filter(
        (i) =>
          i.action === 'add' &&
          i.proposal.groundedInPage &&
          // Recruiting is never pre-ticked: it is the field most likely to be
          // wrong and the most costly to get wrong.
          i.key !== 'recruiting',
      )
      .map((i) => i.id),
  )
}

export function applyFacultyReview(
  entry: PlannerFaculty,
  items: FacultyReviewItem[],
  accepted: Set<string>,
): Partial<PlannerFaculty> {
  const patch: Partial<PlannerFaculty> = { lastResearchedAt: new Date().toISOString() }
  const links = { ...entry.links }
  let touchedLinks = false

  for (const item of items) {
    const { locked } = currentFacultyValue(entry, item.key)
    if (locked || !accepted.has(item.id)) continue
    const v = item.proposal.value
    const field = <T,>(cur: ResearchField<T> | undefined, value: T): ResearchField<T> => ({
      value,
      origin: 'ai',
      ownership: 'auto',
      confidence: item.proposal.confidence,
      checkedAt: today(),
      sources: mergeSources(cur?.sources ?? [], item.proposal.source),
    })

    switch (item.key) {
      case 'title':
        patch.title = String(v)
        break
      case 'university':
        patch.university = String(v)
        break
      case 'department':
        patch.department = String(v)
        break
      case 'email':
        patch.email = String(v)
        break
      case 'lab':
        links.lab = String(v)
        touchedLinks = true
        break
      case 'scholar':
        links.scholar = String(v)
        touchedLinks = true
        break
      case 'themes':
        patch.themes = Array.isArray(v) ? v : entry.themes
        break
      case 'oneLiner':
        patch.oneLiner = field(entry.oneLiner, String(v))
        break
      case 'detailed':
        patch.detailed = field(entry.detailed, String(v))
        break
      case 'recentResearch':
        patch.recentResearch = field(entry.recentResearch, String(v))
        break
      case 'recruiting':
        // v is narrowed by the proposal shape; recruiting is never applied as null
        // (an absent status stays whatever the planner already had).
        patch.recruiting = field(entry.recruiting, v as PlannerRecruitmentStatus)
        break
    }
  }
  if (touchedLinks) patch.links = links
  return patch
}
