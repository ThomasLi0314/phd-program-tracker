// Renders one researched fact with its provenance (spec §4).
//
// The point of this component is that an admissions fact must never look like
// unquestioned truth. Every value shows where it came from, when it was
// checked, and how confident that is — and an absent value renders as an
// explicit "Unknown / Verify" rather than a blank that reads as "no
// requirement".

import { useState } from 'react'
import type { ResearchField } from '../types'
import { ageInDays, bestSource, isStale, originLabel } from '../lib/researchField'
import { UNKNOWN_LABEL } from '../lib/labels'

const CONFIDENCE_TONE: Record<string, string> = {
  high: 'text-emerald-600',
  medium: 'text-amber-600',
  low: 'text-slate-400',
}

export function FieldRow<T>({
  label,
  field,
  display,
  options,
  onSetValue,
  onToggleLock,
  staleAfterDays,
}: {
  label: string
  field: ResearchField<T> | undefined
  /** Formatted value, or null when unknown. */
  display: string | null
  /** When given, the editor is a dropdown of [rawValue, label] pairs. */
  options?: { value: string; label: string }[]
  /** Raw editor text; '' means "back to Unknown". Caller parses into T. */
  onSetValue: (raw: string) => void
  onToggleLock: () => void
  staleAfterDays: number
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const locked = field?.ownership === 'locked'
  const stale = isStale(field, staleAfterDays)
  const source = bestSource(field)
  const age = ageInDays(field)

  const begin = () => {
    setDraft(display ?? '')
    setEditing(true)
  }
  const commit = () => {
    onSetValue(draft)
    setEditing(false)
  }

  return (
    <div className="border-b border-slate-100 py-1.5 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-[11px] font-medium text-slate-500">{label}</span>

        <div className="flex min-w-0 flex-1 items-baseline justify-end gap-2">
          {editing ? (
            options ? (
              <select
                autoFocus
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  onSetValue(e.target.value)
                  setEditing(false)
                }}
                onBlur={() => setEditing(false)}
                className="rounded border border-indigo-300 px-1.5 py-0.5 text-[12px] text-slate-800 focus:outline-none"
              >
                <option value="">{UNKNOWN_LABEL}</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit()
                  if (e.key === 'Escape') setEditing(false)
                }}
                placeholder={UNKNOWN_LABEL}
                className="w-full rounded border border-indigo-300 px-1.5 py-0.5 text-right text-[12px] text-slate-800 focus:outline-none"
              />
            )
          ) : (
            <button
              onClick={begin}
              title="Click to edit. Editing marks this field as entered by me."
              className={`truncate text-right text-[12.5px] hover:underline ${
                display ? 'font-medium text-slate-800' : 'italic text-amber-700'
              }`}
            >
              {display ?? UNKNOWN_LABEL}
            </button>
          )}

          <button
            onClick={onToggleLock}
            title={
              locked
                ? 'Locked — future research runs will report a disagreement instead of overwriting this.'
                : 'Lock this value so future research cannot overwrite it.'
            }
            className={`shrink-0 text-[11px] leading-none ${
              locked ? 'text-indigo-600' : 'text-slate-300 hover:text-slate-500'
            }`}
          >
            {locked ? '🔒' : '🔓'}
          </button>
        </div>
      </div>

      {/* Provenance line — only meaningful once something has actually been checked. */}
      {field && (field.checkedAt || source) && (
        <div className="mt-0.5 flex flex-wrap items-center justify-end gap-x-2 text-[10px] text-slate-400">
          <span>{originLabel(field.origin)}</span>
          {source && (
            <>
              <span>·</span>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                title={source.snippet || source.title}
                className="text-indigo-500 hover:underline [overflow-wrap:anywhere]"
              >
                {source.title || 'source'} ↗
              </a>
            </>
          )}
          {field.checkedAt && (
            <>
              <span>·</span>
              <span className={stale ? 'font-medium text-amber-600' : ''}>
                checked {field.checkedAt}
                {stale && age !== null ? ` (${age}d — stale)` : ''}
              </span>
            </>
          )}
          <span>·</span>
          <span className={CONFIDENCE_TONE[field.confidence]}>{field.confidence}</span>
        </div>
      )}

      {/* Contradictory sources are surfaced, never silently resolved (spec §38). */}
      {field?.conflicts?.length ? (
        <div className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[10.5px] text-amber-800">
          {field.conflicts.length} conflicting source
          {field.conflicts.length === 1 ? '' : 's'} recorded — review before relying on this.
        </div>
      ) : null}
    </div>
  )
}
