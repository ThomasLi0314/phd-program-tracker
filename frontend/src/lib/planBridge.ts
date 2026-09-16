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
import type { Program } from '../types'
import type { ApplicationStatus, InterestLevel, PlannerState } from '../planner/types'
import { localPlannerStorage, PLANNER_KEY } from '../planner/lib/storage'
import { programFromReference } from '../planner/lib/referenceBridge'

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

/** Live-ish map of canonical program id → its plan entry. Empty when not planned. */
export function usePlanSnapshot(): { byProgramId: Map<string, PlanSummary>; refresh: () => void } {
  const [byProgramId, setMap] = useState<Map<string, PlanSummary>>(() => new Map())

  const refresh = useCallback(() => {
    void localPlannerStorage.loadPlanner().then((s) => setMap(summarise(s)))
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

  return { byProgramId, refresh }
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
