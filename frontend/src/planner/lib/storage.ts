// Planner persistence, behind one abstraction (spec §30).
//
// No component may touch localStorage directly — everything goes through
// PlannerStorage, so swapping in IndexedDB or a backend later is a one-file
// change. The state is versioned and migrated on load.

import type { PlannerState } from '../types'

/** Deliberately NOT under the `tracker.` prefix: this is a separate app's data. */
export const PLANNER_KEY = 'planner.state.v1'

export const SCHEMA_VERSION = 1 as const

/** Seed text for "My Research Profile" (spec §13). Fully editable afterwards. */
export const DEFAULT_PROFILE = `My background is in applied mathematics and physical oceanography, with a focus on geophysical fluid dynamics and numerical modeling.

I work on regional ocean models and the numerical methods behind them — open boundary conditions, shallow-water models, and the numerical analysis that makes limited-area simulations stable and faithful.

Scientifically I am drawn to mesoscale and submesoscale dynamics and their role in ocean circulation.

I am also interested in scientific machine learning, particularly machine learning applied to numerical models: learned parameterizations, hybrid physics-ML schemes, and data-driven closures.`

export const DEFAULT_SETTINGS = {
  cycle: 'Fall 2027',
  staleAfterDays: 60,
}

export function emptyPlanner(): PlannerState {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    researchProfile: DEFAULT_PROFILE,
    programs: [],
    faculty: [],
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Has the user actually put anything in the planner?
 *
 * This matters for more than tidiness. lib/backup.ts `isLocalEmpty()` decides
 * whether to offer a Google Drive restore on a fresh browser, and it returns
 * true only when EVERY backup key is absent or empty. If merely opening the
 * planner wrote a default state, that offer would be silently suppressed and a
 * user restoring onto a new machine would lose everything — the same class of
 * bug that kept `sidebarFields` out of the backup set. So an untouched planner
 * must leave NO key behind at all (see savePlanner).
 */
export function isEmptyPlanner(s: PlannerState): boolean {
  return (
    s.programs.length === 0 &&
    s.faculty.length === 0 &&
    s.researchProfile.trim() === DEFAULT_PROFILE.trim() &&
    s.settings.cycle === DEFAULT_SETTINGS.cycle &&
    s.settings.staleAfterDays === DEFAULT_SETTINGS.staleAfterDays
  )
}

/**
 * Bring any stored shape up to the current schema. Unknown/absent fields fall
 * back to defaults rather than throwing — a partially-readable planner is worth
 * far more to the user than a clean error.
 */
export function migrate(raw: unknown): PlannerState {
  const base = emptyPlanner()
  if (!raw || typeof raw !== 'object') return base
  const p = raw as Partial<PlannerState>

  // v0 (unversioned pre-release blobs) → v1: same shape, just stamp the version.
  // Future versions add their step here, each taking the previous shape.

  return {
    schemaVersion: SCHEMA_VERSION,
    settings: {
      cycle: typeof p.settings?.cycle === 'string' ? p.settings.cycle : base.settings.cycle,
      staleAfterDays:
        typeof p.settings?.staleAfterDays === 'number' && p.settings.staleAfterDays > 0
          ? p.settings.staleAfterDays
          : base.settings.staleAfterDays,
    },
    researchProfile:
      typeof p.researchProfile === 'string' ? p.researchProfile : base.researchProfile,
    programs: Array.isArray(p.programs) ? p.programs.filter(isRecord) : [],
    faculty: Array.isArray(p.faculty) ? p.faculty.filter(isRecord) : [],
    updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : base.updatedAt,
  }
}

function isRecord<T>(x: T): boolean {
  return !!x && typeof x === 'object'
}

export interface PlannerStorage {
  loadPlanner(): Promise<PlannerState>
  savePlanner(state: PlannerState): Promise<void>
}

export const localPlannerStorage: PlannerStorage = {
  async loadPlanner() {
    try {
      const raw = localStorage.getItem(PLANNER_KEY)
      if (!raw) return emptyPlanner()
      return migrate(JSON.parse(raw))
    } catch {
      // Corrupt JSON shouldn't brick the app; start clean rather than crash.
      return emptyPlanner()
    }
  },

  async savePlanner(state) {
    try {
      if (isEmptyPlanner(state)) {
        // Write nothing for an untouched planner — see isEmptyPlanner for why
        // leaving a key behind would break the Drive restore offer.
        localStorage.removeItem(PLANNER_KEY)
        return
      }
      localStorage.setItem(PLANNER_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }))
    } catch {
      // Quota exceeded / storage blocked — keep the in-memory state usable.
    }
  },
}

/** Stable-enough unique id for planner-local entities. */
export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rand}`
}
