import { useMemo, useState } from 'react'
import type { FieldEntry } from '../lib/dataLoader'

/**
 * Type-ahead over the field index: matches primary fields and their
 * sub-fields, picking one loads that field's data chunk on demand.
 */
export function FieldSearch({
  fields,
  onPick,
  large = false,
}: {
  fields: FieldEntry[]
  onPick: (primary: string) => void
  large?: boolean
}) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return fields
      .map((f) => {
        const subHits = f.subs.filter((s) => s.toLowerCase().includes(q))
        if (!f.primary.toLowerCase().includes(q) && subHits.length === 0) return null
        return { field: f, subHits }
      })
      .filter((m): m is { field: FieldEntry; subHits: string[] } => m !== null)
      .slice(0, 8)
  }, [query, fields])

  const pick = (primary: string) => {
    onPick(primary)
    setQuery('')
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches.length > 0) {
            e.preventDefault()
            pick(matches[0].field.primary)
          }
          if (e.key === 'Escape') setQuery('')
        }}
        placeholder="Type a field, e.g. Statistics, Ocean, Robotics…"
        autoFocus={large}
        className={`w-full rounded border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
          large ? 'px-3.5 py-2.5 text-[15px]' : 'px-2.5 py-1.5 text-xs'
        }`}
      />
      {focused && matches.length > 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded border border-slate-200 bg-white shadow-lg">
          {matches.map(({ field, subHits }) => (
            <button
              key={field.slug}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(field.primary)}
              className="block w-full px-3 py-1.5 text-left hover:bg-indigo-50"
            >
              <span className={`font-medium text-slate-900 ${large ? 'text-sm' : 'text-xs'}`}>
                {field.primary}
              </span>
              <span className="ml-1.5 text-[10px] tabular-nums text-slate-400">
                {field.count} programs
              </span>
              {subHits.length > 0 && (
                <span className="block truncate text-[10px] text-slate-500">
                  matches: {subHits.slice(0, 3).join(', ')}
                  {subHits.length > 3 ? '…' : ''}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {focused && query.trim() !== '' && matches.length === 0 && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-lg">
          No field matches "{query.trim()}" — try the "+ Request a field" button.
        </div>
      )}
    </div>
  )
}
