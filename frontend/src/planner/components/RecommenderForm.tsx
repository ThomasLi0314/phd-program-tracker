// A new letter writer: the few details worth having to hand. Everything but
// the name can be filled in later on the Letter Writers page.

import { useState } from 'react'
import type { Recommender } from '../types'

export type RecommenderInput = Pick<Recommender, 'name' | 'title' | 'institution' | 'email' | 'relationship'>

const input =
  'w-full rounded border border-slate-300 bg-white px-2 py-1 text-[12.5px] text-slate-800 focus:border-indigo-400 focus:outline-none'

export function RecommenderForm({
  onSave,
  onCancel,
  saveLabel = 'Add letter writer',
}: {
  onSave: (r: RecommenderInput) => void
  onCancel: () => void
  saveLabel?: string
}) {
  const [r, setR] = useState<RecommenderInput>({ name: '', title: '', institution: '', email: '', relationship: '' })
  const set = (k: keyof RecommenderInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setR((prev) => ({ ...prev, [k]: e.target.value }))

  return (
    <form
      className="rounded border border-indigo-200 bg-indigo-50/50 p-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (r.name.trim()) onSave(r)
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <input autoFocus value={r.name} onChange={set('name')} placeholder="Name *" className={input} />
        <input value={r.email} onChange={set('email')} placeholder="Email" type="email" className={input} />
        <input value={r.title} onChange={set('title')} placeholder="Title, e.g. Associate Professor" className={input} />
        <input value={r.institution} onChange={set('institution')} placeholder="Institution / department" className={input} />
        <input
          value={r.relationship}
          onChange={set('relationship')}
          placeholder="How they know you, e.g. thesis advisor"
          className={`${input} sm:col-span-2`}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={!r.name.trim()}
          className="rounded bg-indigo-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saveLabel}
        </button>
        <button type="button" onClick={onCancel} className="text-[12px] text-slate-500 hover:underline">
          cancel
        </button>
      </div>
    </form>
  )
}
