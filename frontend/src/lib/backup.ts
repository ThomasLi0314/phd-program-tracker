// Export / import of everything the user creates in this app. All of it lives in
// localStorage, which "clear browsing data" wipes irrecoverably — so a backup
// file (and the Drive sync built on top of this) is the only durable copy.
// Secrets (API keys) are deliberately NOT exported.

/** Every localStorage key holding user-created data, with a human label. */
export const BACKUP_KEYS: { key: string; label: string }[] = [
  // The storage keys keep their historical names so existing backups restore;
  // only the labels follow the current vocabulary (Saved / Plan / Contact).
  { key: 'tracker.myList.v1', label: 'Saved programs' },
  { key: 'tracker.schoolTiers.v1', label: 'School tiers' },
  { key: 'tracker.starredAdvisors.v1', label: 'Saved advisors + priorities' },
  { key: 'tracker.advisorNotes.v1', label: 'Advisor notes' },
  { key: 'tracker.outreach.v1', label: 'Contact records (emails, replies)' },
  { key: 'tracker.overrides.v1', label: 'Edits, link fixes, added advisors' },
  // Pointers only — the note text lives in the user's own Google Docs.
  { key: 'tracker.programDocs.v1', label: 'Program note Docs (links)' },
  // The planner writes NOTHING until the user actually creates something, so an
  // untouched planner leaves no key and isLocalEmpty() below stays true — a
  // fresh browser still gets offered the Drive restore. See planner/lib/storage.
  { key: 'planner.state.v1', label: 'Application plan (programs, faculty, notes)' },
  // Same rule as the planner: an untouched master's plan writes no key.
  { key: 'masters.plan.v1', label: "Master's plan (programmes, checklists, notes)" },
]

/** The keys above, for quick membership tests. */
const KEY_SET = new Set(BACKUP_KEYS.map((k) => k.key))

/**
 * Call `cb` whenever any user data changes — in this tab or another one.
 *
 * Every app in this bundle (tracker, planner, master's plan) writes through
 * localStorage, so patching it once here catches all of them, whichever route
 * is mounted. That is what lets the Drive backup cover the planner too: the old
 * approach watched React state in App.tsx, which is not even mounted at
 * #/planner.
 */
export function subscribeToUserData(cb: () => void): () => void {
  listeners.add(cb)
  patchStorageOnce()
  if (listeners.size === 1) window.addEventListener('storage', onStorageEvent)
  return () => {
    listeners.delete(cb)
    if (listeners.size === 0) window.removeEventListener('storage', onStorageEvent)
  }
}

const listeners = new Set<() => void>()
const fire = () => {
  for (const cb of [...listeners]) cb()
}
const onStorageEvent = (e: StorageEvent) => {
  if (e.key === null || KEY_SET.has(e.key)) fire()
}

let patched = false
function patchStorageOnce(): void {
  if (patched) return
  patched = true
  try {
    const proto = Storage.prototype
    const setItem = proto.setItem
    const removeItem = proto.removeItem
    proto.setItem = function (key: string, value: string) {
      setItem.call(this, key, value)
      if (this === localStorage && KEY_SET.has(key)) fire()
    }
    proto.removeItem = function (key: string) {
      removeItem.call(this, key)
      if (this === localStorage && KEY_SET.has(key)) fire()
    }
  } catch {
    /* storage blocked — nothing to watch */
  }
}

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
      // outreach/overrides/planner are nested containers — count their rows
      if ('programs' in o && 'faculty' in o) {
        const programs = (o.programs as unknown[]) ?? []
        const faculty = (o.faculty as unknown[]) ?? []
        return (Array.isArray(programs) ? programs.length : 0) + (Array.isArray(faculty) ? faculty.length : 0)
      }
      // the master's plan: programmes only
      if (Array.isArray(o.programs)) return o.programs.length
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
