// What I filled in on the Plan, seen from Explore.
//
// The two pages were separate stores: correcting a professor's homepage or a
// GRE policy on a program's plan page left Explore still showing the database's
// stale value, so the same fact read two different ways depending on which tab
// I opened. Rather than copy values between stores (two sources of truth, and a
// copy that goes stale the moment either side changes), the planner's own
// manual entries are read straight out of `planner.state.v1` and layered UNDER
// the overrides I typed in Explore itself.
//
// Precedence, deliberately: a value typed on the Explore page wins over one
// from the Plan. Both are mine, but the one I typed on the page I'm looking at
// is the one I'd be surprised to see replaced.

import type { Faculty } from '../types'
import { advisorKey } from './starredAdvisors'
import { PLANNER_KEY } from '../planner/lib/storage'
import { ADMISSION_MODEL_LABELS, FUNDING_LABELS } from '../planner/lib/labels'
import type { Overrides } from './overrides'

const EMPTY: Overrides = {
  facultyHomepage: {},
  programPage: {},
  programContact: {},
  addedFaculty: {},
  programFields: {},
}

/** A planner field counts as mine once its origin is anything but 'database'. */
function mine(f: unknown): string | null {
  const field = f as { value?: unknown; origin?: string } | undefined
  if (!field || field.origin === 'database' || field.value == null) return null
  const v = String(field.value).trim()
  return v ? v : null
}

/** Everything the Plan knows that Explore can show, in Explore's own shape. */
export function plannerOverrides(): Overrides {
  let state: {
    programs?: Record<string, unknown>[]
    faculty?: Record<string, unknown>[]
  }
  try {
    const raw = localStorage.getItem(PLANNER_KEY)
    if (!raw) return EMPTY
    state = JSON.parse(raw)
  } catch {
    return EMPTY
  }

  const out: Overrides = {
    facultyHomepage: {},
    programPage: {},
    programContact: {},
    addedFaculty: {},
    programFields: {},
  }

  for (const p of state.programs ?? []) {
    // Only database-backed entries map onto a program Explore can show; a
    // program I typed in by hand has no counterpart there.
    const ref = p.ref as { kind?: string; programId?: string } | undefined
    if (ref?.kind !== 'database' || !ref.programId) continue
    const id = ref.programId

    const adm = (p.admissions ?? {}) as Record<string, unknown>
    const str = (p.structure ?? {}) as Record<string, unknown>
    const fun = (p.funding ?? {}) as Record<string, unknown>

    const fields: Record<string, string> = {}
    const put = (key: string, value: string | null) => {
      if (value) fields[key] = value
    }
    put('deadline_display', mine(adm.deadline))
    put('gre', mine(adm.gre))
    put('english', mine(adm.english))
    put('fee_display', mine(adm.applicationFee))
    put('letters', mine(adm.letters))
    put('duration', mine(str.duration))
    // These two are stored as enum keys; Explore shows (and parses) the label.
    const model = mine(str.admissionModel)
    put('admission_model', model ? (ADMISSION_MODEL_LABELS[model as never] ?? model) : null)
    const level = mine(fun.level)
    put('funding', level ? (FUNDING_LABELS[level as never] ?? level) : null)
    if (Object.keys(fields).length) out.programFields[id] = fields

    const links = p.links as { program?: string } | undefined
    if (links?.program?.trim()) out.programPage[id] = links.program.trim()
    const contact = mine(str.contactEncouraged)
    if (contact) out.programContact[id] = contact
  }

  for (const f of state.faculty ?? []) {
    const ref = f.ref as { kind?: string; seenAs?: { programId: string; facultyId: string }[] } | undefined
    if (ref?.kind !== 'database' || !ref.seenAs?.length) continue
    const links = (f.links ?? {}) as Record<string, string>
    // The planner keeps four links; Explore shows one "homepage" per advisor,
    // so prefer the page I'd actually want to open.
    const url = [links.personal, links.lab, links.faculty].map((s) => s?.trim()).find(Boolean)
    if (!url) continue
    // One person can be on several programs' rosters — fix the link once, see
    // it fixed everywhere they appear.
    for (const seen of ref.seenAs) out.facultyHomepage[advisorKey(seen.programId, seen.facultyId)] = url
  }

  return out
}

/** Explore's own overrides layered on top of the Plan's. */
export function mergeOverrides(base: Overrides, own: Overrides): Overrides {
  const programFields: Record<string, Record<string, string>> = { ...base.programFields }
  for (const [id, fields] of Object.entries(own.programFields)) {
    programFields[id] = { ...(programFields[id] ?? {}), ...fields }
  }
  return {
    facultyHomepage: { ...base.facultyHomepage, ...own.facultyHomepage },
    programPage: { ...base.programPage, ...own.programPage },
    programContact: { ...base.programContact, ...own.programContact },
    // Faculty I added by hand live only in Explore; the planner has its own.
    addedFaculty: own.addedFaculty as Record<string, Faculty[]>,
    programFields,
  }
}
