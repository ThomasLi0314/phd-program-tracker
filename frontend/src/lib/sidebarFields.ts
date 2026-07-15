// Which discipline fields the left sidebar lists.
//
// The database spans 20 fields, and showing all of them (with their sub-fields)
// buries the handful anyone actually applies to. So the sidebar starts EMPTY and
// the user picks what they want to see. This is a view preference, not user data:
// it is deliberately NOT part of backup.ts — adding it there would make
// isLocalEmpty() false after a single click and suppress the Drive restore offer
// on a fresh browser.
import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tracker.sidebarFields.v1'

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.filter((x): x is string => typeof x === 'string'))
    return new Set()
  } catch {
    return new Set()
  }
}

function save(s: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]))
  } catch {
    // storage full/blocked — keep in-memory state
  }
}

export function useSidebarFields(): {
  shown: Set<string>
  toggle: (primary: string) => void
  show: (primary: string) => void
  hide: (primary: string) => void
  setAll: (primaries: string[]) => void
  clear: () => void
} {
  const [shown, setShown] = useState<Set<string>>(load)

  const commit = useCallback((next: Set<string>) => {
    save(next)
    setShown(next)
  }, [])

  const toggle = useCallback(
    (primary: string) =>
      setShown((prev) => {
        const next = new Set(prev)
        if (next.has(primary)) next.delete(primary)
        else next.add(primary)
        save(next)
        return next
      }),
    [],
  )

  const show = useCallback(
    (primary: string) =>
      setShown((prev) => {
        if (prev.has(primary)) return prev
        const next = new Set(prev).add(primary)
        save(next)
        return next
      }),
    [],
  )

  const hide = useCallback(
    (primary: string) =>
      setShown((prev) => {
        if (!prev.has(primary)) return prev
        const next = new Set(prev)
        next.delete(primary)
        save(next)
        return next
      }),
    [],
  )

  const setAll = useCallback((primaries: string[]) => commit(new Set(primaries)), [commit])
  const clear = useCallback(() => commit(new Set()), [commit])

  return { shown, toggle, show, hide, setAll, clear }
}
