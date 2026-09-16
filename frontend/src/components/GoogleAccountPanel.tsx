// One Google sign-in covers two things: reading Gmail headers for the Contact
// tab, and a private app-data folder in Drive for backups. They share a card
// because they share a consent screen — connecting one connects the other.

import { useState } from 'react'
import { loadClientId, saveClientId } from '../lib/gmail'

function relTime(ms: number | null): string {
  if (!ms) return 'never'
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export function GoogleAccountPanel({
  status,
  email,
  lastSync,
  syncing,
  syncStatus,
  error,
  onConnect,
  onDisconnect,
  onSync,
  driveSync,
  onSetDriveSync,
  onBackupNow,
  onRestoreFromDrive,
  driveStatus,
  driveTime,
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
  driveSync: boolean
  onSetDriveSync: (on: boolean) => void
  onBackupNow: () => void
  onRestoreFromDrive: () => void
  driveStatus: string | null
  driveTime: string | null
}) {
  const [clientId, setClientId] = useState(loadClientId())
  const [showSetup, setShowSetup] = useState(!loadClientId())
  const connected = status === 'connected'

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-slate-900">Google account</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
            connected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {connected ? `connected${email ? ` · ${email}` : ''}` : 'not connected'}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
        Used for two things, both entirely in your browser: reading the <b>headers</b> of emails you
        sent to professors (never the bodies) so Contact can track replies, and keeping a backup in a
        private app-only folder of your Drive. Nothing is uploaded to any server of ours.
      </p>

      {connected ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={onSync}
            disabled={syncing}
            className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
          >
            {syncing ? (syncStatus ?? 'Syncing…') : 'Sync Gmail now'}
          </button>
          <span className="text-[12px] text-slate-500">last sync {relTime(lastSync)}</span>
          <button
            onClick={onDisconnect}
            className="ml-auto rounded border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-600 hover:border-rose-300 hover:text-rose-700"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="mt-3">
          <label className="block text-[12px] font-medium text-slate-700">OAuth Client ID</label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="1234567890-abcdef.apps.googleusercontent.com"
              className="min-w-[260px] flex-1 rounded border border-slate-300 px-2.5 py-1.5 text-[12.5px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            />
            <button
              onClick={() => {
                const id = clientId.trim()
                if (!id) return
                saveClientId(id)
                onConnect(id)
              }}
              disabled={!clientId.trim()}
              className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
            >
              Connect &amp; authorize
            </button>
          </div>
          <button
            onClick={() => setShowSetup((v) => !v)}
            className="mt-2 text-[12px] font-medium text-indigo-600 hover:underline"
          >
            {showSetup ? 'Hide setup steps' : 'How do I get a Client ID?'}
          </button>
          {showSetup && (
            <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-700">
              <p className="font-semibold text-slate-800">One-time setup (about 10 minutes):</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                <li>
                  Open{' '}
                  <a className="font-medium text-indigo-600 hover:underline" href="https://console.cloud.google.com/" target="_blank" rel="noreferrer">
                    console.cloud.google.com
                  </a>{' '}
                  and create a project.
                </li>
                <li>
                  APIs &amp; Services → <b>Enable</b> the <b>Gmail API</b> and the <b>Google Drive API</b>.
                </li>
                <li>
                  OAuth consent screen → <b>External</b>, status <b>Testing</b>; add your Gmail as a{' '}
                  <b>test user</b>; add the scopes <code>gmail.readonly</code>, <code>drive.appdata</code>{' '}
                  and <code>drive.file</code>.
                </li>
                <li>
                  Credentials → Create <b>OAuth client ID</b> → <b>Web application</b>. Authorized
                  JavaScript origins:
                  <div className="mt-1 rounded bg-white px-2 py-1 font-mono text-[11.5px] text-slate-700">
                    https://thomasli0314.github.io
                    <br />
                    http://localhost:5173
                  </div>
                </li>
                <li>Copy the Client ID into the box above.</li>
              </ol>
              <p className="mt-1.5 text-[11.5px] text-slate-500">
                The Client ID is public and safe to store; no secret is involved. Google shows an
                “unverified app” warning for personal test-mode apps — choose <i>Advanced → Continue</i>.
                Access is re-approved about weekly.
              </p>
            </div>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-[12.5px] font-medium text-rose-600">{error}</p>}

      {/* Drive backup */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold text-slate-800">Drive auto-backup</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              driveSync && connected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {driveSync && connected ? 'on' : 'off'}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-slate-600">
          Everything you save here lives only in this browser until it is backed up. Drive keeps a
          copy in a folder only this app can see; it survives clearing browsing data and follows you
          across devices.
        </p>
        {!connected ? (
          <p className="mt-1.5 text-[12px] font-medium text-indigo-700">
            Connect the account above to enable it. If you set up OAuth earlier, add the{' '}
            <code>drive.appdata</code> and <code>drive.file</code> scopes and reconnect.
          </p>
        ) : (
          <>
            <label className="mt-2 flex items-center gap-2 text-[12.5px] font-medium text-slate-800">
              <input type="checkbox" checked={driveSync} onChange={(e) => onSetDriveSync(e.target.checked)} />
              Back up automatically whenever my data changes
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={onBackupNow}
                className="rounded bg-slate-800 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-slate-700"
              >
                Back up now
              </button>
              <button
                onClick={onRestoreFromDrive}
                className="rounded border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:border-indigo-400"
              >
                Restore from Drive…
              </button>
              {driveTime && (
                <span className="text-[12px] text-slate-500">last backup {new Date(driveTime).toLocaleString()}</span>
              )}
            </div>
            {driveStatus && <p className="mt-1 text-[12px] font-medium text-slate-600">{driveStatus}</p>}
          </>
        )}
      </div>
    </section>
  )
}
