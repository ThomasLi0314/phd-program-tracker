import { useRef, useState } from 'react'
import {
  applyBackup,
  describeBackup,
  downloadBackup,
  exportBackup,
  isBackupFile,
  type BackupFile,
} from '../lib/backup'
import type { RequestBundle } from '../lib/advisorRequests'

export function BackupModal({
  onClose,
  driveConnected,
  driveSync,
  onSetDriveSync,
  onBackupNow,
  onRestoreFromDrive,
  driveStatus,
  driveTime,
  requests,
}: {
  onClose: () => void
  driveConnected: boolean
  driveSync: boolean
  onSetDriveSync: (on: boolean) => void
  onBackupNow: () => void
  onRestoreFromDrive: () => void
  driveStatus: string | null
  driveTime: string | null
  /** Advisors added locally, ready to be promoted into the shared dataset. */
  requests: RequestBundle
}) {
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const summary = describeBackup(exportBackup())
  const total = summary.reduce((n, s) => n + s.count, 0)

  const copyRequests = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(requests, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const onFile = async (f: File) => {
    setErr(null)
    setMsg(null)
    try {
      const parsed = JSON.parse(await f.text())
      if (!isBackupFile(parsed)) throw new Error('Not a tracker backup file')
      const counts = describeBackup(parsed as BackupFile)
      const n = counts.reduce((a, c) => a + c.count, 0)
      if (
        !confirm(
          `Restore this backup?\n\n${counts
            .map((c) => `• ${c.label}: ${c.count}`)
            .join('\n')}\n\nThis REPLACES your current local data (${total} items) and reloads the page.`,
        )
      )
        return
      applyBackup(parsed as BackupFile)
      setMsg(`Restored ${n} items — reloading…`)
      setTimeout(() => location.reload(), 700)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white p-5 text-slate-800 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h2 className="font-serif text-lg font-bold text-slate-900">Backup &amp; restore</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          ⚠️ Everything you save (starred programs &amp; advisors, notes, outreach, link fixes)
          lives only in <b>this browser</b>. Clearing browsing data <b>permanently deletes it</b> —
          it cannot be recovered. Keep a backup.
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Currently saved ({total} items)
          </p>
          <ul className="mt-1 space-y-0.5">
            {summary.map((s) => (
              <li key={s.label} className="flex justify-between text-[12px] text-slate-600">
                <span>{s.label}</span>
                <span className="font-semibold tabular-nums text-slate-800">{s.count}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Promote locally-added advisors into the shared dataset. The browser
            can't write mock_data.json (static site), so this hands over a
            checkable request instead. */}
        {(requests.requests.length > 0 || requests.unsourced.length > 0) && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-slate-700">
                🌐 Advisors you added ({requests.requests.length} sourced)
              </span>
              <button
                onClick={copyRequests}
                disabled={requests.requests.length === 0}
                className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
              >
                {copied ? 'Copied ✓' : 'Copy request'}
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              These live only in this browser. Copy the request and paste it to Claude to have each
              source re-checked and merged into the shared database — then they're permanent, visible
              on every device, and survive clearing your browsing data.
            </p>
            {requests.unsourced.length > 0 && (
              <p className="mt-1 text-[11px] leading-relaxed text-amber-700">
                {requests.unsourced.length} added advisor
                {requests.unsourced.length === 1 ? ' has' : 's have'} no source page (added by hand or
                from memory), so {requests.unsourced.length === 1 ? 'it' : 'they'} can't be merged as
                is: {requests.unsourced.map((u) => u.name).join(', ')}. Re-add with{' '}
                <b>Fetch &amp; fill</b> to give {requests.unsourced.length === 1 ? 'it' : 'them'} a
                source.
              </p>
            )}
          </div>
        )}

        {/* Google Drive — the durable copy */}
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-700">
              ☁️ Google Drive auto-backup
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                driveSync && driveConnected
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {driveSync && driveConnected ? 'on' : 'off'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            Saves to a private app-only folder in your Drive (we can't see your other files). This
            survives clearing your browser and syncs across devices.
          </p>
          {!driveConnected ? (
            <p className="mt-1.5 text-[11px] font-medium text-indigo-700">
              Connect Gmail first (top bar) — the same sign-in covers Drive backup. If you set up
              OAuth earlier, add the <code>drive.appdata</code> scope in Google Cloud Console and
              reconnect.
            </p>
          ) : (
            <>
              <label className="mt-1.5 flex items-center gap-2 text-[12px] font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={driveSync}
                  onChange={(e) => onSetDriveSync(e.target.checked)}
                />
                Auto-back up to Drive whenever my data changes
              </label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={onBackupNow}
                  className="rounded bg-indigo-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-indigo-700"
                >
                  Back up now
                </button>
                <button
                  onClick={onRestoreFromDrive}
                  className="rounded border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:border-indigo-400"
                >
                  Restore from Drive
                </button>
                {driveTime && (
                  <span className="text-[11px] text-slate-400">
                    last Drive backup {new Date(driveTime).toLocaleString()}
                  </span>
                )}
              </div>
              {driveStatus && (
                <p className="mt-1 text-[11px] font-medium text-slate-500">{driveStatus}</p>
              )}
            </>
          )}
        </div>

        {/* Local file */}
        <div className="mt-3 rounded-lg border border-slate-200 p-3">
          <span className="text-[12px] font-semibold text-slate-700">💾 Backup file</span>
          <p className="mt-1 text-[11px] text-slate-500">
            Download a JSON snapshot you keep yourself. Works with no account. (API keys are not
            included.)
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                downloadBackup()
                setMsg('Backup downloaded.')
              }}
              className="rounded bg-slate-800 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-slate-700"
            >
              Export backup
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded border border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:border-indigo-400"
            >
              Import backup…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>

        {msg && <p className="mt-2 text-[12px] font-medium text-emerald-700">{msg}</p>}
        {err && <p className="mt-2 text-[12px] font-medium text-rose-600">{err}</p>}
      </div>
    </div>
  )
}
