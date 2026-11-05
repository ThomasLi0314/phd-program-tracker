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
  tones,
}: {
  value: T
  options: T[]
  labels: Record<T, string>
  onChange: (next: T) => void
  title?: string
  /** colour the closed select by its current value, like a StatusChip */
  tones?: Record<T, Tone>
}) {
  const look = tones ? TONE_CLASSES[tones[value]] : 'border-slate-300 bg-white text-slate-700'
  return (
    <select
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value as T)}
      className={`rounded border px-1.5 py-0.5 text-[11px] font-medium focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200 ${look}`}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {labels[o]}
        </option>
      ))}
    </select>
  )
}
