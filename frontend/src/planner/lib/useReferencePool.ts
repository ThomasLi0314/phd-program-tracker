// Read-only access to the canonical reference database.
//
// The planner needs to search every program (not one field at a time), so it
// loads all field chunks up front — the same lazy-chunk mechanism the tracker
// uses, just with every field requested. dataLoader caches in-flight promises
// per slug, so opening the planner after browsing the tracker reuses whatever
// is already loaded instead of refetching.

import { useEffect, useMemo, useState } from 'react'
import type { Program } from '../../types'
import { fetchField, fetchIndex, type DataIndex } from '../../lib/dataLoader'

export interface ReferencePool {
  index: DataIndex | null
  programs: Program[]
  byId: Map<string, Program>
  /** True until every field chunk has settled. */
  loading: boolean
  /** Fields that failed, so the UI can say what's missing rather than lie. */
  failed: string[]
  error: string | null
}

export function useReferencePool(): ReferencePool {
  const [index, setIndex] = useState<DataIndex | null>(null)
  const [chunks, setChunks] = useState<Record<string, Program[]>>({})
  const [failed, setFailed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchIndex()
      .then(setIndex)
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!index) return
    let alive = true
    for (const f of index.fields) {
      fetchField(f.slug)
        .then((programs) => {
          if (alive) setChunks((prev) => (prev[f.primary] ? prev : { ...prev, [f.primary]: programs }))
        })
        .catch(() => {
          // One bad chunk must not take down the planner — record it and move on.
          if (alive) setFailed((prev) => (prev.includes(f.primary) ? prev : [...prev, f.primary]))
        })
    }
    return () => {
      alive = false
    }
  }, [index])

  const programs = useMemo(() => Object.values(chunks).flat(), [chunks])
  const byId = useMemo(() => new Map(programs.map((p) => [p.id, p])), [programs])

  const settled = Object.keys(chunks).length + failed.length
  const loading = !index || settled < index.fields.length

  return { index, programs, byId, loading, failed, error }
}
