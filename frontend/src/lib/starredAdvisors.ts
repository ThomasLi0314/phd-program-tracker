import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tracker.starredAdvisors.v1'

/** Number of priority tiers (P1 = low … P3 = high). */
export const MAX_PRIORITY = 3

/** Advisor star key: `${programId}/${facultyId}` — same shape as the React key
 *  used in AdvisorExplorer so a starred advisor is uniquely addressable. */
export function advisorKey(programId: string, facultyId: string): string {
  return `${programId}/${facultyId}`
}

function clampLevel(n: number): number {
  return Math.min(MAX_PRIORITY, Math.max(1, Math.round(n)))
}

function load(): Map<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Map()
    const parsed: unknown = JSON.parse(raw)
    // Legacy format: array of keys (binary stars) → migrate each to priority 1.
    if (Array.isArray(parsed)) {
      return new Map(parsed.filter((x): x is string => typeof x === 'string').map((k) => [k, 1]))
    }
    // Current format: { key: level }.
    if (parsed && typeof parsed === 'object') {
      const m = new Map<string, number>()
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const n = typeof v === 'number' ? v : Number(v)
        if (Number.isFinite(n) && n >= 1) m.set(k, clampLevel(n))
      }
      return m
    }
    return new Map()
  } catch {
    return new Map()
  }
}

/** Starred advisors with priority levels (1–MAX_PRIORITY), persisted in localStorage. */
export function useStarredAdvisors(): {
  levels: Map<string, number>
  setLevel: (key: string, level: number) => void
} {
  const [levels, setLevels] = useState<Map<string, number>>(load)

  const setLevel = useCallback((key: string, level: number) => {
    setLevels((prev) => {
      const next = new Map(prev)
      if (level <= 0) next.delete(key)
      else next.set(key, clampLevel(level))
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(next)))
      } catch {
        // storage full/blocked — keep in-memory state
      }
      return next
    })
  }, [])

  return { levels, setLevel }
}
