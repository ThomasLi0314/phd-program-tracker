// The cold-email record for one professor, synced from Gmail by the tracker.
//
// Presented read-only and clearly attributed: this is observed evidence, not
// something the planner may edit. Editing it here would be undone by the next
// Gmail sync, so the panel links back to the tab that owns it instead.

import type { OutreachRecord } from '../../types'
import { daysSince, REPLY_TYPE_LABEL } from '../lib/outreachBridge'
import { gmailLinkFor } from '../../lib/gmailLinks'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1 last:border-0">
      <span className="shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-[12px] text-slate-800 [overflow-wrap:anywhere]">{children}</span>
    </div>
  )
}

export function OutreachEvidence({
  record,
  account,
  name,
}: {
  record: OutreachRecord
  /** the synced Gmail address, so the link opens that mailbox */
  account: string | null
  name?: string
}) {
  const replied = record.replyState === 'replied'
  const gmail = gmailLinkFor(record, account, name)
  const waiting = daysSince(record.sentAt)
  const ai = record.ai

  return (
    <section className="mt-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-sky-700">
          Cold email — synced from Gmail
        </h2>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
            replied
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : waiting > 21
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          {replied ? '✅ Replied' : waiting > 21 ? `✖ No reply (${waiting}d)` : `⏳ Awaiting ${waiting}d`}
        </span>
      </div>

      <div className="mt-1.5">
        <Row label="Sent to">{record.toAddress}</Row>
        <Row label="Subject">{record.subject || <span className="text-slate-400">—</span>}</Row>
        <Row label="Sent">{new Date(record.sentAt).toISOString().slice(0, 10)}</Row>
        {replied && record.repliedAt && (
          <Row label="Replied">{new Date(record.repliedAt).toISOString().slice(0, 10)}</Row>
        )}
        {record.replyType && <Row label="Reply type">{REPLY_TYPE_LABEL[record.replyType]}</Row>}
        {record.source === 'manual' && (
          <Row label="Source">
            <span className="text-slate-500">entered by hand (not Gmail-synced)</span>
          </Row>
        )}
        {gmail && (
          <Row label="Conversation">
            <a href={gmail.url} target="_blank" rel="noreferrer" className="font-medium text-indigo-600 hover:underline">
              {gmail.exact ? 'Open in Gmail ↗' : 'Search Gmail ↗'}
            </a>
          </Row>
        )}
      </div>

      {/* DeepSeek's structured read of the reply body, when the AI feature is on. */}
      {ai && (
        <div className="mt-2 rounded border border-slate-200 bg-white px-2.5 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            What their reply said
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
                ai.recruiting === 'yes'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : ai.recruiting === 'no'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              recruiting: {ai.recruiting}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
                ai.funding === 'yes'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : ai.funding === 'no'
                    ? 'border-rose-200 bg-rose-50 text-rose-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500'
              }`}
            >
              funding: {ai.funding}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
              tone: {ai.tone}
            </span>
            {ai.askedToApply && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10.5px] font-medium text-indigo-700">
                asked you to apply
              </span>
            )}
          </div>
          {ai.summary && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-slate-700">{ai.summary}</p>
          )}
          <p className="mt-1 text-[10px] text-slate-400">
            Read by DeepSeek from the reply body on {new Date(ai.analyzedAt).toISOString().slice(0, 10)} — a
            summary, not a quote.
          </p>
        </div>
      )}

      <p className="mt-2 text-[10.5px] leading-relaxed text-slate-500">
        This is observed evidence and is not editable here — the tracker’s{' '}
        <a href="#/" className="text-indigo-600 hover:underline">
          ✉ Outreach tab
        </a>{' '}
        owns it, and a Gmail sync would overwrite anything changed on this page. Your own contact
        intent below stays yours.
      </p>
    </section>
  )
}
