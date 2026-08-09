// Run research and review what came back before anything is applied (spec §20).
//
// The default posture is conservative: new information is pre-ticked only when
// its evidence was actually found in the page, conflicts are never pre-ticked,
// locked fields are reported but cannot be applied, and recruiting status always
// requires a deliberate click.

import { useRef, useState } from 'react'
import type { PlannerFaculty, PlannerProgram } from '../types'
import {
  applyFacultyReview,
  applyProgramReview,
  buildFacultyReview,
  buildProgramReview,
  defaultAccepted,
  defaultAcceptedFaculty,
  getProvider,
  type FacultyReviewItem,
  type ResearchStatus,
  type ReviewItem,
} from '../lib/research'
import { UNKNOWN_LABEL } from '../lib/labels'

type AnyItem = ReviewItem | FacultyReviewItem

const ACTION_STYLE: Record<string, { chip: string; label: string }> = {
  conflict: { chip: 'border-amber-300 bg-amber-50 text-amber-800', label: 'Disagrees with your value' },
  locked: { chip: 'border-rose-300 bg-rose-50 text-rose-700', label: 'You locked this — not applied' },
  add: { chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', label: 'New information' },
  agree: { chip: 'border-slate-200 bg-slate-50 text-slate-500', label: 'Confirms what you have' },
}

function Row({
  item,
  checked,
  onToggle,
}: {
  item: AnyItem
  checked: boolean
  onToggle: () => void
}) {
  const [showEvidence, setShowEvidence] = useState(false)
  const style = ACTION_STYLE[item.action]
  const selectable = item.action === 'add' || item.action === 'conflict'
  const p = item.proposal

  return (
    <li className="border-b border-slate-100 py-2 last:border-0">
      <div className="flex items-start gap-2">
        {selectable ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-indigo-600"
          />
        ) : (
          <span className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[12px] font-semibold text-slate-800">{item.label}</span>
            <span className={`rounded-full border px-1.5 py-px text-[9.5px] font-medium ${style.chip}`}>
              {style.label}
            </span>
            {!p.groundedInPage && (
              <span
                className="rounded-full border border-rose-300 bg-rose-50 px-1.5 py-px text-[9.5px] font-medium text-rose-700"
                title="The quoted evidence was not found in the fetched page. Treat this as unverified."
              >
                quote not found in page
              </span>
            )}
            <span className="text-[9.5px] text-slate-400">{p.confidence} confidence</span>
          </div>

          <div className="mt-1 grid gap-1 sm:grid-cols-2">
            <div className="rounded border border-slate-200 bg-slate-50/70 px-2 py-1">
              <div className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400">Current</div>
              <div className={`text-[12px] ${item.currentDisplay ? 'text-slate-700' : 'italic text-amber-700'}`}>
                {item.currentDisplay ?? UNKNOWN_LABEL}
              </div>
            </div>
            <div className="rounded border border-indigo-200 bg-indigo-50/50 px-2 py-1">
              <div className="text-[9.5px] font-semibold uppercase tracking-wide text-indigo-400">New research</div>
              <div className="text-[12px] text-slate-800 [overflow-wrap:anywhere]">{item.proposedDisplay}</div>
            </div>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-slate-400">
            <a
              href={p.source.url}
              target="_blank"
              rel="noreferrer"
              className="text-indigo-500 hover:underline [overflow-wrap:anywhere]"
            >
              {p.source.title || p.source.url} ↗
            </a>
            <span>· tier {p.source.tier}</span>
            <span>· {p.source.fetchedAt}</span>
            {p.evidence && (
              <button onClick={() => setShowEvidence((v) => !v)} className="text-slate-500 hover:underline">
                {showEvidence ? 'hide quote' : 'show quote'}
              </button>
            )}
          </div>
          {showEvidence && p.evidence && (
            <blockquote className="mt-1 border-l-2 border-slate-300 bg-slate-50 px-2 py-1 text-[11px] italic leading-relaxed text-slate-600">
              “{p.evidence}”
            </blockquote>
          )}
        </div>
      </div>
    </li>
  )
}

function StatusLine({ status, message }: { status: ResearchStatus; message: string | null }) {
  if (status === 'idle') return null
  const tone =
    status === 'running'
      ? 'text-indigo-600'
      : status === 'complete'
        ? 'text-emerald-600'
        : status === 'partial'
          ? 'text-amber-700'
          : 'text-rose-600'
  return <p className={`mt-1 text-[11.5px] font-medium ${tone}`}>{message}</p>
}

/** Shared shell so program and faculty research look and behave identically. */
function PanelShell({
  title,
  urls,
  status,
  message,
  warnings,
  items,
  accepted,
  setAccepted,
  onRun,
  onApply,
  onClose,
  running,
}: {
  title: string
  urls: string[]
  status: ResearchStatus
  message: string | null
  warnings: string[]
  items: AnyItem[]
  accepted: Set<string>
  setAccepted: (s: Set<string>) => void
  onRun: () => void
  onApply: () => void
  onClose: () => void
  running: boolean
}) {
  const provider = getProvider()
  const ready = provider.available()
  const actionable = items.filter((i) => i.action === 'add' || i.action === 'conflict')

  return (
    <section className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold text-slate-800">{title}</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
            Reads the official page{urls.length === 1 ? '' : 's'} below for real, then proposes values with the
            quote behind each one. Nothing is saved until you accept it.
          </p>
        </div>
        <button onClick={onClose} className="shrink-0 text-[11px] text-slate-400 hover:text-slate-600">
          close
        </button>
      </div>

      <ul className="mt-1.5 space-y-0.5">
        {urls.map((u) => (
          <li key={u} className="truncate text-[10.5px] text-slate-500">
            · {u}
          </li>
        ))}
        {urls.length === 0 && (
          <li className="text-[11px] text-amber-700">
            No URL on file — add the official page above first, or research has nothing to read.
          </li>
        )}
      </ul>

      {!ready && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
          {provider.unavailableReason()}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={onRun}
          disabled={!ready || running || urls.length === 0}
          className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-40"
        >
          {running ? 'Researching…' : items.length ? 'Research again' : 'Run research'}
        </button>
        {actionable.length > 0 && (
          <button
            onClick={onApply}
            disabled={accepted.size === 0}
            className="rounded border border-emerald-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-40"
          >
            Apply {accepted.size} accepted change{accepted.size === 1 ? '' : 's'}
          </button>
        )}
        <StatusLine status={status} message={message} />
      </div>

      {warnings.length > 0 && (
        <ul className="mt-2 space-y-0.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5">
          {warnings.map((w) => (
            <li key={w} className="text-[11px] leading-relaxed text-amber-900">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Proposed changes ({actionable.length} need a decision)
            </span>
            {actionable.length > 0 && (
              <span className="flex gap-2 text-[10.5px]">
                <button
                  onClick={() => setAccepted(new Set(actionable.map((i) => i.id)))}
                  className="text-indigo-600 hover:underline"
                >
                  select all
                </button>
                <button onClick={() => setAccepted(new Set())} className="text-slate-500 hover:underline">
                  none
                </button>
              </span>
            )}
          </div>
          <ul className="mt-1 rounded border border-slate-200 bg-white px-2.5">
            {items.map((i) => (
              <Row
                key={i.id}
                item={i}
                checked={accepted.has(i.id)}
                onToggle={() => {
                  const next = new Set(accepted)
                  if (next.has(i.id)) next.delete(i.id)
                  else next.add(i.id)
                  setAccepted(next)
                }}
              />
            ))}
          </ul>
        </>
      )}

      {status === 'complete' && items.length === 0 && (
        <p className="mt-2 text-[11.5px] text-slate-500">
          The pages didn’t state anything new. That is a real result, not a failure — the fields stay{' '}
          {UNKNOWN_LABEL} rather than being filled with a guess.
        </p>
      )}
    </section>
  )
}

export function ProgramResearchPanel({
  entry,
  cycle,
  onApply,
  onClose,
}: {
  entry: PlannerProgram
  cycle: string
  onApply: (patch: Partial<PlannerProgram>) => void
  onClose: () => void
}) {
  const [status, setStatus] = useState<ResearchStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [items, setItems] = useState<ReviewItem[]>([])
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const abort = useRef<AbortController | null>(null)

  const urls = [entry.links.program, entry.links.portal].filter(Boolean)

  const run = async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setStatus('running')
    setWarnings([])
    setMessage('Starting…')
    try {
      const res = await getProvider().researchProgram(
        { university: entry.university, programName: entry.programName, cycle, urls },
        (m) => setMessage(m),
        ctrl.signal,
      )
      setWarnings(res.warnings)
      if (res.status === 'failed') {
        setStatus('failed')
        setMessage(res.error ?? 'Research failed.')
        setItems([])
        return
      }
      const review = buildProgramReview(entry, res.proposals)
      setItems(review)
      setAccepted(defaultAccepted(review))
      setStatus(res.status)
      setMessage(
        `Read ${res.pages.filter((p) => p.ok).length} page(s), ${res.proposals.length} value(s) proposed.`,
      )
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setStatus('failed')
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <PanelShell
      title="Refresh program research"
      urls={urls}
      status={status}
      message={message}
      warnings={warnings}
      items={items}
      accepted={accepted}
      setAccepted={setAccepted}
      running={status === 'running'}
      onRun={() => void run()}
      onClose={() => {
        abort.current?.abort()
        onClose()
      }}
      onApply={() => {
        onApply(applyProgramReview(entry, items, accepted))
        setItems([])
        setAccepted(new Set())
        setStatus('idle')
        setMessage(null)
      }}
    />
  )
}

export function FacultyResearchPanel({
  entry,
  cycle,
  onApply,
  onClose,
}: {
  entry: PlannerFaculty
  cycle: string
  onApply: (patch: Partial<PlannerFaculty>) => void
  onClose: () => void
}) {
  const [status, setStatus] = useState<ResearchStatus>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [items, setItems] = useState<FacultyReviewItem[]>([])
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const abort = useRef<AbortController | null>(null)

  const urls = [entry.links.faculty, entry.links.personal, entry.links.lab].filter(Boolean)

  const run = async () => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setStatus('running')
    setWarnings([])
    setMessage('Starting…')
    try {
      const res = await getProvider().researchFaculty(
        { name: entry.name, university: entry.university, cycle, urls },
        (m) => setMessage(m),
        ctrl.signal,
      )
      setWarnings(res.warnings)
      if (res.status === 'failed') {
        setStatus('failed')
        setMessage(res.error ?? 'Research failed.')
        setItems([])
        return
      }
      const review = buildFacultyReview(entry, res.proposals)
      setItems(review)
      setAccepted(defaultAcceptedFaculty(review))
      setStatus(res.status)
      setMessage(`Read ${res.pages.filter((p) => p.ok).length} page(s), ${res.proposals.length} value(s) proposed.`)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setStatus('failed')
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <PanelShell
      title="Refresh faculty research"
      urls={urls}
      status={status}
      message={message}
      warnings={warnings}
      items={items}
      accepted={accepted}
      setAccepted={setAccepted}
      running={status === 'running'}
      onRun={() => void run()}
      onClose={() => {
        abort.current?.abort()
        onClose()
      }}
      onApply={() => {
        onApply(applyFacultyReview(entry, items, accepted))
        setItems([])
        setAccepted(new Set())
        setStatus('idle')
        setMessage(null)
      }}
    />
  )
}
