import { useCallback, useState } from 'react'
import type { Faculty, OutreachRecord, Program, ReplyType, UnlinkedEmail } from '../types'
import { advisorKey } from './starredAdvisors'
import { UNIVERSITY_DOMAINS, domainMatchesUniversity } from './universityDomains'
import { getMessageMeta, getProfile, getThreadFull, getThreadMeta, listSent } from './gmail'
import { aiActive, analyzeReply, summarizeProgram } from './deepseek'

const STORAGE_KEY = 'tracker.outreach.v1'

/** Default: only scan Sent mail from June 2026 on (when cold-emailing started).
 *  User-adjustable via setScanSince. Format YYYY-MM-DD. */
export const DEFAULT_SCAN_SINCE = '2026-06-01'

/** Reply classifications the user can tag (Gmail bodies are never read). `tone`
 *  drives chip colors in the UI. */
export const REPLY_TYPES: { id: ReplyType; label: string; short: string; tone: string }[] = [
  { id: 'interested', label: '😊 Interested', short: 'Interested', tone: 'emerald' },
  { id: 'maybe', label: '🤔 Maybe / apply', short: 'Maybe', tone: 'amber' },
  { id: 'rejected', label: '🙅 Rejected', short: 'Rejected', tone: 'rose' },
  { id: 'no_funding', label: '💸 No funding', short: 'No funding', tone: 'orange' },
  { id: 'auto', label: '🤖 Auto-reply', short: 'Auto-reply', tone: 'slate' },
  { id: 'other', label: '· Other', short: 'Other', tone: 'slate' },
]

export const REPLY_TYPE_BY_ID: Record<ReplyType, (typeof REPLY_TYPES)[number]> = Object.fromEntries(
  REPLY_TYPES.map((t) => [t.id, t]),
) as Record<ReplyType, (typeof REPLY_TYPES)[number]>

export interface OutreachState {
  /** learned address book: recipient email → facultyKey. The source of truth. */
  emailToFaculty: Record<string, string>
  /** one record per professor (facultyKey), latest thread. */
  records: Record<string, OutreachRecord>
  /** academic sent emails not linked to a professor yet. */
  unlinked: UnlinkedEmail[]
  /** messageIds the user marked "not outreach", or non-academic ones we skip. */
  skipped: string[]
  /** only scan Sent mail on/after this date (YYYY-MM-DD). */
  scanSince: string
  /** DeepSeek per-program admissions summary, keyed by programId. */
  programSummaries: Record<string, { summary: string; updatedAt: number; count: number }>
  selfEmail: string | null
  lastSync: number | null
}

const EMPTY: OutreachState = {
  emailToFaculty: {},
  records: {},
  unlinked: [],
  skipped: [],
  scanSince: DEFAULT_SCAN_SINCE,
  programSummaries: {},
  selfEmail: null,
  lastSync: null,
}

function load(): OutreachState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const p = JSON.parse(raw)
    return {
      emailToFaculty: p.emailToFaculty ?? {},
      records: p.records ?? {},
      unlinked: p.unlinked ?? [],
      skipped: p.skipped ?? [],
      scanSince: p.scanSince ?? DEFAULT_SCAN_SINCE,
      programSummaries: p.programSummaries ?? {},
      selfEmail: p.selfEmail ?? null,
      lastSync: p.lastSync ?? null,
    }
  } catch {
    return EMPTY
  }
}

// ---- pure helpers (no Gmail/React deps — unit-testable) ----

/** Parse one address header value like `"Jane Doe" <jd@x.edu>` → {name,email}. */
export function parseAddress(value: string): { name: string; email: string } {
  const m = value.match(/<([^>]+)>/)
  const email = (m ? m[1] : value).trim().toLowerCase()
  let name = m ? value.slice(0, m.index).trim() : ''
  name = name.replace(/^"|"$/g, '').trim()
  if (!name) name = email.split('@')[0]
  return { name, email }
}

/** Split a To/Cc header into individual addresses (commas outside quotes). */
export function splitAddresses(header: string): { name: string; email: string }[] {
  if (!header) return []
  const parts: string[] = []
  let buf = ''
  let inQuote = false
  for (const ch of header) {
    if (ch === '"') inQuote = !inQuote
    if (ch === ',' && !inQuote) {
      parts.push(buf)
      buf = ''
    } else buf += ch
  }
  if (buf.trim()) parts.push(buf)
  return parts.map((p) => parseAddress(p)).filter((a) => a.email.includes('@'))
}

function domainOf(email: string): string {
  return email.split('@')[1] ?? ''
}

/** Is this recipient at any university we know a domain for? */
export function isAcademicRecipient(email: string): boolean {
  const d = domainOf(email)
  return Object.keys(UNIVERSITY_DOMAINS).some((u) => domainMatchesUniversity(d, u))
}

function normTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean)
}

export interface MatchCandidate {
  facultyKey: string
  faculty: Faculty
  program: Program
  score: number
}

/** Rank professors that a sent email likely went to, by domain + name overlap.
 *  Returns best-first; empty if the recipient's domain matches no known school. */
export function autoMatch(
  recipient: { name: string; email: string },
  pool: { faculty: Faculty; program: Program }[],
): MatchCandidate[] {
  const domain = domainOf(recipient.email)
  const local = recipient.email.split('@')[0]
  const recTokens = new Set([...normTokens(recipient.name), ...normTokens(local)])
  const out: MatchCandidate[] = []
  for (const { faculty, program } of pool) {
    if (!domainMatchesUniversity(domain, program.university)) continue
    const ft = normTokens(faculty.name)
    if (ft.length === 0) continue
    const last = ft[ft.length - 1]
    const first = ft[0]
    let score = 0
    if (recTokens.has(last)) score += 3
    if (recTokens.has(first)) score += 1
    // first-initial in the local part (e.g. "jdoe" → j + doe)
    if (local.toLowerCase().startsWith(first[0]) && local.toLowerCase().includes(last)) score += 2
    if (score > 0) out.push({ facultyKey: advisorKey(program.id, faculty.id), faculty, program, score })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6)
}

/** Reply detected iff the thread has an inbound message (from ≠ self) after sending. */
export function deriveReplyState(
  thread: { from: string; date: number }[],
  selfEmail: string,
  sentAt: number,
): { replied: boolean; repliedAt: number | null } {
  const self = selfEmail.toLowerCase()
  let repliedAt: number | null = null
  for (const m of thread) {
    const from = parseAddress(m.from).email
    // A reply is any inbound message strictly after we first reached out.
    if (from && from !== self && m.date > sentAt) {
      repliedAt = repliedAt === null ? m.date : Math.min(repliedAt, m.date)
    }
  }
  return { replied: repliedAt !== null, repliedAt }
}

/** Build the domain-filtered Sent query so a sync only fetches academic mail
 *  sent on/after `since` (YYYY-MM-DD). */
function sentQuery(since: string): string {
  const roots = new Set<string>()
  for (const list of Object.values(UNIVERSITY_DOMAINS)) {
    for (const r of list) {
      if (r.endsWith('.edu')) roots.add('.edu')
      else if (r.endsWith('.ac.uk')) roots.add('.ac.uk')
      else roots.add(r)
    }
  }
  const clause = [...roots].map((r) => `to:${r}`).join(' OR ')
  const dateClause = since ? `after:${since.replace(/-/g, '/')} ` : ''
  return `in:sent ${dateClause}(${clause})`
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export interface SyncProgress {
  phase: 'sent' | 'messages' | 'replies' | 'ai' | 'summary' | 'done'
  done: number
  total: number
}

// ---- the hook ----

export function useOutreach() {
  const [state, setState] = useState<OutreachState>(load)

  const persist = useCallback((updater: (s: OutreachState) => OutreachState) => {
    setState((prev) => {
      const next = updater(prev)
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  /** Link an academic email (from the unlinked queue) to a professor and remember it. */
  const assign = useCallback(
    (email: UnlinkedEmail, facultyKey: string) => {
      persist((s) => {
        const record: OutreachRecord = {
          facultyKey,
          threadId: email.threadId,
          messageId: email.messageId,
          toAddress: email.toAddress,
          toName: email.toName,
          subject: email.subject,
          sentAt: email.sentAt,
          replyState: 'awaiting',
          repliedAt: null,
          lastSyncedAt: Date.now(),
          source: 'gmail',
        }
        return {
          ...s,
          emailToFaculty: { ...s.emailToFaculty, [email.toAddress]: facultyKey },
          records: { ...s.records, [facultyKey]: record },
          unlinked: s.unlinked.filter((u) => u.messageId !== email.messageId),
        }
      })
    },
    [persist],
  )

  /** Manually add an outreach record (not from Gmail) for a professor. */
  const addManual = useCallback(
    (
      facultyKey: string,
      input: { sentAt: number; subject?: string; toName?: string; replied?: boolean; replyType?: ReplyType },
    ) => {
      persist((s) => {
        const record: OutreachRecord = {
          facultyKey,
          threadId: '',
          messageId: `manual-${facultyKey}-${input.sentAt}`,
          toAddress: '',
          toName: input.toName ?? '',
          subject: input.subject || '(manually added)',
          sentAt: input.sentAt,
          replyState: input.replied ? 'replied' : 'awaiting',
          repliedAt: input.replied ? input.sentAt : null,
          lastSyncedAt: Date.now(),
          replyType: input.replyType,
          source: 'manual',
        }
        return { ...s, records: { ...s.records, [facultyKey]: record } }
      })
    },
    [persist],
  )

  /** Tag how a professor replied (or clear the tag with undefined). */
  const setReplyType = useCallback(
    (facultyKey: string, replyType: ReplyType | undefined) => {
      persist((s) => {
        const rec = s.records[facultyKey]
        if (!rec) return s
        return { ...s, records: { ...s.records, [facultyKey]: { ...rec, replyType } } }
      })
    },
    [persist],
  )

  /** Remove a professor's outreach record and forget its address mapping. */
  const unassign = useCallback(
    (facultyKey: string) => {
      persist((s) => {
        const rec = s.records[facultyKey]
        const records = { ...s.records }
        delete records[facultyKey]
        const emailToFaculty = { ...s.emailToFaculty }
        if (rec) delete emailToFaculty[rec.toAddress]
        return { ...s, records, emailToFaculty }
      })
    },
    [persist],
  )

  /** Mark an unlinked email as "not outreach" so it stops showing up. */
  const dismiss = useCallback(
    (messageId: string) => {
      persist((s) => ({
        ...s,
        unlinked: s.unlinked.filter((u) => u.messageId !== messageId),
        skipped: s.skipped.includes(messageId) ? s.skipped : [...s.skipped, messageId],
      }))
    },
    [persist],
  )

  const reset = useCallback(() => {
    persist(() => EMPTY)
  }, [persist])

  /** Change the earliest Sent-mail date to scan (YYYY-MM-DD). */
  const setScanSince = useCallback(
    (date: string) => {
      persist((s) => ({ ...s, scanSince: date || DEFAULT_SCAN_SINCE }))
    },
    [persist],
  )

  /** Full sync against Gmail. Requires the caller to have ensured a valid token.
   *  Classifies new academic Sent mail via the learned address book; unmatched
   *  emails land in the unlinked queue (the UI suggests professors for them).
   *  When DeepSeek is enabled, reads reply bodies and summarizes per program.
   *  `pool` is every {faculty, program} in the database (for AI context). */
  const sync = useCallback(
    async (
      pool: { faculty: Faculty; program: Program }[],
      onProgress?: (p: SyncProgress) => void,
    ) => {
      const profile = await getProfile()
      const selfEmail = profile.emailAddress.toLowerCase()

      // Snapshot current state to decide what's new (state updates are batched).
      const snap = load()

      onProgress?.({ phase: 'sent', done: 0, total: 0 })
      const sent = await listSent(sentQuery(snap.scanSince))
      const known = new Set<string>([
        ...Object.values(snap.records).map((r) => r.messageId),
        ...snap.unlinked.map((u) => u.messageId),
        ...snap.skipped,
      ])
      const fresh = sent.filter((m) => !known.has(m.id))

      onProgress?.({ phase: 'messages', done: 0, total: fresh.length })
      let done = 0
      const metas = await mapLimit(fresh, 5, async (m) => {
        try {
          const meta = await getMessageMeta(m.id)
          return meta
        } catch {
          return null
        } finally {
          onProgress?.({ phase: 'messages', done: ++done, total: fresh.length })
        }
      })

      // Classify each new academic sent email.
      const newUnlinked: UnlinkedEmail[] = []
      const newSkipped: string[] = []
      const linkHits: { facultyKey: string; email: UnlinkedEmail }[] = []
      for (const meta of metas) {
        if (!meta) continue
        const recips = [
          ...splitAddresses(meta.headers['to'] ?? ''),
          ...splitAddresses(meta.headers['cc'] ?? ''),
        ]
        const acad = recips.find((r) => isAcademicRecipient(r.email))
        if (!acad) {
          newSkipped.push(meta.id)
          continue
        }
        const email: UnlinkedEmail = {
          messageId: meta.id,
          threadId: meta.threadId,
          toAddress: acad.email,
          toName: acad.name,
          subject: meta.headers['subject'] ?? '(no subject)',
          sentAt: meta.sentAt,
        }
        const mappedKey = snap.emailToFaculty[acad.email]
        if (mappedKey) linkHits.push({ facultyKey: mappedKey, email })
        else newUnlinked.push(email)
      }

      // One record per professor: keep the EARLIEST first-contact this sync as
      // the reply baseline (so a later follow-up email can't hide an earlier reply).
      const earliestNew = new Map<string, UnlinkedEmail>()
      for (const h of linkHits) {
        const cur = earliestNew.get(h.facultyKey)
        if (!cur || h.email.sentAt < cur.sentAt) earliestNew.set(h.facultyKey, h.email)
      }

      // Threads to (re)check for a reply: existing awaiting records + every
      // professor newly linked this sync, each at its earliest first-contact.
      const toCheck = new Map<string, { threadId: string; sentAt: number }>()
      for (const r of Object.values(snap.records)) {
        // Manual records have no Gmail thread to poll — the user manages them.
        if (r.replyState === 'awaiting' && r.source !== 'manual' && r.threadId)
          toCheck.set(r.facultyKey, { threadId: r.threadId, sentAt: r.sentAt })
      }
      for (const [key, email] of earliestNew) {
        const prev = snap.records[key]
        if (!prev || email.sentAt < prev.sentAt)
          toCheck.set(key, { threadId: email.threadId, sentAt: email.sentAt })
        else toCheck.set(key, { threadId: prev.threadId, sentAt: prev.sentAt })
      }

      const checkEntries = [...toCheck.entries()]
      onProgress?.({ phase: 'replies', done: 0, total: checkEntries.length })
      let rdone = 0
      const replyResults = await mapLimit(checkEntries, 5, async ([facultyKey, c]) => {
        try {
          const thread = await getThreadMeta(c.threadId)
          return { facultyKey, ...deriveReplyState(thread, selfEmail, c.sentAt) }
        } catch {
          return { facultyKey, replied: false, repliedAt: null }
        } finally {
          onProgress?.({ phase: 'replies', done: ++rdone, total: checkEntries.length })
        }
      })
      const replyByKey = new Map(replyResults.map((r) => [r.facultyKey, r]))

      // Build the next records/unlinked from the snapshot (this sync is the writer).
      const now = Date.now()
      const records: Record<string, OutreachRecord> = { ...snap.records }
      // Create records / rebase to the earliest first-contact per professor.
      for (const [key, email] of earliestNew) {
        const prev = records[key]
        if (!prev) {
          records[key] = {
            facultyKey: key,
            threadId: email.threadId,
            messageId: email.messageId,
            toAddress: email.toAddress,
            toName: email.toName,
            subject: email.subject,
            sentAt: email.sentAt,
            replyState: 'awaiting',
            repliedAt: null,
            lastSyncedAt: now,
            source: 'gmail',
          }
        } else if (email.sentAt < prev.sentAt) {
          records[key] = {
            ...prev,
            threadId: email.threadId,
            messageId: email.messageId,
            toAddress: email.toAddress,
            toName: email.toName,
            subject: email.subject,
            sentAt: email.sentAt,
            lastSyncedAt: now,
          }
        }
      }
      // Apply reply detection.
      for (const [key, r] of replyByKey) {
        const rec = records[key]
        if (rec)
          records[key] = {
            ...rec,
            replyState: r.replied ? 'replied' : 'awaiting',
            repliedAt: r.repliedAt,
            lastSyncedAt: now,
          }
      }
      // Merge the unlinked queue (dedupe by messageId).
      const seenU = new Set(snap.unlinked.map((u) => u.messageId))
      const unlinked = [...snap.unlinked]
      for (const u of newUnlinked) if (!seenU.has(u.messageId)) unlinked.push(u)
      unlinked.sort((a, b) => b.sentAt - a.sentAt)

      // AI phase (opt-in): read reply bodies with DeepSeek + summarize per program.
      let programSummaries = snap.programSummaries
      if (aiActive()) {
        const ctxByKey = new Map(pool.map((h) => [advisorKey(h.program.id, h.faculty.id), h]))

        // Analyze replied records that have a thread and no analysis yet.
        const need = Object.values(records).filter(
          (r) => r.replyState === 'replied' && r.source !== 'manual' && r.threadId && !r.ai,
        )
        onProgress?.({ phase: 'ai', done: 0, total: need.length })
        let adone = 0
        await mapLimit(need, 3, async (r) => {
          try {
            const hit = ctxByKey.get(r.facultyKey)
            const msgs = await getThreadFull(r.threadId)
            const body = msgs
              .filter((m) => {
                const e = parseAddress(m.from).email
                return e && e !== selfEmail
              })
              .map((m) => m.body)
              .join('\n\n---\n\n')
              .slice(0, 8000)
            if (body.trim()) {
              const ai = await analyzeReply(body, {
                prof: hit?.faculty.name ?? r.toName,
                university: hit?.program.university ?? '',
                program: hit?.program.program_name ?? '',
              })
              records[r.facultyKey] = { ...records[r.facultyKey], ai }
            }
          } catch {
            /* skip this reply */
          } finally {
            onProgress?.({ phase: 'ai', done: ++adone, total: need.length })
          }
        })

        // Regenerate a per-program admissions summary from analyzed replies.
        const byProgram = new Map<
          string,
          {
            university: string
            program: string
            replies: { prof: string; recruiting: string; funding: string; summary: string }[]
          }
        >()
        for (const r of Object.values(records)) {
          if (r.replyState !== 'replied' || !r.ai) continue
          const programId = r.facultyKey.split('/')[0]
          const hit = ctxByKey.get(r.facultyKey)
          let g = byProgram.get(programId)
          if (!g) {
            g = {
              university: hit?.program.university ?? '',
              program: hit?.program.program_name ?? programId,
              replies: [],
            }
            byProgram.set(programId, g)
          }
          g.replies.push({
            prof: hit?.faculty.name ?? r.toName,
            recruiting: r.ai.recruiting,
            funding: r.ai.funding,
            summary: r.ai.summary,
          })
        }
        const progEntries = [...byProgram.entries()]
        onProgress?.({ phase: 'summary', done: 0, total: progEntries.length })
        let sdone = 0
        const summaries: Record<string, { summary: string; updatedAt: number; count: number }> = {}
        await mapLimit(progEntries, 2, async ([programId, g]) => {
          try {
            const summary = await summarizeProgram(g.university, g.program, g.replies)
            summaries[programId] = { summary, updatedAt: now, count: g.replies.length }
          } catch {
            const prev = snap.programSummaries[programId]
            if (prev) summaries[programId] = prev
          } finally {
            onProgress?.({ phase: 'summary', done: ++sdone, total: progEntries.length })
          }
        })
        programSummaries = summaries
      }

      persist(() => ({
        ...snap,
        selfEmail,
        records,
        unlinked,
        skipped: [...snap.skipped, ...newSkipped],
        programSummaries,
        lastSync: now,
      }))

      return { newLinked: earliestNew.size, newUnlinked: newUnlinked.length }
    },
    [persist],
  )

  return { state, assign, addManual, setReplyType, unassign, dismiss, reset, setScanSince, sync }
}
