import { useMemo, useState } from 'react'
import type { Faculty, OutreachRecord, Program, UnlinkedEmail } from '../types'
import { advisorKey } from '../lib/starredAdvisors'
import { autoMatch } from '../lib/outreach'
import { OutreachBadge } from './OutreachBadge'

interface Hit {
  faculty: Faculty
  program: Program
}

const STALE_DAYS = 14
const daysSince = (ms: number) => Math.floor((Date.now() - ms) / 86_400_000)
const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** Small searchable professor picker over the whole faculty pool. */
function ProfessorPicker({ pool, onPick }: { pool: Hit[]; onPick: (key: string) => void }) {
  const [q, setQ] = useState('')
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const results = useMemo(() => {
    if (terms.length === 0) return []
    const out: Hit[] = []
    for (const h of pool) {
      const hay = `${h.faculty.name} ${h.program.university} ${h.faculty.sub_field}`.toLowerCase()
      if (terms.every((t) => hay.includes(t))) out.push(h)
      if (out.length > 8) break
    }
    return out
  }, [pool, terms])

  return (
    <div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a professor to link…"
        className="w-full rounded border border-slate-300 px-2 py-1 text-[12px] text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
      />
      {results.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {results.map((h) => (
            <button
              key={advisorKey(h.program.id, h.faculty.id)}
              onClick={() => {
                onPick(advisorKey(h.program.id, h.faculty.id))
                setQ('')
              }}
              className="block w-full rounded px-2 py-1 text-left text-[12px] text-slate-700 transition-colors hover:bg-indigo-50"
            >
              <span className="font-medium">{h.faculty.name}</span>
              <span className="text-slate-400"> — {h.program.university}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UnlinkedRow({
  email,
  pool,
  onAssign,
  onDismiss,
}: {
  email: UnlinkedEmail
  pool: Hit[]
  onAssign: (email: UnlinkedEmail, facultyKey: string) => void
  onDismiss: (messageId: string) => void
}) {
  const suggestions = useMemo(
    () => autoMatch({ name: email.toName, email: email.toAddress }, pool),
    [email, pool],
  )
  return (
    <div className="rounded border border-slate-200 bg-white p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium text-slate-800">{email.subject}</p>
          <p className="truncate text-[11px] text-slate-500">
            to {email.toName} &lt;{email.toAddress}&gt; · {shortDate(email.sentAt)}
          </p>
        </div>
        <button
          onClick={() => onDismiss(email.messageId)}
          className="shrink-0 text-[11px] font-medium text-slate-400 hover:text-rose-600"
          title="Not outreach — hide this email"
        >
          dismiss
        </button>
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions.map((c) => (
            <button
              key={c.facultyKey}
              onClick={() => onAssign(email, c.facultyKey)}
              className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-100"
              title={`${c.program.university} — ${c.program.program_name}`}
            >
              ＋ {c.faculty.name}
              <span className="font-normal text-indigo-400"> · {c.program.university}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mt-2">
        <ProfessorPicker pool={pool} onPick={(key) => onAssign(email, key)} />
      </div>
    </div>
  )
}

type Filter = 'all' | 'awaiting' | 'replied' | 'stale'

export function OutreachView({
  pool,
  records,
  unlinked,
  connected,
  lastSync,
  scanSince,
  onSetScanSince,
  onAssign,
  onDismiss,
  onUnassign,
  onOpenProgram,
}: {
  pool: Hit[]
  records: Record<string, OutreachRecord>
  unlinked: UnlinkedEmail[]
  connected: boolean
  lastSync: number | null
  scanSince: string
  onSetScanSince: (date: string) => void
  onAssign: (email: UnlinkedEmail, facultyKey: string) => void
  onDismiss: (messageId: string) => void
  onUnassign: (facultyKey: string) => void
  onOpenProgram: (programId: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('all')

  const poolByKey = useMemo(() => {
    const m = new Map<string, Hit>()
    for (const h of pool) m.set(advisorKey(h.program.id, h.faculty.id), h)
    return m
  }, [pool])

  const recList = useMemo(() => Object.values(records), [records])
  const counts = useMemo(() => {
    let awaiting = 0,
      replied = 0,
      stale = 0
    for (const r of recList) {
      if (r.replyState === 'replied') replied++
      else {
        awaiting++
        if (daysSince(r.sentAt) >= STALE_DAYS) stale++
      }
    }
    return { awaiting, replied, stale, total: recList.length }
  }, [recList])

  const shown = useMemo(() => {
    const f = recList.filter((r) => {
      if (filter === 'replied') return r.replyState === 'replied'
      if (filter === 'awaiting') return r.replyState === 'awaiting'
      if (filter === 'stale') return r.replyState === 'awaiting' && daysSince(r.sentAt) >= STALE_DAYS
      return true
    })
    // Awaiting (most-waited first), then replied (most recent reply first).
    return f.sort((a, b) => {
      if (a.replyState !== b.replyState) return a.replyState === 'awaiting' ? -1 : 1
      if (a.replyState === 'awaiting') return a.sentAt - b.sentAt
      return (b.repliedAt ?? 0) - (a.repliedAt ?? 0)
    })
  }, [recList, filter])

  const FILTERS: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'All', n: counts.total },
    { id: 'awaiting', label: '⏳ Awaiting', n: counts.awaiting },
    { id: 'stale', label: '🔴 No reply (14d+)', n: counts.stale },
    { id: 'replied', label: '✅ Replied', n: counts.replied },
  ]

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-4xl px-5 py-4">
        <header className="mb-3">
          <h1 className="font-serif text-lg font-bold text-slate-900">Outreach Tracker</h1>
          <p className="text-[12px] text-slate-500">
            Which advisors you've emailed (套磁) and who replied — synced from your Gmail Sent
            mail (headers only, stored only in this browser). Use{' '}
            <b>✉ Connect Gmail</b> in the top bar, then <b>Sync</b>.
          </p>
          <label className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="font-medium">Only scan emails sent on/after</span>
            <input
              type="date"
              value={scanSince}
              onChange={(e) => onSetScanSince(e.target.value)}
              className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-700 focus:border-indigo-400 focus:outline-none"
            />
            <span className="text-slate-400">— then hit Sync. Widen this to pick up older mail.</span>
          </label>
        </header>

        {!connected && (
          <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-[12.5px] text-indigo-800">
            Gmail isn't connected yet. Click <b>✉ Connect Gmail</b> in the top-right to set it up
            (one-time, ~10 min), then hit <b>Sync</b> to pull your outreach.
          </div>
        )}

        {/* Unlinked emails to assign */}
        {unlinked.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              Unlinked sent emails
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                {unlinked.length}
              </span>
            </h2>
            <p className="mb-2 text-[11px] text-slate-500">
              Academic emails we couldn't confidently match. Pick the professor — we'll remember
              that address next time.
            </p>
            <div className="space-y-2">
              {unlinked.slice(0, 40).map((u) => (
                <UnlinkedRow
                  key={u.messageId}
                  email={u}
                  pool={pool}
                  onAssign={onAssign}
                  onDismiss={onDismiss}
                />
              ))}
            </div>
            {unlinked.length > 40 && (
              <p className="mt-2 text-[11px] text-slate-400">
                Showing first 40 of {unlinked.length}.
              </p>
            )}
          </section>
        )}

        {/* Tracked outreach */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                filter === f.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label} <span className="tabular-nums opacity-70">{f.n}</span>
            </button>
          ))}
          {lastSync && (
            <span className="ml-auto text-[11px] text-slate-400">
              last sync {new Date(lastSync).toLocaleString()}
            </span>
          )}
        </div>

        {recList.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No tracked outreach yet. Connect Gmail and Sync to populate this list.
          </p>
        ) : shown.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No emails match this filter.
          </p>
        ) : (
          <div className="space-y-2">
            {shown.map((r) => {
              const hit = poolByKey.get(r.facultyKey)
              return (
                <article
                  key={r.facultyKey}
                  className="rounded border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="font-serif text-[14px] font-bold text-slate-900">
                        {hit ? hit.faculty.name : r.toName}
                        <span className="ml-1.5 font-sans text-[11px] font-normal text-slate-400">
                          {hit ? hit.program.university : r.toAddress}
                        </span>
                      </h4>
                      <p className="truncate text-[11px] text-slate-500">{r.subject}</p>
                    </div>
                    <OutreachBadge record={r} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium">
                    {hit && (
                      <button
                        onClick={() => onOpenProgram(hit.program.id)}
                        className="text-indigo-600 hover:underline"
                      >
                        Open program ↗
                      </button>
                    )}
                    <span className="text-slate-400">
                      sent {shortDate(r.sentAt)}
                      {r.replyState === 'replied' && r.repliedAt
                        ? ` · replied ${shortDate(r.repliedAt)}`
                        : ` · ${daysSince(r.sentAt)}d ago`}
                    </span>
                    <button
                      onClick={() => onUnassign(r.facultyKey)}
                      className="ml-auto text-slate-400 hover:text-rose-600"
                      title="Remove this outreach record"
                    >
                      remove
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
