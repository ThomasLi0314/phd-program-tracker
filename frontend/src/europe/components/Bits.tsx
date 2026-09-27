import type { ReactNode } from 'react'
import type { EuroField, ScholarshipLevel, Sourced } from '../types'
import { UNKNOWN_LABEL, isUnknown } from '../types'
import { NO_DATE_LABEL, formatDate } from '../../lib/deadlineFormat'
import { parseMastersDeadline } from '../plan/resolve'

/**
 * A value that came off a real page, rendered with its source one click away.
 * An unverified value is shown as "Unknown / Verify" rather than being quietly
 * blank — a gap you can see is worth more than a gap you can't.
 *
 * `compact` is for table cells: it drops the caveat text (kept on hover, and
 * shown in full in the expanded row) and mutes unknowns. Rendering every note
 * inline made rows three lines tall and gave the gaps more visual weight than
 * the facts, which is exactly backwards for a table you scan.
 */
export function Fact({
  value,
  className = '',
  compact = false,
}: {
  value: Sourced | undefined
  className?: string
  compact?: boolean
}) {
  if (isUnknown(value)) {
    return (
      <span
        className={compact ? `italic text-slate-300 ${className}` : `text-amber-600 ${className}`}
        title={compact ? UNKNOWN_LABEL : undefined}
      >
        {compact ? 'unknown' : UNKNOWN_LABEL}
      </span>
    )
  }
  const v = value!
  const body = (
    <span className={className} title={compact && v.note ? v.note : undefined}>
      {String(v.value)}
      {v.note && !compact && <span className="ml-1 text-slate-400">({v.note})</span>}
      {v.note && compact && <span className="ml-0.5 text-slate-300">*</span>}
    </span>
  )
  if (!v.source) return body
  return (
    <a
      href={v.source}
      target="_blank"
      rel="noreferrer"
      className="group/fact decoration-slate-300 underline-offset-2 hover:underline"
      title={`Source: ${v.source}`}
    >
      {body}
      <span className="ml-0.5 align-super text-[9px] text-slate-300 group-hover/fact:text-indigo-500">↗</span>
    </a>
  )
}

/**
 * A deadline off a programme page, as a date in the app's one format (see
 * lib/deadlineFormat). Programme pages write dates every way there is — "31
 * January 2027", "15 February – 31 March", "Priority 31 Dec 2026, final 30 Apr
 * 2027" — so the date you actually have to hit is parsed out and shown, with
 * the page's own sentence kept on hover and, in the expanded row, in full.
 */
export function DeadlineFact({ value, compact = false }: { value: Sourced | undefined; compact?: boolean }) {
  if (isUnknown(value)) return <Fact value={value} compact={compact} />
  const text = String(value!.value)
  const parsed = parseMastersDeadline(text)
  const dated = parsed.kind === 'dated' && parsed.iso
  const label = dated ? formatDate(parsed.iso!) : NO_DATE_LABEL[parsed.kind === 'dated' ? 'unknown' : parsed.kind]
  return (
    <span className={dated ? 'whitespace-nowrap tabular-nums' : 'italic text-amber-700'} title={text}>
      {label}
      {dated && parsed.yearInferred && (
        <span className="ml-0.5 text-[10px] not-italic text-slate-400" title="The page gives no year — the next occurrence is assumed">
          (year?)
        </span>
      )}
      {!compact && text !== label && <span className="ml-1 text-slate-400">({text})</span>}
    </span>
  )
}

const FIELD_COLOR: Record<EuroField, string> = {
  Mathematics: 'bg-violet-50 text-violet-700 ring-violet-200',
  'Applied Mathematics': 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  'Computational Science': 'bg-sky-50 text-sky-700 ring-sky-200',
  'Atmosphere & Ocean': 'bg-teal-50 text-teal-700 ring-teal-200',
  Physics: 'bg-amber-50 text-amber-700 ring-amber-200',
  'Applied Physics': 'bg-orange-50 text-orange-700 ring-orange-200',
  'Computer Science': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Engineering: 'bg-slate-100 text-slate-600 ring-slate-300',
}

const FIELD_SHORT: Record<EuroField, string> = {
  Mathematics: 'Math',
  'Applied Mathematics': 'Appl Math',
  'Computational Science': 'Comp Sci/Num',
  'Atmosphere & Ocean': 'Atmos/Ocean',
  Physics: 'Physics',
  'Applied Physics': 'Appl Phys',
  'Computer Science': 'CS',
  Engineering: 'Eng',
}

export function FieldChip({ field, short = false }: { field: EuroField; short?: boolean }) {
  return (
    <span
      className={`inline-block rounded px-1.5 py-px text-[10px] font-medium ring-1 ring-inset ${FIELD_COLOR[field]}`}
      title={field}
    >
      {short ? FIELD_SHORT[field] : field}
    </span>
  )
}

const SCHOLARSHIP: Record<ScholarshipLevel, { label: string; className: string }> = {
  full: { label: 'Full award possible', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  partial: { label: 'Partial / competitive', className: 'bg-sky-50 text-sky-700 ring-sky-200' },
  none: { label: 'None found', className: 'bg-rose-50 text-rose-600 ring-rose-200' },
  unknown: { label: 'not stated', className: 'bg-slate-50 text-slate-400 ring-slate-200' },
}

export function ScholarshipChip({ level }: { level: ScholarshipLevel }) {
  const s = SCHOLARSHIP[level]
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-1.5 py-px text-[10px] font-medium ring-1 ring-inset ${s.className}`}
      title={level === 'unknown' ? UNKNOWN_LABEL : undefined}
    >
      {s.label}
    </span>
  )
}

/** Small label above a value in the expanded detail grid. */
export function DetailCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-[12px] leading-snug text-slate-700">{children}</div>
    </div>
  )
}

/** Regional-indicator flag from an ISO 3166-1 alpha-2 code. */
export function Flag({ code }: { code: string }) {
  const cps = code
    .toUpperCase()
    .split('')
    .map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return (
    <span aria-hidden className="mr-1 select-none">
      {String.fromCodePoint(...cps)}
    </span>
  )
}
