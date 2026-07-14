import { useEffect, useState } from 'react'

/** A link that the user can add or edit inline. When `url` is set it renders
 *  "{label} ↗" with a small ✎; when empty it renders "＋ {label}". Saves a
 *  normalized URL (adds https:// if missing). Used for faculty homepages (when
 *  the dataset has none) and for overriding a program's page URL. */
export function EditableLink({
  url,
  label,
  onSave,
}: {
  url: string
  label: string
  onSave: (url: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(url)

  useEffect(() => {
    if (!editing) setDraft(url)
  }, [url, editing])

  const save = () => {
    let u = draft.trim()
    if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`
    onSave(u)
    setEditing(false)
  }
  const cancel = () => {
    setDraft(url)
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          placeholder="https://…"
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            else if (e.key === 'Escape') cancel()
          }}
          className="w-44 rounded border border-indigo-300 px-1.5 py-0.5 text-[11px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />
        <button onClick={save} className="font-semibold text-emerald-600 hover:text-emerald-700">
          save
        </button>
        <button onClick={cancel} className="text-slate-400 hover:text-slate-600">
          ✕
        </button>
      </span>
    )
  }

  if (url) {
    return (
      <span className="inline-flex items-center gap-1">
        <a href={url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
          {label} ↗
        </a>
        <button
          onClick={() => setEditing(true)}
          title={`Edit ${label.toLowerCase()}`}
          className="text-slate-300 hover:text-slate-500"
        >
          ✎
        </button>
      </span>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-slate-400 transition-colors hover:text-indigo-600"
      title={`Add ${label.toLowerCase()}`}
    >
      ＋ {label}
    </button>
  )
}
