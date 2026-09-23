// Keep everything you save in your Google Drive, automatically.
//
// localStorage is the working copy; Drive's app-data folder is the durable one.
// "Clear browsing data" wipes the first and leaves the second, so this module
// exists to make that survivable: it uploads after every change, and when it
// meets an empty browser with a backup in Drive it restores it.
//
// It runs from main.tsx, not from a view, because the planner and the master's
// plan are separate apps in this bundle — a sync that lived in the tracker's
// App.tsx never saw their edits (that was the old behaviour and the reason a
// cleared browser lost plan data).
//
// Safety rules, in order of importance:
//   1. An empty browser never overwrites a non-empty Drive backup.
//   2. If Drive changed since our last sync (another device), we stop and ask
//      instead of silently overwriting either side.
//   3. Nothing here ever deletes the Drive file.

import { applyBackup, exportBackup, isLocalEmpty, subscribeToUserData } from './backup'
import { driveBackupTime, loadFromDrive, loadSyncEnabled, saveToDrive } from './drive'
import { ensureToken, loadClientId } from './gmail'

/** ISO modifiedTime of the Drive file as we last wrote or read it. */
const LAST_SYNC_KEY = 'tracker.drive.lastSync.v1'
const DEBOUNCE_MS = 5000

export type SyncState =
  /** no Google account connected, or the user turned backup off */
  | { kind: 'off'; reason: 'no-account' | 'disabled' }
  | { kind: 'idle'; lastBackup: string | null }
  | { kind: 'working'; what: 'backup' | 'restore' }
  /** Drive holds a backup newer than ours — the user picks a side */
  | { kind: 'conflict'; driveTime: string }
  | { kind: 'error'; message: string }

let state: SyncState = { kind: 'off', reason: 'no-account' }
const watchers = new Set<(s: SyncState) => void>()

function setState(next: SyncState): void {
  state = next
  for (const w of [...watchers]) w(next)
}

export function getSyncState(): SyncState {
  return state
}

export function subscribeSyncState(cb: (s: SyncState) => void): () => void {
  watchers.add(cb)
  cb(state)
  return () => watchers.delete(cb)
}

const readLastSync = (): string | null => {
  try {
    return localStorage.getItem(LAST_SYNC_KEY)
  } catch {
    return null
  }
}
const writeLastSync = (iso: string | null): void => {
  try {
    if (iso) localStorage.setItem(LAST_SYNC_KEY, iso)
  } catch {
    /* storage blocked */
  }
}

async function token(): Promise<string> {
  const clientId = loadClientId()
  if (!clientId) throw new Error('no client id')
  return ensureToken(clientId)
}

/** Upload the current snapshot and remember when Drive says it landed. */
async function upload(): Promise<void> {
  if (isLocalEmpty()) return // rule 1
  setState({ kind: 'working', what: 'backup' })
  const t = await token()
  await saveToDrive(t, exportBackup())
  const when = await driveBackupTime(t)
  writeLastSync(when)
  setState({ kind: 'idle', lastBackup: when })
}

/** Replace this browser's data with the Drive backup, then reload. */
export async function restoreFromDrive(): Promise<boolean> {
  setState({ kind: 'working', what: 'restore' })
  const t = await token()
  const backup = await loadFromDrive(t)
  if (!backup) {
    setState({ kind: 'idle', lastBackup: null })
    return false
  }
  applyBackup(backup)
  writeLastSync(await driveBackupTime(t))
  location.reload()
  return true
}

/** Back up now, whatever the schedule says. Surfaces errors in the state. */
export async function backupNow(): Promise<void> {
  try {
    await upload()
  } catch (e) {
    setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** Resolve a two-device conflict by choosing which copy wins. */
export async function resolveConflict(choice: 'restore' | 'keep-local'): Promise<void> {
  try {
    if (choice === 'restore') await restoreFromDrive()
    else await upload() // overwrite Drive with this browser
  } catch (e) {
    setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** True once we have compared this browser with Drive at least once. */
let reconciled = false

let timer: ReturnType<typeof setTimeout> | null = null
function schedule(): void {
  if (state.kind === 'conflict') return // don't clobber the other device
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    // If the first comparison never succeeded (offline, expired grant), redo it
    // rather than uploading blind over a copy we have not looked at.
    void (reconciled ? backupNow() : tryReconcile())
  }, DEBOUNCE_MS)
}

/** Send a pending backup immediately when the tab is being hidden or closed. */
function flush(): void {
  if (!timer) return
  clearTimeout(timer)
  timer = null
  void backupNow()
}

/**
 * What the Drive file and this browser mean for each other. Pure, so the rules
 * can be checked without a Google account:
 *
 *  - nothing in Drive        → upload what we have (or sit idle if we have none)
 *  - nothing here            → restore; an empty browser has nothing to lose
 *  - Drive moved since we    → ask; another device has saved and neither copy
 *    last synced               may be thrown away silently
 *  - otherwise               → this browser is the writer; keep Drive current
 */
export function decideSync(input: {
  remoteTime: string | null
  localEmpty: boolean
  lastSync: string | null
  alreadyRestored: boolean
}): 'upload' | 'restore' | 'conflict' | 'idle' {
  const { remoteTime, localEmpty, lastSync, alreadyRestored } = input
  if (!remoteTime) return localEmpty ? 'idle' : 'upload'
  if (localEmpty) return alreadyRestored ? 'idle' : 'restore'
  if (lastSync && remoteTime > lastSync) return 'conflict'
  return 'upload'
}

/** Set once a restore has run in this tab, so a failed one cannot reload forever. */
const RESTORED_FLAG = 'tracker.drive.restored.v1'
const alreadyRestored = (): boolean => {
  try {
    return sessionStorage.getItem(RESTORED_FLAG) === '1'
  } catch {
    return false
  }
}
const markRestored = (): void => {
  try {
    sessionStorage.setItem(RESTORED_FLAG, '1')
  } catch {
    /* storage blocked */
  }
}

async function reconcile(): Promise<void> {
  const t = await token()
  const remote = await driveBackupTime(t)
  switch (
    decideSync({
      remoteTime: remote,
      localEmpty: isLocalEmpty(),
      lastSync: readLastSync(),
      alreadyRestored: alreadyRestored(),
    })
  ) {
    case 'restore':
      markRestored()
      await restoreFromDrive()
      return
    case 'conflict':
      setState({ kind: 'conflict', driveTime: remote! })
      return
    case 'upload':
      await upload()
      return
    default:
      setState({ kind: 'idle', lastBackup: remote })
  }
}

/** Compare with Drive, reporting rather than throwing. */
async function tryReconcile(): Promise<void> {
  try {
    await reconcile()
    reconciled = true
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // A lapsed grant is normal after a week away — Settings explains reconnecting.
    setState({
      kind: 'error',
      message: /expired|not connected|reconnect|no client id|popup/i.test(msg)
        ? 'Google connection expired — reconnect in Settings to resume backups.'
        : msg,
    })
  }
}

let started = false

/**
 * Start (or restart, after connecting an account) the automatic backup.
 * Safe to call repeatedly.
 */
export function startDriveAutoSync(restart = false): void {
  if (restart) reconciled = false
  if (started && !restart) return
  started = true

  if (!loadClientId()) {
    setState({ kind: 'off', reason: 'no-account' })
    return
  }
  if (!loadSyncEnabled()) {
    setState({ kind: 'off', reason: 'disabled' })
    return
  }

  // Watch for changes first: a failed first comparison must not leave the
  // session unwatched, since the next edit is what triggers the retry.
  subscribeToUserData(schedule)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('pagehide', flush)
  void tryReconcile()
}
