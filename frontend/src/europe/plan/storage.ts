// Persistence for the master's plan. Same contract as planner/lib/storage:
// nothing outside this file touches localStorage, the stored shape is migrated
// on load, and an untouched plan writes NO key — lib/backup's isLocalEmpty()
// needs every backup key absent on a fresh browser to offer the Drive restore.

import type { ChecklistItem, MastersPlanEntry, MastersPlanState } from './types'
import { DEFAULT_CHECKLIST, EMPTY_MINE } from './types'

/** Listed in lib/backup BACKUP_KEYS, so file backups and Drive sync carry it. */
export const MASTERS_PLAN_KEY = 'masters.plan.v1'

export const DEFAULT_CYCLE = 'Fall 2027'

export function emptyPlan(): MastersPlanState {
  return {
    schemaVersion: 1,
    settings: { cycle: DEFAULT_CYCLE },
    programs: [],
    updatedAt: new Date().toISOString(),
  }
}

export function isEmptyPlan(s: MastersPlanState): boolean {
  return s.programs.length === 0 && s.settings.cycle === DEFAULT_CYCLE
}

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rand}`
}

export function defaultChecklist(): ChecklistItem[] {
  return DEFAULT_CHECKLIST.map((label) => ({ id: newId('chk'), label, done: false }))
}

const str = (x: unknown, fallback = ''): string => (typeof x === 'string' ? x : fallback)
const strOrNull = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x : null)

/**
 * Fill anything missing with a default instead of throwing: a plan that is
 * half-readable is worth far more than a clean error and an empty page.
 */
function migrateEntry(raw: unknown): MastersPlanEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Partial<MastersPlanEntry>
  if (typeof e.id !== 'string') return null
  const now = new Date().toISOString()
  const mine = (e.mine ?? {}) as Partial<MastersPlanEntry['mine']>
  return {
    id: e.id,
    ref:
      e.ref && e.ref.kind === 'database' && typeof e.ref.programId === 'string'
        ? { kind: 'database', programId: e.ref.programId }
        : { kind: 'custom' },
    university: str(e.university),
    programName: str(e.programName),
    city: str(e.city),
    country: str(e.country),
    links: { program: str(e.links?.program), portal: str(e.links?.portal) },
    intake: str(e.intake, DEFAULT_CYCLE),
    interest: e.interest ?? 'interested',
    status: e.status ?? 'considering',
    scholarship: e.scholarship ?? 'undecided',
    mine: {
      ...EMPTY_MINE,
      deadline: strOrNull(mine.deadline),
      scholarshipDeadline: strOrNull(mine.scholarshipDeadline),
      tuition: strOrNull(mine.tuition),
      applicationFee: strOrNull(mine.applicationFee),
      english: strOrNull(mine.english),
    },
    checklist: Array.isArray(e.checklist)
      ? e.checklist
          .filter((c): c is ChecklistItem => !!c && typeof c === 'object' && typeof c.label === 'string')
          .map((c) => ({ id: str(c.id) || newId('chk'), label: c.label, done: !!c.done }))
      : defaultChecklist(),
    submittedOn: strOrNull(e.submittedOn),
    notes: str(e.notes),
    createdAt: str(e.createdAt, now),
    updatedAt: str(e.updatedAt, now),
  }
}

export function migratePlan(raw: unknown): MastersPlanState {
  const base = emptyPlan()
  if (!raw || typeof raw !== 'object') return base
  const p = raw as Partial<MastersPlanState>
  return {
    schemaVersion: 1,
    settings: {
      cycle: typeof p.settings?.cycle === 'string' && p.settings.cycle.trim() ? p.settings.cycle : DEFAULT_CYCLE,
    },
    programs: Array.isArray(p.programs)
      ? p.programs.map(migrateEntry).filter((x): x is MastersPlanEntry => !!x)
      : [],
    updatedAt: str(p.updatedAt, base.updatedAt),
  }
}

export function loadPlan(): MastersPlanState {
  try {
    const raw = localStorage.getItem(MASTERS_PLAN_KEY)
    return raw ? migratePlan(JSON.parse(raw)) : emptyPlan()
  } catch {
    // Corrupt JSON must not brick the page.
    return emptyPlan()
  }
}

export function savePlan(state: MastersPlanState): void {
  try {
    if (isEmptyPlan(state)) {
      localStorage.removeItem(MASTERS_PLAN_KEY)
      return
    }
    localStorage.setItem(MASTERS_PLAN_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }))
  } catch {
    // Quota exceeded / storage blocked — the in-memory plan stays usable.
  }
}
