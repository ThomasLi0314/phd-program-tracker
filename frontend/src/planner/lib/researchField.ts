// Helpers for ResearchField<T> — the provenance-carrying wrapper around every
// researched fact (spec §4, §18, §19).
//
// The central rule: there is no way to produce a field holding a guessed value.
// Anything not actually known stays `null`, which the UI renders as
// "Unknown / Verify" (spec §38).

import type { Confidence, FieldOrigin, ResearchField, SourceEvidence } from '../types'

/** An unchecked, unknown field. This is the default for everything. */
export function unknownField<T>(): ResearchField<T> {
  return {
    value: null,
    origin: 'manual',
    ownership: 'auto',
    confidence: 'low',
    checkedAt: null,
    sources: [],
  }
}

/** A value I typed in myself. Manual entry is authoritative over later research. */
export function manualField<T>(value: T | null, checkedAt = today()): ResearchField<T> {
  return {
    value,
    origin: 'manual',
    ownership: 'manual',
    confidence: value === null ? 'low' : 'high',
    checkedAt: value === null ? null : checkedAt,
    sources: [],
  }
}

/** A value carried over from the canonical reference dataset. */
export function databaseField<T>(
  value: T | null,
  opts: { checkedAt?: string | null; confidence?: Confidence } = {},
): ResearchField<T> {
  return {
    value,
    origin: 'database',
    ownership: 'auto',
    confidence: opts.confidence ?? (value === null ? 'low' : 'medium'),
    checkedAt: opts.checkedAt ?? null,
    sources: [],
  }
}

/** Today as an ISO date (no time — these are day-granularity facts). */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isUnknown<T>(f: ResearchField<T> | undefined): boolean {
  return !f || f.value === null
}

/** Locked fields must never be overwritten by a refresh (spec §18). */
export function isLocked<T>(f: ResearchField<T> | undefined): boolean {
  return f?.ownership === 'locked'
}

export function withOwnership<T>(f: ResearchField<T>, ownership: ResearchField<T>['ownership']): ResearchField<T> {
  return { ...f, ownership }
}

/**
 * Apply a value I typed in. A locked field STAYS locked (locking is my
 * instruction to future research, not a lock against myself), and clearing a
 * value returns it to a truthful "unknown" rather than an empty string.
 */
export function editedField<T>(cur: ResearchField<T> | undefined, value: T | null): ResearchField<T> {
  const base = cur ?? unknownField<T>()
  return {
    ...base,
    value,
    origin: 'manual',
    ownership: base.ownership === 'locked' ? 'locked' : 'manual',
    confidence: value === null ? 'low' : 'high',
    checkedAt: value === null ? null : today(),
  }
}

/** Flip the lock, creating the field if it doesn't exist yet. */
export function toggleLockField<T>(cur: ResearchField<T> | undefined): ResearchField<T> {
  const base = cur ?? unknownField<T>()
  return { ...base, ownership: base.ownership === 'locked' ? 'auto' : 'locked' }
}

/**
 * Has this field gone stale? Only a field that was actually checked can be
 * stale — a never-checked field is "unknown", which the UI already flags more
 * loudly than staleness (spec §19).
 */
export function isStale<T>(f: ResearchField<T> | undefined, staleAfterDays: number): boolean {
  if (!f || !f.checkedAt) return false
  const checked = Date.parse(f.checkedAt)
  if (Number.isNaN(checked)) return false
  return Date.now() - checked > staleAfterDays * 86_400_000
}

/** Days since the field was checked, or null if never. */
export function ageInDays<T>(f: ResearchField<T> | undefined): number | null {
  if (!f || !f.checkedAt) return null
  const checked = Date.parse(f.checkedAt)
  if (Number.isNaN(checked)) return null
  return Math.floor((Date.now() - checked) / 86_400_000)
}

/**
 * Best source for display: the most authoritative tier wins, then the most
 * recently fetched (spec §4 ranks official pages above third parties).
 */
export function bestSource<T>(f: ResearchField<T> | undefined): SourceEvidence | null {
  if (!f || f.sources.length === 0) return null
  return [...f.sources].sort(
    (a, b) => a.tier - b.tier || Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt),
  )[0]
}

/** Human label for the origin chip on a field. */
export function originLabel(origin: FieldOrigin): string {
  return origin === 'ai' ? 'AI research' : origin === 'database' ? 'Database' : 'Entered by me'
}
