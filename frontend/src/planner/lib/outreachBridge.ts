// Read the tracker's Gmail-synced outreach records into the planner.
//
// OWNERSHIP (deliberate, and the reason this file is read-only):
//   • the tracker's ✉ Outreach tab owns OBSERVED evidence — what was actually
//     sent, whether a reply came back, the reply classification, and DeepSeek's
//     read of the reply body. It is synced from Gmail and must stay the single
//     writer, or a planner edit would be silently undone by the next sync.
//   • the planner owns INTENT — "Planning to Contact", "Not Contacting" — which
//     Gmail can never know.
//
// So the planner reads that store and never writes it. What the user sees is the
// two combined: whichever is further along wins, and the UI says which source it
// came from.

import { useCallback, useEffect, useState } from 'react'
import type { OutreachRecord, ReplyType } from '../../types'
import { advisorKey } from '../../lib/starredAdvisors'
import type { ContactStatus, PlannerFaculty } from '../types'

const OUTREACH_KEY = 'tracker.outreach.v1'

export interface OutreachSnapshot {
  records: Record<string, OutreachRecord>
  /** learned recipient address → facultyKey, used as a fallback match. */
  emailToFaculty: Record<string, string>
  /** DeepSeek's per-program admissions outlook, keyed by canonical programId. */
  programSummaries: Record<string, { summary: string; updatedAt: number; count: number }>
  lastSync: number | null
}

const EMPTY: OutreachSnapshot = { records: {}, emailToFaculty: {}, programSummaries: {}, lastSync: null }

/** One-shot read. The tracker is the writer; we only ever observe. */
export function readOutreach(): OutreachSnapshot {
  try {
    const raw = localStorage.getItem(OUTREACH_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw)
    return {
      records: p.records ?? {},
      emailToFaculty: p.emailToFaculty ?? {},
      programSummaries: p.programSummaries ?? {},
      lastSync: p.lastSync ?? null,
    }
  } catch {
    return EMPTY
  }
}

/**
 * Every advisorKey this planner person could be filed under in the tracker.
 *
 * `seenAs` holds the (programId, facultyId) pairs captured when they were added,
 * but the same professor often appears under several programs and the email may
 * have been linked under any of them — so callers can widen this with every
 * occurrence resolved from the reference dataset.
 */
export function keysForFaculty(entry: PlannerFaculty, extra: { programId: string; facultyId: string }[] = []): string[] {
  const pairs = entry.ref.kind === 'database' ? [...entry.ref.seenAs, ...extra] : extra
  return [...new Set(pairs.map((p) => advisorKey(p.programId, p.facultyId)))]
}

/**
 * Find this person's outreach record. Tries the advisorKeys first, then falls
 * back to the recipient address — which is how a custom (non-database) professor
 * can still match an email that was sent to them.
 */
export function findRecord(
  entry: PlannerFaculty,
  snap: OutreachSnapshot,
  extraPairs: { programId: string; facultyId: string }[] = [],
): OutreachRecord | null {
  for (const key of keysForFaculty(entry, extraPairs)) {
    const rec = snap.records[key]
    if (rec) return rec
  }
  const email = entry.email.trim().toLowerCase()
  if (email) {
    const mapped = snap.emailToFaculty[email]
    if (mapped && snap.records[mapped]) return snap.records[mapped]
    const direct = Object.values(snap.records).find((r) => r.toAddress?.toLowerCase() === email)
    if (direct) return direct
  }
  return null
}

/** How far along a status is. Terminal states share a rank with their stage. */
const PROGRESS: Record<ContactStatus, number> = {
  not_contacted: 0,
  not_contacting: 0,
  planning: 1,
  drafted: 2,
  sent: 3,
  no_response: 3,
  replied: 4,
  meeting_scheduled: 5,
}

/** Days after a send with no reply before we call it stale (matches the tracker's chip). */
const NO_REPLY_DAYS = 21

/** What the observed email evidence alone implies. */
export function observedStatus(rec: OutreachRecord): ContactStatus {
  if (rec.replyState === 'replied') return 'replied'
  const age = (Date.now() - rec.sentAt) / 86_400_000
  return age > NO_REPLY_DAYS ? 'no_response' : 'sent'
}

export interface EffectiveContact {
  status: ContactStatus
  /** where the shown status came from, so the UI never implies Gmail said something it didn't */
  source: 'gmail' | 'manual'
  record: OutreachRecord | null
}

/**
 * Combine observed evidence with my own intent.
 *
 * The further-along state wins, so recording "Planning to Contact" and then
 * actually sending the email shows as Sent without my having to update it, while
 * "Meeting Scheduled" — which Gmail cannot infer — survives a sync.
 */
export function effectiveContact(entry: PlannerFaculty, rec: OutreachRecord | null): EffectiveContact {
  const manual = entry.contact.status
  if (!rec) return { status: manual, source: 'manual', record: null }
  const observed = observedStatus(rec)
  return PROGRESS[observed] >= PROGRESS[manual]
    ? { status: observed, source: 'gmail', record: rec }
    : { status: manual, source: 'manual', record: rec }
}

/** Human summary of a reply classification, for the evidence block. */
export const REPLY_TYPE_LABEL: Record<ReplyType, string> = {
  interested: '😊 Interested',
  maybe: '🤔 Maybe / apply',
  rejected: '🙅 Rejected',
  no_funding: '💸 No funding',
  auto: '🤖 Auto-reply',
  other: '· Other',
}

export function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / 86_400_000)
}

/**
 * Live-ish view of the outreach store.
 *
 * A Gmail sync happens in the tracker — often in another tab — so re-read when
 * this tab regains focus rather than caching a snapshot from page load and
 * quietly showing stale reply status. `storage` fires for other-tab writes; the
 * focus listener covers a sync run in this same tab.
 */
export function useOutreachSnapshot(): OutreachSnapshot {
  const [snap, setSnap] = useState<OutreachSnapshot>(readOutreach)
  const refresh = useCallback(() => setSnap(readOutreach()), [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === OUTREACH_KEY) refresh()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [refresh])

  return snap
}
