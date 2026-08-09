import { TONE_CLASSES, type Tone } from '../lib/labels'

/** Small status pill. Read-only display; the editable version is StatusSelect. */
export function StatusChip({
  label,
  tone = 'slate',
  title,
}: {
  label: string
  tone?: Tone
  title?: string
}) {
  return (
    <span
      title={title}
      className={`inline-block rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${TONE_CLASSES[tone]}`}
    >
      {label}
    </span>
  )
}

/** Inline dropdown for a status enum — used in both tables and detail pages. */
export function StatusSelect<T extends string>({
  value,
  options,
  labels,
  onChange,
  title,
}: {
  value: T
  options: T[]
  labels: Record<T, string>
  onChange: (next: T) => void
  title?: string
}) {
  return (
    <select
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value as T)}
      className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-medium text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </select>
  )
}
