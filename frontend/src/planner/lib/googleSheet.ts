// The plan, kept current in a Google Sheet in the user's own Drive.
//
// This replaces "Export Excel": instead of a file that is stale the moment it
// is downloaded, one Sheet with a fixed link that rewrites itself a few seconds
// after every change to the plan. It can be bookmarked, opened on a phone, or
// shared like any other Sheet, and File → Download still gives an .xlsx.
//
// How: the same workbook the export used to build (exportExcel) is uploaded to
// Drive, which converts it into a native Google Sheet; each later change
// uploads it again over the same file. That needs only the Drive API and the
// drive.file scope the note Docs already use — no Sheets API to enable in the
// user's Cloud project, and no access to any file this app didn't create.
//
// The Sheet is a mirror: every sync replaces its contents, so edits made in
// the Sheet itself are overwritten. The plan is the place to edit.
//
// The engine is a module singleton (like lib/driveSync) so switching views in
// the planner neither restarts it nor loses a pending write. PlannerApp feeds
// it the rows through useSheetSync; the Programs page shows its state.

import { useEffect, useState } from 'react'
import { ensureToken, loadClientId, reconsent } from '../../lib/gmail'
import { workbookBytes, type ExportProgramRow } from './exportExcel'

/** The link to the Sheet. Backed up with the plan (lib/backup), so a restored
 *  browser keeps writing to the same Sheet instead of making a second one. */
export const SHEET_LINK_KEY = 'planner.sheet.v1'
/** What was last written, per browser. Not backed up: it is bookkeeping. */
const PUSHED_KEY = 'planner.sheet.pushed.v1'

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const SHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const DEBOUNCE_MS = 3000

export interface SheetLink {
  fileId: string
  url: string
  title: string
  createdAt: string
}

interface Pushed {
  fileId: string
  hash: string
  at: string
}

export type SheetStatus =
  | { kind: 'unlinked' }
  /** the Sheet matches the plan; `at` is when it was last written from this browser */
  | { kind: 'synced'; at: string | null }
  /** a change is waiting out the debounce */
  | { kind: 'pending' }
  | { kind: 'syncing' }
  | {
      kind: 'error'
      message: string
      /** the Google sign-in lapsed — a click on "Sync now" can renew it */
      reconnect: boolean
      /** the Sheet was deleted or trashed — only a new one will do */
      gone: boolean
    }

export interface SheetSyncView {
  link: SheetLink | null
  status: SheetStatus
  /** false until the planner has handed over rows (the database is still loading) */
  ready: boolean
}

// ---- storage ----

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked — the in-memory state still works this session */
  }
}

export function loadSheetLink(): SheetLink | null {
  const l = readJson<Partial<SheetLink>>(SHEET_LINK_KEY)
  if (!l || typeof l.fileId !== 'string' || !l.fileId) return null
  return {
    fileId: l.fileId,
    url: typeof l.url === 'string' && l.url ? l.url : `https://docs.google.com/spreadsheets/d/${l.fileId}/edit`,
    title: typeof l.title === 'string' ? l.title : 'Application plan',
    createdAt: typeof l.createdAt === 'string' ? l.createdAt : '',
  }
}

// ---- Drive calls ----

class DriveError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function failure(res: Response, what: string): Promise<DriveError> {
  const detail = await res.text().catch(() => '')
  let reason = ''
  try {
    reason = JSON.parse(detail)?.error?.message ?? ''
  } catch {
    /* not JSON */
  }
  return new DriveError(res.status, `${what} failed (${res.status})${reason ? `: ${reason.slice(0, 160)}` : ''}`)
}

/** Upload the workbook as a new Google Sheet in the root of the user's Drive. */
async function createFile(token: string, title: string, bytes: ArrayBuffer): Promise<SheetLink> {
  const boundary = 'tracker-sheet-boundary-93c1e7'
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify({ name: title, mimeType: SHEET_MIME }),
    `\r\n--${boundary}\r\nContent-Type: ${XLSX_MIME}\r\n\r\n`,
    bytes,
    `\r\n--${boundary}--`,
  ])
  const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) throw await failure(res, 'Creating the Google Sheet')
  const data = await res.json()
  return {
    fileId: data.id,
    url: data.webViewLink ?? `https://docs.google.com/spreadsheets/d/${data.id}/edit`,
    title: data.name ?? title,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Replace the Sheet's contents with the workbook. Only the content changes —
 * the file keeps its id, link, name, folder and sharing, so a renamed, moved or
 * shared Sheet stays that way.
 */
async function updateFile(token: string, fileId: string, bytes: ArrayBuffer): Promise<void> {
  const res = await fetch(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&fields=id,trashed`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': XLSX_MIME },
    body: bytes,
  })
  if (res.status === 404) throw new DriveError(404, 'The Google Sheet no longer exists — it was deleted from Drive.')
  if (!res.ok) throw await failure(res, 'Updating the Google Sheet')
  const data = await res.json().catch(() => ({}))
  if (data?.trashed) throw new DriveError(410, 'The Google Sheet is in your Drive trash — restore it there, or make a new one.')
}

const isAuthError = (e: unknown) => e instanceof DriveError && (e.status === 401 || e.status === 403)
const isGone = (e: unknown) => e instanceof DriveError && (e.status === 404 || e.status === 410)

/**
 * Run a Drive call with a token. ensureToken shows Google's sign-in only if
 * the grant has lapsed, so on a click it renews the sign-in as well; in the
 * background the browser blocks that popup and the lapse is reported instead.
 * A 401/403 on a click asks for consent again and retries once, which covers a
 * token minted before drive.file joined the scopes.
 *
 * Callers start any slow work (building the workbook) before calling this and
 * await it inside `run`: the sign-in popup has to open while the click still
 * counts as a user gesture, or the browser blocks it.
 */
async function withToken<T>(interactive: boolean, run: (token: string) => Promise<T>): Promise<T> {
  const clientId = loadClientId()
  if (!clientId) throw new DriveError(401, 'Connect a Google account first (Explore → Settings).')
  let token: string
  try {
    token = await ensureToken(clientId)
  } catch (e) {
    throw new DriveError(
      401,
      interactive
        ? `Google sign-in didn’t finish (${e instanceof Error ? e.message : String(e)}) — try again.`
        : 'Google sign-in expired — click “Sync now” to reconnect.',
    )
  }
  try {
    return await run(token)
  } catch (e) {
    if (!interactive || !isAuthError(e)) throw e
    return run(await reconsent(clientId))
  }
}

// ---- the engine ----

interface Snapshot {
  rows: ExportProgramRow[]
  cycle: string
  hash: string
}

let snapshot: Snapshot | null = null
let link: SheetLink | null = loadSheetLink()
let status: SheetStatus = link ? { kind: 'synced', at: readJson<Pushed>(PUSHED_KEY)?.at ?? null } : { kind: 'unlinked' }
let timer: ReturnType<typeof setTimeout> | null = null
let busy = false
let again = false

const watchers = new Set<(v: SheetSyncView) => void>()
const view = (): SheetSyncView => ({ link, status, ready: snapshot !== null })
function emit(next?: SheetStatus): void {
  if (next) status = next
  const v = view()
  for (const w of [...watchers]) w(v)
}

/** cyrb53 — a fast string hash; only used to tell "changed" from "unchanged". */
function hashOf(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 2654435761)
    h2 = Math.imul(h2 ^ c, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** True when the Sheet already holds exactly this snapshot. */
function upToDate(snap: Snapshot, l: SheetLink): boolean {
  const p = readJson<Pushed>(PUSHED_KEY)
  return !!p && p.fileId === l.fileId && p.hash === snap.hash
}

function schedule(): void {
  if (!link || !snapshot) return
  // A deleted Sheet stays deleted; retrying on every edit would only repeat the 404.
  if (status.kind === 'error' && status.gone) return
  if (timer) clearTimeout(timer)
  if (!busy) emit({ kind: 'pending' })
  timer = setTimeout(() => {
    timer = null
    void push(false)
  }, DEBOUNCE_MS)
}

async function push(interactive: boolean): Promise<void> {
  const l = link
  const snap = snapshot
  if (!l || !snap) return
  if (busy) {
    // A write is already out; write again when it lands, with whatever is newest.
    again = true
    return
  }
  if (upToDate(snap, l) && !interactive) {
    emit({ kind: 'synced', at: readJson<Pushed>(PUSHED_KEY)?.at ?? null })
    return
  }
  busy = true
  emit({ kind: 'syncing' })
  try {
    const bytes = workbookBytes(snap.rows, { cycle: snap.cycle, exportedAt: new Date() })
    bytes.catch(() => {}) // awaited inside withToken; this only stops an early sign-in failure leaving it unhandled
    await withToken(interactive, async (t) => updateFile(t, l.fileId, await bytes))
    const at = new Date().toISOString()
    writeJson(PUSHED_KEY, { fileId: l.fileId, hash: snap.hash, at } satisfies Pushed)
    // An edit made while this upload was out is still waiting its turn.
    emit(timer || again ? { kind: 'pending' } : { kind: 'synced', at })
  } catch (e) {
    emit({
      kind: 'error',
      message: e instanceof Error ? e.message : String(e),
      reconnect: isAuthError(e),
      gone: isGone(e),
    })
  } finally {
    busy = false
    if (again) {
      again = false
      if (snapshot && link && !upToDate(snapshot, link)) void push(false)
    }
  }
}

/** Hand the engine the plan's current rows. Writes only when they changed. */
export function offerSnapshot(rows: ExportProgramRow[], cycle: string): void {
  const hash = hashOf(JSON.stringify({ cycle, rows }))
  const first = snapshot === null
  if (snapshot?.hash === hash) return
  snapshot = { rows, cycle, hash }
  if (!link) {
    if (first) emit()
    return
  }
  if (upToDate(snapshot, link)) {
    if (first) emit()
    return
  }
  schedule()
}

/** Make the Sheet (a click). Resolves to its link. */
export async function createSheet(): Promise<SheetLink> {
  const snap = snapshot
  if (!snap) throw new Error('The program database is still loading — try again in a moment.')
  // Replacing a deleted Sheet: if this fails too, the old link is still dead.
  const wasGone = status.kind === 'error' && status.gone
  emit({ kind: 'syncing' })
  try {
    const bytes = workbookBytes(snap.rows, { cycle: snap.cycle, exportedAt: new Date() })
    bytes.catch(() => {}) // awaited inside withToken; this only stops an early sign-in failure leaving it unhandled
    const created = await withToken(true, async (t) => createFile(t, `PhD application plan — ${snap.cycle}`, await bytes))
    link = created
    writeJson(SHEET_LINK_KEY, created)
    const at = new Date().toISOString()
    writeJson(PUSHED_KEY, { fileId: created.fileId, hash: snap.hash, at } satisfies Pushed)
    emit({ kind: 'synced', at })
    // Anything edited while the upload was out goes in the next write.
    if (snapshot && !upToDate(snapshot, created)) schedule()
    return created
  } catch (e) {
    emit(
      link
        ? { kind: 'error', message: e instanceof Error ? e.message : String(e), reconnect: isAuthError(e), gone: wasGone }
        : { kind: 'unlinked' },
    )
    throw e
  }
}

/** Write now, renewing the Google sign-in if it lapsed (a click). */
export function syncNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  return push(true)
}

/** Forget the Sheet. The file itself stays in the user's Drive, untouched. */
export function unlinkSheet(): void {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  link = null
  writeJson(SHEET_LINK_KEY, null)
  writeJson(PUSHED_KEY, null)
  emit({ kind: 'unlinked' })
}

/** Send a waiting write straight away when the tab is hidden or closed. */
function flush(): void {
  if (!timer) return
  clearTimeout(timer)
  timer = null
  void push(false)
}

let listening = false
function listenOnce(): void {
  if (listening) return
  listening = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
  // Another tab made or dropped the Sheet: follow it rather than make a second.
  window.addEventListener('storage', (e) => {
    if (e.key !== null && e.key !== SHEET_LINK_KEY) return
    const next = loadSheetLink()
    if (next?.fileId === link?.fileId) return
    link = next
    if (!link) emit({ kind: 'unlinked' })
    else if (snapshot && !upToDate(snapshot, link)) schedule()
    else emit({ kind: 'synced', at: readJson<Pushed>(PUSHED_KEY)?.at ?? null })
  })
}

// ---- React ----

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
    if (rows) offerSnapshot(rows, cycle)
  }, [rows, cycle])
}

/** The Sheet's link and sync state, for display. */
export function useSheetView(): SheetSyncView {
  const [v, setV] = useState<SheetSyncView>(view)
  useEffect(() => {
    watchers.add(setV)
    setV(view())
    return () => {
      watchers.delete(setV)
    }
  }, [])
  return v
}
