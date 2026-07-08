import { useState } from 'react'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/**
 * "Request a field of interest" modal. Posts to the local server's
 * /api/report-field endpoint, which appends the request to a file on the
 * owner's laptop. The owner reviews requests and decides whether to research
 * and add that field. Nothing is stored off-machine.
 */
export function RequestFieldModal({ onClose }: { onClose: () => void }) {
  const [field, setField] = useState('')
  const [note, setNote] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!field.trim()) return
    setStatus('sending')
    setError('')
    try {
      const res = await fetch('/api/report-field', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field, note, email }),
      })
      const data = await res.json().catch(() => ({ ok: res.ok }))
      if (res.ok && data.ok) {
        setStatus('sent')
      } else {
        setStatus('error')
        setError(data.error || 'The request could not be submitted.')
      }
    } catch {
      setStatus('error')
      setError(
        'Could not reach the server. This feature works on the live/shared site, not the plain dev server.',
      )
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-serif text-base font-bold text-slate-900">
            Request a field of interest
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {status === 'sent' ? (
          <div className="px-4 py-6 text-center">
            <div className="mb-2 text-2xl">✅</div>
            <p className="text-sm font-medium text-slate-800">Request sent — thank you!</p>
            <p className="mt-1 text-xs text-slate-500">
              The maintainer reviews requests and will research and add matching programs and
              faculty for confirmed fields.
            </p>
            <button
              onClick={onClose}
              className="mt-4 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 px-4 py-4">
            <p className="text-[12px] leading-snug text-slate-500">
              Don't see your research area? Suggest a field (e.g. "Operations Research",
              "Quantum Computing", "Robotics") and the maintainer will consider researching it and
              adding relevant programs and advisors to the database.
            </p>
            <div>
              <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Field of interest <span className="text-rose-500">*</span>
              </label>
              <input
                value={field}
                onChange={(e) => setField(e.target.value)}
                required
                maxLength={120}
                autoFocus
                placeholder="e.g. Operations Research"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Notes (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Specific sub-areas, schools, or advisors you'd like covered…"
                className="w-full resize-none rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Your email (optional — for a reply)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                placeholder="you@example.com"
                className="w-full rounded border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            {status === 'error' && <p className="text-[12px] text-rose-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={status === 'sending' || !field.trim()}
                className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {status === 'sending' ? 'Sending…' : 'Send request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
