import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tracker.advisorNotes.v1'

/** Free-text notes on individual advisors, keyed by the same
 *  `${programId}/${facultyId}` string produced by advisorKey(). */
function load(): Map<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const m = new Map<string, string>()
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === 'string' && v.trim()) m.set(k, v)
      }
      return m
    }
    return new Map()
  } catch {
    return new Map()
  }
}

/** Per-advisor notes persisted in localStorage. Empty/whitespace text removes the note. */
export function useAdvisorNotes(): {
  notes: Map<string, string>
  setNote: (key: string, text: string) => void
} {
  const [notes, setNotes] = useState<Map<string, string>>(load)

  const setNote = useCallback((key: string, text: string) => {
    setNotes((prev) => {
      const next = new Map(prev)
      const trimmed = text.trim()
      if (trimmed) next.set(key, trimmed)
      else next.delete(key)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(next)))
      } catch {
        // storage full/blocked — keep in-memory state
      }
      return next
    })
  }, [])

  return { notes, setNote }
}
