// Where a university sits in a published subject ranking.
//
// One ranking per field, chosen and recorded by the research pass in
// scripts/build-rankings.mjs. The number is the position among US institutions
// in that ranking. A university the ranking does not list is absent, and the
// app says "unranked" — we never interpolate a position.
//
// These are other people's rankings, so every figure carries its source name,
// edition and link, and the app shows them.

import { useCallback, useEffect, useState } from 'react'

export interface RankingSource {
  name: string
  edition: string
  url: string
  /** e.g. "US graduate programs" or "world ranking, filtered to US" */
  scope: string
  note: string
}

export interface Position {
  /** position among US institutions in this ranking */
  rank: number
  /** the published world position, when the source is a world ranking */
  world_rank: number | null
  /** the label the source printed, e.g. "51-75" for a banded entry */
  as_printed: string | null
}

interface RankingsFile {
  meta: { generated_at: string; note: string }
  aliases: Record<string, string>
  fields: Record<string, { source: RankingSource; checked_at: string | null; ranks: Record<string, Position> }>
}

export interface RankingHit extends Position {
  source: RankingSource
  field: string
}

const BASE = import.meta.env.BASE_URL
let cached: Promise<RankingsFile> | null = null

function fetchRankings(): Promise<RankingsFile> {
  if (!cached) {
    cached = fetch(`${BASE}data/rankings.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`rankings.json: HTTP ${r.status}`)
        return r.json() as Promise<RankingsFile>
      })
      .catch((e) => {
        cached = null
        throw e
      })
  }
  return cached
}

export type RankLookup = (
  field: string | undefined,
  university: string | undefined,
) => { hit: RankingHit | null; why: 'ok' | 'no-ranking-for-field' | 'unranked' | 'loading' }

/** Subject-ranking lookup by (field, university). One fetch per session. */
export function useRankings(): { rankFor: RankLookup; generatedAt: string | null } {
  const [file, setFile] = useState<RankingsFile | null>(null)
  useEffect(() => {
    let alive = true
    fetchRankings()
      .then((f) => alive && setFile(f))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const rankFor = useCallback<RankLookup>(
    (field, university) => {
      if (!file) return { hit: null, why: 'loading' }
      if (!field || !university) return { hit: null, why: 'unranked' }
      const entry = file.fields[field]
      if (!entry || Object.keys(entry.ranks).length === 0) return { hit: null, why: 'no-ranking-for-field' }
      const uni = file.aliases[university] ?? university
      const pos = entry.ranks[uni]
      if (!pos) return { hit: null, why: 'unranked' }
      return { hit: { ...pos, source: entry.source, field }, why: 'ok' }
    },
    [file],
  )

  return { rankFor, generatedAt: file?.meta.generated_at ?? null }
}

/**
 * True when the source did not publish this university at a position of its
 * own: either a band ("51-75") or a tie ("=4"). Order among such entries is
 * the source's listing order, not a difference in standing.
 */
export function isApproximate(hit: RankingHit): 'band' | 'tie' | null {
  if (!hit.as_printed) return null
  if (/[-–]/.test(hit.as_printed)) return 'band'
  if (/^s*=/.test(hit.as_printed)) return 'tie'
  return null
}

/** What the number means, in full, for the cell's tooltip. */
export function rankTooltip(hit: RankingHit): string {
  const world =
    hit.world_rank != null
      ? ` · world #${hit.world_rank}${hit.as_printed && hit.as_printed !== String(hit.world_rank) ? ` (published as ${hit.as_printed})` : ''}`
      : ''
  const kind = isApproximate(hit)
  const banded =
    kind === 'band'
      ? ' — the source publishes a band here and lists the universities in it in its own order, so the position within the band is not a difference in standing'
      : kind === 'tie'
        ? ' — the source publishes this as a tie, so the order among the tied universities is not a difference in standing'
        : ''
  return `#${hit.rank} among US universities in ${hit.source.name}${hit.source.edition ? ` ${hit.source.edition}` : ''}${world}${banded}`
}
