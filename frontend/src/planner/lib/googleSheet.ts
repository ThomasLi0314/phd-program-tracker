// The plan, kept current in a Google Sheet in the user's own Drive.
//
// This replaced "Export Excel": instead of a file that is stale the moment it
// is downloaded, one Sheet with a fixed link that rewrites itself a few seconds
// after every change to the plan. It can be bookmarked, opened on a phone, or
// shared like any other Sheet, and File → Download still gives an .xlsx.
//
// It is the same workbook the export used to build (exportExcel), written
// through a SheetMirror (sheetMirror.ts has the how). This Sheet is a plain
// mirror: every sync replaces its contents, so edits made in the Sheet itself
// are overwritten. The plan is the place to edit.

import { useEffect } from 'react'
import { workbookBytes, type ExportProgramRow } from './exportExcel'
import { flushOnHide, parseLink, readJson, SheetMirror, useMirrorView, writeJson, type SheetLink, type SheetSyncView } from './sheetMirror'

export type { SheetLink, SheetStatus, SheetSyncView } from './sheetMirror'

/** The link to the Sheet. Backed up with the plan (lib/backup), so a restored
 *  browser keeps writing to the same Sheet instead of making a second one. */
export const SHEET_LINK_KEY = 'planner.sheet.v1'

export function loadSheetLink(): SheetLink | null {
  return parseLink(readJson<Partial<SheetLink>>(SHEET_LINK_KEY), 'Application plan')
}

interface PlanSnapshot {
  cycle: string
  rows: ExportProgramRow[]
}

export const planSheet = new SheetMirror<PlanSnapshot>({
  loadLink: loadSheetLink,
  saveLink: (l) => writeJson(SHEET_LINK_KEY, l),
  pushedKey: 'planner.sheet.pushed.v1',
  title: (s) => `PhD application plan — ${s.cycle}`,
  build: (s) => workbookBytes(s.rows, { cycle: s.cycle, exportedAt: new Date() }),
})

let listening = false
function listenOnce(): void {
  if (listening) return
  listening = true
  flushOnHide(() => planSheet.flush())
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === SHEET_LINK_KEY) planSheet.reloadLink()
  })
}

/**
 * Keep the Sheet in step with `rows`. Pass null while the rows aren't final
 * (database or rent still loading) — writing a half-filled Sheet and then the
 * full one would be two writes where one will do.
 */
export function useSheetSync(rows: ExportProgramRow[] | null, cycle: string): void {
  useEffect(() => {
    listenOnce()
  }, [])
  useEffect(() => {
    if (rows) planSheet.offer({ cycle, rows })
  }, [rows, cycle])
}

/** The Sheet's link and sync state, for display. */
export function useSheetView(): SheetSyncView {
  return useMirrorView(planSheet)
}
