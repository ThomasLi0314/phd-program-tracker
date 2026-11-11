// The tracker's window onto the application plan.
//
// "Saved" and "Plan" are different things: saving a program is a bookmark,
// planning one is an application in progress with a status, faculty and notes.
// A program's detail page should say which of the two it is in, so this reads
// the planner's store — through the planner's own storage abstraction, never a
// raw localStorage key of its own — and offers one write: "add to plan".
//
// The planner tab, if open, picks up that write through the `storage` event
// (see planner/lib/usePlanner), so the two never disagree for long.

import { useCallback, useEffect, useState } from 'react'
import type { Faculty, Program } from '../types'
import type { ApplicationStatus, InterestLevel, PlannerState } from '../planner/types'
import { localPlannerStorage, PLANNER_KEY } from '../planner/lib/storage'
import { programFromReference } from '../planner/lib/referenceBridge'
import { planProgramId } from '../planner/lib/outreachBridge'

export interface PlanSummary {
  entryId: string
  interest: InterestLevel
  status: ApplicationStatus
  notes: string
  facultyCount: number
  cycle: string
}

function summarise(state: PlannerState): Map<string, PlanSummary> {
  const m = new Map<string, PlanSummary>()
  for (const p of state.programs) {
    if (p.ref.kind !== 'database') continue
    m.set(p.ref.programId, {
      entryId: p.id,
      interest: p.interest,
      status: p.status,
      notes: p.notes,
      facultyCount: p.facultyIds.length,
      cycle: p.cycle,
    })
  }
  return m
}

/**
 * Professors I added to the plan by hand (not in the database), shaped like
 * database advisors so the Contact tab can search, match and link them. Each
 * sits in a synthetic program of its own — see planProgramId — which carries
 * just the fields the Contact views read; it is never shown as a real program.
 */
function customAdvisors(state: PlannerState): { faculty: Faculty; program: Program }[] {
  const programName = new Map(state.programs.map((p) => [p.id, p.programName]))
  return state.faculty
    .filter((f) => f.ref.kind === 'custom' && f.name.trim())
    .map((f) => {
      const progs = f.programIds.map((id) => programName.get(id)).filter((n): n is string => !!n)
      const faculty: Faculty = {
        id: f.id,
        name: f.name.trim(),
        title: f.title,
        sub_field: f.department,
        tags: f.themes,
        summary: '',
        recruitment_status: 'Unknown/Verify',
        links: { homepage: f.links.personal || f.links.lab || f.links.faculty || null, scholar: f.links.scholar || null },
        added: true,
      }
      const program = {
        id: planProgramId(f.id),
        university: f.university.trim() || 'Unknown school',
        program_name: progs.join(' / ') || f.department || 'Added in my plan',
        discipline: { primary: 'Added in my plan', subs: [] },
        faculty: [faculty],
      } as unknown as Program
      return { faculty, program }
    })
}

/** Live-ish map of canonical program id → its plan entry. Empty when not planned. */
export function usePlanSnapshot(): {
  byProgramId: Map<string, PlanSummary>
  /** Hand-added plan professors, as {faculty, program} pairs for the Contact tab. */
  customAdvisors: { faculty: Faculty; program: Program }[]
  refresh: () => void
} {
  const [byProgramId, setMap] = useState<Map<string, PlanSummary>>(() => new Map())
  const [custom, setCustom] = useState<{ faculty: Faculty; program: Program }[]>([])

  const refresh = useCallback(() => {
    void localPlannerStorage.loadPlanner().then((s) => {
      setMap(summarise(s))
      setCustom(customAdvisors(s))
    })
  }, [])

  useEffect(() => {
    refresh()
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === PLANNER_KEY) refresh()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  return { byProgramId, customAdvisors: custom, refresh }
}

/**
 * Add a database program to the plan. Returns the entry id, or the existing
 * one if it was already there — adding the same program twice is never what
 * anyone meant.
 */
export async function addProgramToPlan(p: Program): Promise<string> {
  const state = await localPlannerStorage.loadPlanner()
  const existing = state.programs.find((x) => x.ref.kind === 'database' && x.ref.programId === p.id)
  if (existing) return existing.id
  const entry = programFromReference(p, state.settings.cycle)
  await localPlannerStorage.savePlanner({ ...state, programs: [...state.programs, entry] })
  return entry.id
}
