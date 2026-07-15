import { useState } from 'react'

type Status = 'idle' | 'sending' | 'sent' | 'error'

/**
 * "Request a field of interest" modal. Posts to /api/report-field, which is
 * served by server.mjs (and proxied in `npm run dev`) and appends the request to
 * a file on the owner's laptop. Nothing is stored off-machine.
 *
 * The GitHub Pages build is STATIC — there is no /api there, so the POST 404s.
 * When that happens we say so and offer the text for copying, instead of the old
 * behaviour: a dead button whose error message claimed the opposite ("works on
 * the live/shared site, not the plain dev server").
 */
export function RequestFieldModal({ onClose }: { onClose: () => void }) {
  const [field, setField] = useState('')
  const [note, setNote] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const asText = () =>
    [`Field of interest: ${field}`, note && `Notes: ${note}`, email && `Reply to: ${email}`]
      .filter(Boolean)
      .join('\n')

  const copyRequest = async () => {
    try {
      await navigator.clipboard.writeText(asText())
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

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
        setError(
          res.status === 404
            ? 'This published site is static, so requests can’t be submitted from here. Copy your request below and send it to the maintainer.'
            : data.error || 'The request could not be submitted.',
        )
      }
    } catch {
      setStatus('error')
      setError(
        'Couldn’t reach the request endpoint — it only exists when the site is served by server.mjs (or `npm run dev`), not on the published static site. Copy your request below instead.',
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
            {status === 'error' && (
              <div className="rounded border border-rose-200 bg-rose-50 px-2.5 py-2">
                <p className="text-[12px] leading-snug text-rose-700">{error}</p>
                <button
                  type="button"
                  onClick={copyRequest}
                  className="mt-1.5 rounded border border-rose-300 bg-white px-2 py-0.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100"
                >
                  {copied ? 'Copied ✓' : 'Copy my request'}
                </button>
              </div>
            )}
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
