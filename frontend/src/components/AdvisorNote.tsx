import { useEffect, useState } from 'react'

/** Inline note editor shown on every advisor card. Displays the saved note when
 *  present; click to edit. Empty text clears the note. Self-contained editing
 *  state so it can be dropped into any card renderer. */
export function AdvisorNote({
  note,
  onSave,
}: {
  note: string
  onSave: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)

  // Re-sync the draft when the stored note changes while not editing (the same
  // card component instance is reused for different advisors in a virtual list).
  useEffect(() => {
    if (!editing) setDraft(note)
  }, [note, editing])

  const save = () => {
    onSave(draft)
    setEditing(false)
  }
  const cancel = () => {
    setDraft(note)
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="mt-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          rows={3}
          placeholder="Your private note about this advisor — fit, emails, papers to read…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
            else if (e.key === 'Escape') cancel()
          }}
          className="w-full resize-y rounded border border-amber-300 bg-amber-50/40 px-2 py-1.5 text-[12px] leading-relaxed text-slate-700 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-200"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={save}
            className="rounded bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-amber-600"
          >
            Save
          </button>
          <button
            onClick={cancel}
            className="text-[11px] font-medium text-slate-400 transition-colors hover:text-slate-600"
          >
            Cancel
          </button>
          <span className="ml-auto hidden text-[10px] text-slate-400 sm:inline">
            ⌘/Ctrl+Enter · Esc
          </span>
        </div>
      </div>
    )
  }

  if (note) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-2 flex w-full items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-left transition-colors hover:border-amber-300 hover:bg-amber-100/70"
        title="Click to edit your note"
      >
        <span className="mt-px shrink-0 text-[11px] leading-none">📝</span>
        <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] text-[12px] leading-relaxed text-amber-900">
          {note}
        </span>
      </button>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="mt-2 text-[11px] font-medium text-slate-400 transition-colors hover:text-amber-600"
    >
      ＋ Add note
    </button>
  )
}
