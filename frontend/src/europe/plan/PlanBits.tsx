import { daysUntil, formatDeadline, relativeDeadline, type ParsedDeadline } from '../../planner/lib/deadlines'
import type { CountryPolicy } from '../types'
import type { ChecklistItem } from './types'
import { originLabel, type Resolved } from './resolve'

export const UNKNOWN_LABEL = 'Unknown / Verify'

/** Small tag saying which layer answered: my entry, the programme page, or a country rule. */
export function OriginTag({ r, country }: { r: Resolved; country?: CountryPolicy }) {
  if (r.origin === 'none') return null
  const tone =
    r.origin === 'mine'
      ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
      : r.origin === 'country'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-slate-50 text-slate-500 ring-slate-200'
  return (
    <span className={`ml-1.5 whitespace-nowrap rounded px-1 py-px text-[9.5px] font-medium ring-1 ring-inset ${tone}`}>
      {originLabel(r, country)}
    </span>
  )
}

/**
 * The countdown half of a deadline. `settled` (submitted, withdrawn…) mutes it:
 * a date that has passed after you applied is not an alarm.
 */
export function Countdown({ parsed, settled }: { parsed: ParsedDeadline; settled: boolean }) {
  if (parsed.kind !== 'dated' || !parsed.iso) return null
  const days = daysUntil(parsed.iso)
  const tone = settled
    ? 'text-slate-400'
    : days < 0
      ? 'text-rose-600'
      : days <= 14
        ? 'font-semibold text-rose-600'
        : days <= 30
          ? 'text-amber-600'
          : 'text-slate-500'
  return (
    <span className={`text-[11px] ${tone}`}>
      {days < 0 ? `passed ${relativeDeadline(parsed.iso)}` : relativeDeadline(parsed.iso)}
    </span>
  )
}

/** Deadline for a table cell: the date, its countdown, and the page's own words on hover. */
export function DeadlineCell({ r, settled }: { r: Resolved & { parsed: ParsedDeadline }; settled: boolean }) {
  if (!r.text) return <span className="italic text-amber-700">{UNKNOWN_LABEL}</span>
  const { parsed } = r
  if (parsed.kind === 'dated' && parsed.iso) {
    return (
      <div title={r.text}>
        <div className="text-slate-700">
          {formatDeadline(parsed.iso)}
          {parsed.yearInferred && (
            <span className="ml-1 text-[10px] text-slate-400" title="The source gives no year — the next occurrence is assumed">
              (year?)
            </span>
          )}
          {r.origin === 'mine' && <span className="ml-1 text-[10px] text-indigo-500">mine</span>}
        </div>
        <Countdown parsed={parsed} settled={settled} />
      </div>
    )
  }
  return (
    <span className="line-clamp-2 text-[11.5px] text-slate-500" title={r.text}>
      {r.text}
    </span>
  )
}

export function ChecklistProgress({ items }: { items: ChecklistItem[] }) {
  if (items.length === 0) return <span className="text-[11px] text-slate-300">—</span>
  const done = items.filter((c) => c.done).length
  const pct = Math.round((done / items.length) * 100)
  return (
    <div className="w-16" title={items.filter((c) => !c.done).map((c) => c.label).join(', ') || 'All done'}>
      <div className="text-[11px] tabular-nums text-slate-600">
        {done}/{items.length}
      </div>
      <div className="mt-0.5 h-1 rounded bg-slate-100">
        <div
          className={`h-1 rounded ${done === items.length ? 'bg-emerald-500' : 'bg-indigo-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
