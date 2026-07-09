import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tracker.starredAdvisors.v1'

/** Advisor star key: `${programId}/${facultyId}` — same shape as the React key
 *  used in AdvisorExplorer so a starred advisor is uniquely addressable. */
export function advisorKey(programId: string, facultyId: string): string {
  return `${programId}/${facultyId}`
}

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** Personal starred-advisors set, persisted in localStorage. */
export function useStarredAdvisors(): {
  starred: Set<string>
  toggle: (key: string) => void
} {
  const [starred, setStarred] = useState<Set<string>>(load)

  const toggle = useCallback((key: string) => {
    setStarred((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // storage full/blocked — keep in-memory state
      }
      return next
    })
  }, [])

  return { starred, toggle }
}
