// A Google Sheet in the user's own Drive that keeps itself in step with
// something in the app — the plan (googleSheet.ts), or one letter writer's
// checklist (letterSheets.ts).
//
// How: a workbook is built in the browser and uploaded to Drive, which converts
// it into a native Google Sheet; each later change uploads it again over the
// same file. That needs only the Drive API and the drive.file scope the note
// Docs already use — no access to any file this app didn't create — and keeps
// the file's id, link, name, folder and sharing across every rewrite.
//
// Every write replaces the Sheet's contents. A mirror that should keep what
// people type into the Sheet reads it first (`pull`) and folds that into what
// it writes; one that doesn't is a plain mirror, edited in the app.
//
// Each mirror is long-lived (module scope, not React state), so switching
// views neither restarts it nor loses a pending write.

import { useEffect, useState } from 'react'
import { ensureToken, loadClientId, reconsent } from '../../lib/gmail'

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const FILES = 'https://www.googleapis.com/drive/v3/files'
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
  /** the Sheet matches the app; `at` is when it was last written from this browser */
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
  /** false until the app has handed over content (e.g. the database is still loading) */
  ready: boolean
  /** something worth knowing that didn't stop the write (e.g. checkboxes unavailable) */
  notice: string | null
}

// ---- storage ----

export function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage blocked — the in-memory state still works this session */
  }
}

/** A stored link, tolerating older or partial shapes. */
export function parseLink(l: Partial<SheetLink> | null | undefined, fallbackTitle: string): SheetLink | null {
  if (!l || typeof l.fileId !== 'string' || !l.fileId) return null
  return {
    fileId: l.fileId,
    url: typeof l.url === 'string' && l.url ? l.url : `https://docs.google.com/spreadsheets/d/${l.fileId}/edit`,
    title: typeof l.title === 'string' ? l.title : fallbackTitle,
    createdAt: typeof l.createdAt === 'string' ? l.createdAt : '',
  }
}

// ---- Google calls ----

export class DriveError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function failure(res: Response, what: string): Promise<DriveError> {
  const detail = await res.text().catch(() => '')
  let reason = ''
  try {
    reason = JSON.parse(detail)?.error?.message ?? ''
  } catch {
    /* not JSON */
  }
  return new DriveError(res.status, `${what} failed (${res.status})${reason ? `: ${reason.slice(0, 220)}` : ''}`)
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

/** Replace the Sheet's contents with the workbook; the file itself is unchanged. */
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

/** The Sheet's first tab as CSV — what people have typed or ticked in it. */
export async function exportCsv(token: string, fileId: string): Promise<string> {
  const res = await fetch(`${FILES}/${encodeURIComponent(fileId)}/export?mimeType=text%2Fcsv`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) throw new DriveError(404, 'The Google Sheet no longer exists — it was deleted from Drive.')
  if (!res.ok) throw await failure(res, 'Reading the Google Sheet')
  return res.text()
}

export const isAuthError = (e: unknown) => e instanceof DriveError && (e.status === 401 || e.status === 403)
export const isGone = (e: unknown) => e instanceof DriveError && (e.status === 404 || e.status === 410)

/**
 * Run Google calls with a token. ensureToken shows Google's sign-in only if
 * the grant has lapsed, so on a click it renews the sign-in as well; in the
 * background the browser blocks that popup and the lapse is reported instead.
 * A 401/403 on a click asks for consent again and retries once, which covers a
 * token minted before drive.file joined the scopes.
 *
 * Callers start any slow work (building the workbook) before calling this and
 * await it inside `run`: the sign-in popup has to open while the click still
 * counts as a user gesture, or the browser blocks it.
 */
export async function withToken<T>(interactive: boolean, run: (token: string) => Promise<T>): Promise<T> {
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

// ---- the mirror ----

export interface MirrorOptions<S, P> {
  loadLink(): SheetLink | null
  saveLink(link: SheetLink | null): void
  /** localStorage key for what this browser last wrote (not backed up) */
  pushedKey: string
  /** the Sheet's file name when it is made */
  title(snap: S): string
  /** the workbook to write; `pulled` is what pull() read from the Sheet, if anything */
  build(snap: S, pulled: P | undefined): Promise<ArrayBuffer>
  /** read the Sheet before overwriting it, so what people entered there survives */
  pull?(token: string, fileId: string): Promise<P>
  /** after each write; may return a notice for the UI (null clears it) */
  afterWrite?(token: string, fileId: string, snap: S): Promise<string | null>
  /** after the link is forgotten, to drop any bookkeeping kept beside it */
  onUnlink?(): void
}

export class SheetMirror<S, P = undefined> {
  private opts: MirrorOptions<S, P>
  private snapshot: { value: S; hash: string } | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private busy = false
  private again = false
  private watchers = new Set<(v: SheetSyncView) => void>()
  link: SheetLink | null
  status: SheetStatus
  notice: string | null = null

  constructor(opts: MirrorOptions<S, P>) {
    this.opts = opts
    this.link = opts.loadLink()
    this.status = this.link ? { kind: 'synced', at: this.pushed()?.at ?? null } : { kind: 'unlinked' }
  }

  view(): SheetSyncView {
    return { link: this.link, status: this.status, ready: this.snapshot !== null, notice: this.notice }
  }

  subscribe(cb: (v: SheetSyncView) => void): () => void {
    this.watchers.add(cb)
    return () => {
      this.watchers.delete(cb)
    }
  }

  private emit(next?: SheetStatus): void {
    if (next) this.status = next
    const v = this.view()
    for (const w of [...this.watchers]) w(v)
  }

  private pushed(): Pushed | null {
    return readJson<Pushed>(this.opts.pushedKey)
  }

  /** True when the Sheet already holds exactly this snapshot. */
  private upToDate(): boolean {
    const p = this.pushed()
    return !!p && !!this.link && !!this.snapshot && p.fileId === this.link.fileId && p.hash === this.snapshot.hash
  }

  private schedule(): void {
    if (!this.link || !this.snapshot) return
    // A deleted Sheet stays deleted; retrying on every edit would only repeat the 404.
    if (this.status.kind === 'error' && this.status.gone) return
    if (this.timer) clearTimeout(this.timer)
    if (!this.busy) this.emit({ kind: 'pending' })
    this.timer = setTimeout(() => {
      this.timer = null
      void this.push(false)
    }, DEBOUNCE_MS)
  }

  /** Write the current snapshot (pulling first, if this mirror pulls). */
  private async write(token: string, fileId: string, snap: S): Promise<void> {
    const pulled = this.opts.pull ? await this.opts.pull(token, fileId) : undefined
    await updateFile(token, fileId, await this.opts.build(snap, pulled))
    if (this.opts.afterWrite) this.notice = await this.opts.afterWrite(token, fileId, snap)
  }

  private async push(interactive: boolean): Promise<void> {
    const l = this.link
    const snap = this.snapshot
    if (!l || !snap) return
    if (this.busy) {
      // A write is already out; write again when it lands, with whatever is newest.
      this.again = true
      return
    }
    if (this.upToDate() && !interactive) {
      this.emit({ kind: 'synced', at: this.pushed()?.at ?? null })
      return
    }
    this.busy = true
    this.emit({ kind: 'syncing' })
    try {
      await withToken(interactive, (t) => this.write(t, l.fileId, snap.value))
      const at = new Date().toISOString()
      writeJson(this.opts.pushedKey, { fileId: l.fileId, hash: snap.hash, at } satisfies Pushed)
      // An edit made while this upload was out is still waiting its turn.
      this.emit(this.timer || this.again ? { kind: 'pending' } : { kind: 'synced', at })
    } catch (e) {
      this.emit({
        kind: 'error',
        message: e instanceof Error ? e.message : String(e),
        reconnect: isAuthError(e),
        gone: isGone(e),
      })
    } finally {
      this.busy = false
      if (this.again) {
        this.again = false
        if (!this.upToDate()) void this.push(false)
      }
    }
  }

  /** Hand over the current content. Writes only when it changed. */
  offer(value: S): void {
    const hash = hashOf(JSON.stringify(value))
    const first = this.snapshot === null
    if (this.snapshot?.hash === hash) return
    this.snapshot = { value, hash }
    if (!this.link || this.upToDate()) {
      if (first) this.emit()
      return
    }
    this.schedule()
  }

  /** Make the Sheet (a click). Resolves to its link. */
  async create(): Promise<SheetLink> {
    const snap = this.snapshot
    if (!snap) throw new Error('Still loading — try again in a moment.')
    // Replacing a deleted Sheet: if this fails too, the old link is still dead.
    const wasGone = this.status.kind === 'error' && this.status.gone
    this.emit({ kind: 'syncing' })
    try {
      const bytes = this.opts.build(snap.value, undefined)
      bytes.catch(() => {}) // awaited inside withToken; this only stops an early sign-in failure leaving it unhandled
      const created = await withToken(true, async (t) => {
        const made = await createFile(t, this.opts.title(snap.value), await bytes)
        if (this.opts.afterWrite) this.notice = await this.opts.afterWrite(t, made.fileId, snap.value)
        return made
      })
      this.link = created
      this.opts.saveLink(created)
      const at = new Date().toISOString()
      writeJson(this.opts.pushedKey, { fileId: created.fileId, hash: snap.hash, at } satisfies Pushed)
      this.emit({ kind: 'synced', at })
      // Anything edited while the upload was out goes in the next write.
      if (!this.upToDate()) this.schedule()
      return created
    } catch (e) {
      this.emit(
        this.link
          ? { kind: 'error', message: e instanceof Error ? e.message : String(e), reconnect: isAuthError(e), gone: wasGone }
          : { kind: 'unlinked' },
      )
      throw e
    }
  }

  /** Write now, renewing the Google sign-in if it lapsed (a click). */
  syncNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    return this.push(true)
  }

  /** Forget the Sheet. The file itself stays in the user's Drive, untouched. */
  unlink(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.link = null
    this.notice = null
    this.opts.saveLink(null)
    writeJson(this.opts.pushedKey, null)
    this.opts.onUnlink?.()
    this.emit({ kind: 'unlinked' })
  }

  /** Send a waiting write straight away (the tab is being hidden or closed). */
  flush(): void {
    if (!this.timer) return
    clearTimeout(this.timer)
    this.timer = null
    void this.push(false)
  }

  /** Another tab made or dropped the Sheet: follow it rather than make a second. */
  reloadLink(): void {
    const next = this.opts.loadLink()
    if (next?.fileId === this.link?.fileId) return
    this.link = next
    if (!this.link) this.emit({ kind: 'unlinked' })
    else if (this.snapshot && !this.upToDate()) this.schedule()
    else this.emit({ kind: 'synced', at: this.pushed()?.at ?? null })
  }
}

/** Flush every mirror when the tab is hidden or closed. */
const flushers = new Set<() => void>()
let listening = false
export function flushOnHide(flush: () => void): void {
  flushers.add(flush)
  if (listening) return
  listening = true
  const all = () => {
    for (const f of flushers) f()
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') all()
  })
  window.addEventListener('pagehide', all)
}

/** A mirror's link and sync state, for display. */
export function useMirrorView<S, P>(mirror: SheetMirror<S, P>): SheetSyncView {
  const [v, setV] = useState<SheetSyncView>(() => mirror.view())
  useEffect(() => {
    setV(mirror.view())
    return mirror.subscribe(setV)
  }, [mirror])
  return v
}
