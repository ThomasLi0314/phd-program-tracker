// Export / import of everything the user creates in this app. All of it lives in
// localStorage, which "clear browsing data" wipes irrecoverably — so a backup
// file (and the Drive sync built on top of this) is the only durable copy.
// Secrets (API keys) are deliberately NOT exported.

/** Every localStorage key holding user-created data, with a human label. */
export const BACKUP_KEYS: { key: string; label: string }[] = [
  { key: 'tracker.myList.v1', label: 'Starred programs (My List)' },
  { key: 'tracker.starredAdvisors.v1', label: 'Starred advisors + priorities' },
  { key: 'tracker.advisorNotes.v1', label: 'Advisor notes' },
  { key: 'tracker.outreach.v1', label: 'Outreach / reply tracking' },
  { key: 'tracker.overrides.v1', label: 'Link fixes, contacts, added advisors' },
]

export interface BackupFile {
  app: 'phd-program-tracker'
  version: 1
  exportedAt: string
  data: Record<string, unknown>
}

/** Snapshot all user data from localStorage. */
export function exportBackup(): BackupFile {
  const data: Record<string, unknown> = {}
  for (const { key } of BACKUP_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (raw) data[key] = JSON.parse(raw)
    } catch {
      /* skip unreadable key */
    }
  }
  return {
    app: 'phd-program-tracker',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
}

/** Count of items per section, for showing the user what's in a snapshot. */
export function describeBackup(b: BackupFile): { label: string; count: number }[] {
  const size = (v: unknown): number => {
    if (Array.isArray(v)) return v.length
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      // outreach/overrides are nested containers — count their meaningful rows
      if ('records' in o) return Object.keys((o.records as object) ?? {}).length
      if ('facultyHomepage' in o) {
        return (
          Object.keys((o.facultyHomepage as object) ?? {}).length +
          Object.keys((o.programPage as object) ?? {}).length +
          Object.keys((o.programContact as object) ?? {}).length +
          Object.values((o.addedFaculty as Record<string, unknown[]>) ?? {}).reduce(
            (n, list) => n + (Array.isArray(list) ? list.length : 0),
            0,
          )
        )
      }
      return Object.keys(o).length
    }
    return 0
  }
  return BACKUP_KEYS.map(({ key, label }) => ({ label, count: size(b.data[key]) }))
}

export function isBackupFile(x: unknown): x is BackupFile {
  return (
    !!x &&
    typeof x === 'object' &&
    (x as BackupFile).app === 'phd-program-tracker' &&
    typeof (x as BackupFile).data === 'object'
  )
}

/** Overwrite local data with a backup. Caller should reload the page after. */
export function applyBackup(b: BackupFile): number {
  let n = 0
  for (const { key } of BACKUP_KEYS) {
    if (!(key in b.data)) continue
    try {
      localStorage.setItem(key, JSON.stringify(b.data[key]))
      n++
    } catch {
      /* storage blocked */
    }
  }
  return n
}

/** Trigger a download of the current snapshot. */
export function downloadBackup(): void {
  const b = exportBackup()
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `phd-tracker-backup-${b.exportedAt.slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** True when the user has nothing saved yet (used to auto-restore from Drive). */
export function isLocalEmpty(): boolean {
  return BACKUP_KEYS.every(({ key }) => {
    try {
      const raw = localStorage.getItem(key)
      return !raw || raw === '{}' || raw === '[]'
    } catch {
      return true
    }
  })
}
