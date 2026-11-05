// A live Google Sheet's controls: make it, open it, and see whether it has
// caught up with the last edit. Used for the plan's Sheet (Programs page) and
// each letter writer's checklist. The syncing itself happens in the mirror
// (planner/lib/sheetMirror), driven from PlannerApp.

import { useEffect, useState, type ReactNode } from 'react'
import { loadClientId } from '../../lib/gmail'
import { planSheet } from '../lib/googleSheet'
import { useMirrorView, type SheetMirror, type SheetStatus } from '../lib/sheetMirror'

function ago(iso: string | null): string {
  if (!iso) return ''
  const s = Math.floor((Date.now() - Date.parse(iso)) / 1000)
  if (s < 45) return 'just now'
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} d ago`
}

function StatusText({ status }: { status: SheetStatus }) {
  // Re-render now and then so "2 min ago" doesn't freeze at "just now".
  const [, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (status.kind === 'pending' || status.kind === 'syncing') {
    return <span className="text-slate-500">Updating…</span>
  }
  if (status.kind === 'synced') {
    return (
      <span className="text-emerald-700" title="The Sheet matches your plan; it rewrites itself a few seconds after each change">
        ✓ Up to date{status.at ? ` · ${ago(status.at)}` : ''}
      </span>
    )
  }
  if (status.kind === 'error') {
    return (
      <span className="max-w-[340px] text-rose-600" role="alert">
        {status.message}
      </span>
    )
  }
  return null
}

const linkBtn = 'text-[11.5px] font-medium text-slate-500 hover:text-indigo-700 hover:underline disabled:opacity-50'

export function SheetControls<S, P>({
  mirror = planSheet as unknown as SheetMirror<S, P>,
  createTitle = 'Make a Google Sheet of your plan in your Drive. It then updates itself after every change — no more exporting.',
  align = 'end',
  linkedHint,
}: {
  mirror?: SheetMirror<S, P>
  createTitle?: string
  align?: 'start' | 'end'
  /** shown under the controls once the Sheet exists */
  linkedHint?: ReactNode
}) {
  const { link, status, ready, notice } = useMirrorView(mirror)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const items = align === 'end' ? 'items-end text-right' : 'items-start text-left'
  const justify = align === 'end' ? 'justify-end' : 'justify-start'

  const make = async () => {
    setNote(null)
    if (!loadClientId()) {
      setNote('Connect a Google account first — Explore → Settings → Google account.')
      return
    }
    setBusy(true)
    try {
      await mirror.create()
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const resync = async () => {
    setBusy(true)
    try {
      await mirror.syncNow()
    } finally {
      setBusy(false)
    }
  }

  if (!link) {
    return (
      <div className={`flex flex-col gap-1 ${items}`}>
        <button
          onClick={() => void make()}
          disabled={busy || !ready}
          className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 transition-colors hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
          title={ready ? createTitle : 'Waiting for the program database to load…'}
        >
          {busy ? 'Creating Sheet…' : 'Create Google Sheet'}
        </button>
        {note && (
          <span className="max-w-[340px] text-[11px] leading-snug text-rose-600" role="alert">
            {note}
          </span>
        )}
      </div>
    )
  }

  const gone = status.kind === 'error' && status.gone
  return (
    <div className={`flex flex-col gap-0.5 ${items}`}>
      <div className="flex items-center gap-2">
        {!gone && (
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            title={`Open “${link.title}” in Google Sheets`}
            className="rounded border border-emerald-500 bg-emerald-50 px-3 py-1.5 text-[12.5px] font-medium text-emerald-800 transition-colors hover:bg-emerald-100"
          >
            Google Sheet ↗
          </a>
        )}
        {gone && (
          <button
            onClick={() => void make()}
            disabled={busy || !ready}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Creating Sheet…' : 'Make a new Google Sheet'}
          </button>
        )}
      </div>
      <div className={`flex flex-wrap items-center gap-x-2 text-[11.5px] ${justify}`}>
        <StatusText status={status} />
        {!gone && (
          <button
            onClick={() => void resync()}
            disabled={busy || !ready || status.kind === 'syncing'}
            className={linkBtn}
            title="Rewrite the Sheet now (and reconnect Google if the sign-in has lapsed)"
          >
            Sync now
          </button>
        )}
        <button
          onClick={() => {
            if (
              confirm(
                'Stop updating this Google Sheet?\n\nThe Sheet is NOT deleted — it stays in your Drive as it is now. You can make a new one afterwards.',
              )
            ) {
              mirror.unlink()
            }
          }}
          className={linkBtn}
          title="Stop syncing (the Sheet stays in your Drive)"
        >
          Unlink
        </button>
      </div>
      {note && (
        <span className="max-w-[340px] text-[11px] leading-snug text-rose-600" role="alert">
          {note}
        </span>
      )}
      {notice && !gone && <span className="max-w-[420px] text-[11px] leading-snug text-amber-700">{notice}</span>}
      {linkedHint && !gone && <span className="max-w-[420px] text-[11px] leading-snug text-slate-500">{linkedHint}</span>}
    </div>
  )
}
