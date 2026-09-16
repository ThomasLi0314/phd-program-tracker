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

export function BackupPanel({ requests }: { requests: RequestBundle }) {
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
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-[14px] font-semibold text-slate-900">Backup file</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
        A JSON snapshot you keep yourself — works with no account. Everything you save (saved programs
        and advisors, notes, contact records, edits) is in it; API keys are not.
      </p>

      <div className="mt-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
        {summary.map((s) => (
          <div key={s.label} className="flex justify-between text-[12.5px] text-slate-700">
            <span>{s.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{s.count}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            downloadBackup()
            setMsg('Backup downloaded.')
          }}
          className="rounded bg-slate-800 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-slate-700"
        >
          Export backup
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-indigo-400"
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
        <span className="text-[12px] text-slate-500">{total} items saved in this browser</span>
      </div>

      {/* Promote locally-added advisors into the shared dataset. The browser
          can't write mock_data.json (static site), so this hands over a
          checkable request instead. */}
      {(requests.requests.length > 0 || requests.unsourced.length > 0) && (
        <div className="mt-4 rounded border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold text-slate-800">
              Advisors you added ({requests.requests.length} sourced)
            </span>
            <button
              onClick={copyRequests}
              disabled={requests.requests.length === 0}
              className="rounded bg-emerald-600 px-2 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-40"
            >
              {copied ? 'Copied ✓' : 'Copy request'}
            </button>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-slate-600">
            These live only in this browser. Copy the request and paste it to Claude to have each
            source re-checked and merged into the shared database — then they are permanent and on
            every device.
          </p>
          {requests.unsourced.length > 0 && (
            <p className="mt-1 text-[12px] leading-relaxed text-amber-800">
              {requests.unsourced.length} added advisor{requests.unsourced.length === 1 ? ' has' : 's have'} no
              source page and can't be merged as is: {requests.unsourced.map((u) => u.name).join(', ')}.
              Re-add with <b>Fetch &amp; fill</b> to give {requests.unsourced.length === 1 ? 'it' : 'them'} a source.
            </p>
          )}
        </div>
      )}

      {msg && <p className="mt-2 text-[12.5px] font-medium text-emerald-700">{msg}</p>}
      {err && <p className="mt-2 text-[12.5px] font-medium text-rose-600">{err}</p>}
    </section>
  )
}
