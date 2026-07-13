import type { OutreachRecord } from '../types'

/** Days threshold after which an un-answered email reads as "no reply yet". */
const STALE_DAYS = 14

function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
function daysSince(ms: number): number {
  return Math.floor((Date.now() - ms) / 86_400_000)
}

/** Compact outreach-status chip shown on an advisor card. Renders nothing when
 *  the professor hasn't been emailed (record undefined). */
export function OutreachBadge({ record }: { record?: OutreachRecord }) {
  if (!record) return null

  if (record.replyState === 'replied') {
    return (
      <div className="mt-2 inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        <span>✅ Replied</span>
        {record.repliedAt && <span className="text-emerald-600">· {shortDate(record.repliedAt)}</span>}
      </div>
    )
  }

  const d = daysSince(record.sentAt)
  const stale = d >= STALE_DAYS
  return (
    <div
      className={`mt-2 inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${
        stale
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}
      title={`Emailed ${shortDate(record.sentAt)} — no reply yet`}
    >
      <span>✉️ Emailed {shortDate(record.sentAt)}</span>
      <span className={stale ? 'text-rose-500' : 'text-amber-600'}>
        · {stale ? 'no reply' : '⏳ awaiting'} {d}d
      </span>
    </div>
  )
}
