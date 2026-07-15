// Backup sync to the user's Google Drive **appDataFolder** — a private folder
// only this app can see (we get no access to their real Drive files). This is
// the durable copy: localStorage is wiped by "clear browsing data", Drive isn't.
// Uses the same GIS token as Gmail (scope drive.appdata).

import type { BackupFile } from './backup'

const FILE_NAME = 'phd-tracker-backup.json'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const SYNC_STORE = 'tracker.driveSync.v1'

export function loadSyncEnabled(): boolean {
  try {
    return localStorage.getItem(SYNC_STORE) === '1'
  } catch {
    return false
  }
}
export function saveSyncEnabled(on: boolean): void {
  try {
    localStorage.setItem(SYNC_STORE, on ? '1' : '0')
  } catch {
    /* ignore */
  }
}

async function findFileId(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`)
  const res = await fetch(
    `${API}/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`)
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

/** Create or overwrite the backup file in the app-data folder. */
export async function saveToDrive(token: string, backup: BackupFile): Promise<void> {
  const id = await findFileId(token)
  const boundary = 'tracker-boundary-7d31f2a9'
  const metadata = id ? {} : { name: FILE_NAME, parents: ['appDataFolder'] }
  const body =
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(backup) +
    `\r\n--${boundary}--`
  const res = await fetch(`${UPLOAD}/files${id ? `/${id}` : ''}?uploadType=multipart`, {
    method: id ? 'PATCH' : 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) throw new Error(`Drive save failed (${res.status})`)
}

/** Read the backup file, or null if none exists yet. */
export async function loadFromDrive(token: string): Promise<BackupFile | null> {
  const id = await findFileId(token)
  if (!id) return null
  const res = await fetch(`${API}/files/${id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Drive read failed (${res.status})`)
  return res.json()
}

/** When the Drive backup was last written (ISO), or null. */
export async function driveBackupTime(token: string): Promise<string | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}'`)
  const res = await fetch(
    `${API}/files?spaces=appDataFolder&q=${q}&fields=files(modifiedTime)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) return null
  const data = await res.json()
  return data.files?.[0]?.modifiedTime ?? null
}
