// Export / import of the whole planner (spec §31).
//
// This may hold months of application work, and it lives in localStorage —
// which "clear browsing data" erases irrecoverably. The tracker already learned
// that lesson the hard way, so the export path is deliberately plain JSON that
// a human can read and re-import anywhere.

import type { PlannerState } from '../types'
import { migrate } from './storage'

export interface PlannerFile {
  app: 'phd-planner'
  version: 1
  exportedAt: string
  planner: PlannerState
}

export function buildExport(state: PlannerState): PlannerFile {
  return {
    app: 'phd-planner',
    version: 1,
    exportedAt: new Date().toISOString(),
    planner: state,
  }
}

export function downloadPlanner(state: PlannerState): void {
  const file = buildExport(state)
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `phd-planner-${file.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export interface ParseResult {
  ok: boolean
  /** Present when ok. Already migrated to the current schema. */
  planner?: PlannerState
  error?: string
  /** What the user is about to import, so they can confirm before replacing. */
  summary?: { programs: number; faculty: number; exportedAt: string }
}

/**
 * Validate before letting anything near the live state (spec §31). A wrong file
 * silently replacing a planner would be unrecoverable, so this refuses anything
 * it cannot positively identify.
 */
export function parsePlannerFile(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, error: `That file isn't valid JSON (${(e as Error).message}).` }
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'That file does not contain a planner object.' }
  }
  const f = raw as Partial<PlannerFile>
  if (f.app !== 'phd-planner') {
    return {
      ok: false,
      error:
        'That file is not a planner export. (A tracker backup from the ⚠️ Backup panel is a different file — import it there instead.)',
    }
  }
  if (!f.planner || typeof f.planner !== 'object') {
    return { ok: false, error: 'That planner export has no planner data in it.' }
  }
  const planner = migrate(f.planner)
  return {
    ok: true,
    planner,
    summary: {
      programs: planner.programs.length,
      faculty: planner.faculty.length,
      exportedAt: typeof f.exportedAt === 'string' ? f.exportedAt.slice(0, 10) : 'unknown date',
    },
  }
}
