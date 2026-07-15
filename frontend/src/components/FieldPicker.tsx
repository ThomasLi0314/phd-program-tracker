// Popover that chooses which discipline fields the sidebar lists.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldEntry } from '../lib/dataLoader'

export function FieldPicker({
  fields,
  shown,
  onToggle,
  onSetAll,
  onClear,
}: {
  fields: FieldEntry[]
  shown: Set<string>
  onToggle: (primary: string) => void
  onSetAll: (primaries: string[]) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const box = useRef<HTMLDivElement>(null)

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return fields
    return fields.filter(
      (f) =>
        f.primary.toLowerCase().includes(t) ||
        f.subs.some((s) => s.toLowerCase().includes(t)),
    )
  }, [fields, q])

  return (
    <div className="relative" ref={box}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
          open
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
            : 'border-slate-300 bg-white text-slate-600 hover:border-indigo-400 hover:text-indigo-700'
        }`}
        title="Choose which fields appear in this sidebar"
      >
        <span>
          {shown.size === 0
            ? 'Choose fields to show'
            : `${shown.size} of ${fields.length} fields shown`}
        </span>
        <span className="text-[9px] text-slate-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 rounded border border-slate-300 bg-white shadow-lg">
          <div className="border-b border-slate-200 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter fields…"
              className="w-full rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
            />
            {/* "List" is the honest verb: these add rows to the sidebar, they
                don't tick the filters — ticking 20 fields would load the whole
                database and mount ~1,378 program cards. */}
            <div className="mt-1.5 flex gap-2 text-[10px] font-medium">
              <button
                onClick={() => onSetAll(fields.map((f) => f.primary))}
                className="text-indigo-600 hover:underline"
              >
                List all
              </button>
              <button
                onClick={() => onSetAll(fields.filter((f) => f.facultyCount > 0).map((f) => f.primary))}
                className="text-indigo-600 hover:underline"
                title="Only the fields whose advisor rosters have been scanned"
              >
                With advisors
              </button>
              <button onClick={onClear} className="text-slate-400 hover:text-slate-600 hover:underline">
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-1">
            {matches.length === 0 ? (
              <p className="px-2 py-3 text-center text-[11px] text-slate-400">No field matches “{q}”.</p>
            ) : (
              matches.map((f) => (
                <label
                  key={f.slug}
                  className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] text-slate-700 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="size-3 accent-indigo-600"
                    checked={shown.has(f.primary)}
                    onChange={() => onToggle(f.primary)}
                  />
                  <span className="flex-1 truncate">{f.primary}</span>
                  {f.facultyCount > 0 && (
                    <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold tabular-nums text-amber-700">
                      {f.facultyCount}★
                    </span>
                  )}
                  <span className="text-[10px] tabular-nums text-slate-400">{f.count}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
