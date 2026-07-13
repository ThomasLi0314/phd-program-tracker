import { useState } from 'react'
import { loadClientId, saveClientId } from '../lib/gmail'

function relTime(ms: number | null): string {
  if (!ms) return 'never'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function GmailConnect({
  status,
  email,
  lastSync,
  syncing,
  syncStatus,
  error,
  onConnect,
  onDisconnect,
  onSync,
}: {
  status: 'disconnected' | 'connected'
  email: string | null
  lastSync: number | null
  syncing: boolean
  syncStatus: string | null
  error: string | null
  onConnect: (clientId: string) => void
  onDisconnect: () => void
  onSync: () => void
}) {
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState(loadClientId())

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="rounded border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-1 font-medium text-emerald-300">
          ✉ Gmail ✓
        </span>
        <button
          onClick={onSync}
          disabled={syncing}
          className="rounded border border-slate-600 bg-slate-800 px-2 py-1 font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-60"
          title={email ? `Connected as ${email}` : undefined}
        >
          {syncing ? (syncStatus ?? 'Syncing…') : `Sync (${relTime(lastSync)})`}
        </button>
        <button
          onClick={onDisconnect}
          className="rounded border border-slate-700 px-1.5 py-1 text-slate-400 transition-colors hover:text-rose-300"
          title="Disconnect Gmail"
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700"
      >
        ✉ Connect Gmail
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-white p-5 text-slate-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-serif text-lg font-bold text-slate-900">Connect Gmail</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
              Track which advisors you've emailed and who replied — read straight from your
              Gmail, entirely in your browser. We read only message <b>headers</b> (to / from /
              subject / date), never message bodies, and nothing is uploaded anywhere.
            </p>

            <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-600">
              <p className="font-semibold text-slate-700">One-time setup (~10 min):</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>
                  Open{' '}
                  <a
                    className="font-medium text-indigo-600 hover:underline"
                    href="https://console.cloud.google.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    console.cloud.google.com
                  </a>{' '}
                  → create a project.
                </li>
                <li>
                  APIs &amp; Services → <b>Enable</b> the <b>Gmail API</b>.
                </li>
                <li>
                  OAuth consent screen → <b>External</b>, status <b>Testing</b>; add your Gmail as
                  a <b>test user</b>; add scope <code>.../auth/gmail.readonly</code>.
                </li>
                <li>
                  Credentials → Create <b>OAuth client ID</b> → <b>Web application</b>. Authorized
                  JavaScript origins:
                  <div className="mt-1 rounded bg-white px-2 py-1 font-mono text-[11px] text-slate-700">
                    https://thomasli0314.github.io
                    <br />
                    http://localhost:5173
                  </div>
                </li>
                <li>Copy the <b>Client ID</b> and paste it below.</li>
              </ol>
              <p className="mt-1.5 text-[11px] text-slate-400">
                The Client ID is public and safe to store; no secret is used. Google shows an
                “unverified app” screen for personal test-mode apps — click <i>Advanced → Continue</i>.
                Access is re-approved about weekly.
              </p>
            </div>

            <label className="mt-3 block text-[12px] font-medium text-slate-700">
              OAuth Client ID
            </label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="1234567890-abcdef.apps.googleusercontent.com"
              className="mt-1 w-full rounded border border-slate-300 px-2.5 py-1.5 text-[12px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            />
            {error && <p className="mt-2 text-[12px] font-medium text-rose-600">{error}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => {
                  const id = clientId.trim()
                  if (!id) return
                  saveClientId(id)
                  onConnect(id)
                }}
                disabled={!clientId.trim()}
                className="rounded bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
              >
                Connect &amp; authorize
              </button>
              <button
                onClick={() => setOpen(false)}
                className="text-[12px] font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
