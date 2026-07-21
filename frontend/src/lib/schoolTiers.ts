import { useCallback, useState } from 'react'

const STORAGE_KEY = 'tracker.schoolTiers.v1'

/** Tier labels the user assigns to a school, best (T1) to lowest (T5). A school
 *  with no entry is UNRANKED and sorts after every assigned tier. Tiers are the
 *  user's own judgement — we never seed or guess them (there is no ranking in
 *  the dataset), so a fresh install starts fully unranked. */
export const TIERS = ['T1', 'T2', 'T3', 'T4', 'T5'] as const
export type Tier = (typeof TIERS)[number]

/** Map of university name → tier label. */
export type TierMap = Record<string, string>

function load(): TierMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: TierMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && (TIERS as readonly string[]).includes(v)) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Per-school tier assignments, persisted in localStorage (keyed by university
 *  name, which is stable across the dataset). */
export function useSchoolTiers(): {
  tiers: TierMap
  setTier: (university: string, tier: string) => void
} {
  const [tiers, setTiers] = useState<TierMap>(load)

  const setTier = useCallback((university: string, tier: string) => {
    setTiers((prev) => {
      const next = { ...prev }
      if (!tier) delete next[university] // empty string = clear back to unranked
      else next[university] = tier
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // storage full/blocked — keep in-memory state
      }
      return next
    })
  }, [])

  return { tiers, setTier }
}

/** Sort rank for a tier: T1 = 0 … T5 = 4, unranked = 99 (sorts last). */
export function tierRank(tier: string | undefined): number {
  if (!tier) return 99
  const i = (TIERS as readonly string[]).indexOf(tier)
  return i === -1 ? 99 : i
}
