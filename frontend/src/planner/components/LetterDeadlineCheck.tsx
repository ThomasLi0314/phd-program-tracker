// Look up when each program's recommendation letters are due, and note it on
// every writer's checklist.
//
// Most programs take letters by the application deadline and say no more. Some
// give recommenders a grace period, and a few want letters early — and a writer
// going by the wrong date is the costly mistake. So this reads the official
// pages of every program that has a letter writer (lib/research) and proposes
// what they say, with the quote behind it. As everywhere in the planner,
// nothing is saved until I accept it; what I accept becomes the program's
// "Letter deadline", and from there reaches each writer's Sheet on its own.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlannerState } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'
import { programIdentity, resolveProgram } from '../lib/referenceBridge'
import { resolveDeadline } from '../lib/deadlines'
import { lettersOf, stillApplying } from '../lib/letters'
import { letterDueOf, parseLetterDeadline } from '../lib/letterDeadline'
import { programLabel } from '../lib/exportRows'
import { applyProgramReview, buildProgramReview, getProvider, type ReviewItem } from '../lib/research'
import { ReviewRow } from './ResearchPanel'

type Outcome =
  /** a page says when letters are due — to be reviewed */
  | { kind: 'found'; item: ReviewItem; offCycle: boolean }
  /** the pages were read and say nothing of their own about letters; `unread`
   *  counts the ones that could not be read, which might have */
  | { kind: 'nothing'; unread: number }
  | { kind: 'failed'; error: string }

/** Errors that will repeat for every program: no point reading on. */
const STOPS_THE_RUN = /No API key|API key was rejected|out of balance|rejected the request/

export function LetterDeadlineCheck({
  state,
  pool,
  planner,
}: {
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
}) {
  const [running, setRunning] = useState<{ done: number; total: number; message: string } | null>(null)
  const [outcomes, setOutcomes] = useState<Map<string, Outcome>>(new Map())
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  // Every program a writer is writing for — the ones that appear on a checklist.
  const scope = useMemo(
    () =>
      state.programs
        .filter((p) => stillApplying(p) && lettersOf(p).some((l) => l.status !== 'declined'))
        .map((p) => {
          const live = resolveProgram(p, pool.byId)
          const id = programIdentity(p, live)
          const application = resolveDeadline(p.admissions.deadline, live?.requirements.deadline)
          const due = letterDueOf(p, application)
          return {
            p,
            name: `${id.university} — ${programLabel(id.programName, id.degree)}`,
            university: id.university,
            programName: id.programName,
            urls: [id.website, id.portal].filter(Boolean),
            applicationIso: application.kind === 'dated' ? application.iso : null,
            noted: !!due && !due.offCycle,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [state.programs, pool.byId],
  )

  if (scope.length === 0) return null

  const provider = getProvider()
  const ready = provider.available()
  const unchecked = scope.filter((s) => !s.noted)
  const notedCount = scope.length - unchecked.length

  const run = async (targets: typeof scope) => {
    abort.current?.abort()
    const ctrl = new AbortController()
    abort.current = ctrl
    setOutcomes(new Map())
    setAccepted(new Set())
    setNotice(null)
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]
        const progress = (message: string) => setRunning({ done: i, total: targets.length, message: `${t.university}: ${message}` })
        progress('starting…')
        let outcome: Outcome
        try {
          const res = await provider.researchLetterDeadline(
            { university: t.university, programName: t.programName, cycle: t.p.cycle, urls: t.urls },
            progress,
            ctrl.signal,
          )
          const item = res.status === 'failed' ? undefined : buildProgramReview(t.p, res.proposals)[0]
          outcome =
            res.status === 'failed'
              ? { kind: 'failed', error: res.error ?? 'The check failed.' }
              : item
                ? {
                    kind: 'found',
                    item,
                    offCycle: !!parseLetterDeadline(String(item.proposal.value), t.applicationIso)?.offCycle,
                  }
                : { kind: 'nothing', unread: res.pages.filter((p) => !p.ok).length }
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') throw e
          outcome = { kind: 'failed', error: e instanceof Error ? e.message : String(e) }
        }
        setOutcomes((prev) => new Map(prev).set(t.p.id, outcome))
        // Pre-ticked only when it is new and its quote really is on the page —
        // the same bar the program page's research sets — and is this cycle's.
        if (
          outcome.kind === 'found' &&
          !outcome.offCycle &&
          outcome.item.action === 'add' &&
          outcome.item.proposal.groundedInPage
        ) {
          setAccepted((prev) => new Set(prev).add(t.p.id))
        }
        if (outcome.kind === 'failed' && STOPS_THE_RUN.test(outcome.error)) {
          setNotice({ tone: 'bad', text: `Stopped — ${outcome.error.replace(/^Couldn’t check \S+: /, '')}` })
          break
        }
      }
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        setNotice({ tone: 'bad', text: e instanceof Error ? e.message : String(e) })
      }
    } finally {
      if (abort.current === ctrl) setRunning(null)
    }
  }

  const save = () => {
    let saved = 0
    for (const [pid, o] of outcomes) {
      if (o.kind !== 'found') continue
      // Against the program as it is now, not as it was when the run began.
      const current = state.programs.find((p) => p.id === pid)
      if (!current) continue
      const items = buildProgramReview(current, [o.item.proposal])
      const take = accepted.has(pid)
      // An unticked new value, or a locked field, leaves the program untouched.
      if (!take && items.every((i) => i.action === 'add' || i.action === 'locked')) continue
      const patch = applyProgramReview(current, items, take ? new Set(items.map((i) => i.id)) : new Set())
      // Only this one field was looked at, so the program's own "last
      // researched" date is left alone.
      planner.updateProgram(pid, { admissions: patch.admissions })
      if (take) saved++
    }
    setOutcomes(new Map())
    setAccepted(new Set())
    setNotice({
      tone: 'ok',
      text:
        saved > 0
          ? `Saved ${saved} letter deadline${saved === 1 ? '' : 's'}. Each writer’s Google Sheet picks ${saved === 1 ? 'it' : 'them'} up within a few seconds.`
          : 'Nothing was ticked, so nothing changed.',
    })
  }

  const found = scope.filter((s) => outcomes.get(s.p.id)?.kind === 'found')
  const nothing = scope.filter((s) => outcomes.get(s.p.id)?.kind === 'nothing')
  const failed = scope.filter((s) => outcomes.get(s.p.id)?.kind === 'failed')
  const decidable = found.filter((s) => {
    const o = outcomes.get(s.p.id)
    return o?.kind === 'found' && (o.item.action === 'add' || o.item.action === 'conflict')
  })

  const btn =
    'rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50'

  return (
    <section className="mb-3 rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-w-xl">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Letter deadlines</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
            Some programs want letters on a different day from the application — a grace period after it, or a date
            before it. {notedCount > 0 ? `${notedCount} of your ${scope.length}` : `None of your ${scope.length}`}{' '}
            program{scope.length === 1 ? '' : 's'} with a writer {notedCount === 1 ? 'has' : 'have'} one noted; where one
            is, it appears as “Letter due” on each writer’s checklist.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {running ? (
            <button onClick={() => abort.current?.abort()} className={btn}>
              Stop
            </button>
          ) : (
            <>
              <button
                onClick={() => void run(unchecked.length > 0 ? unchecked : scope)}
                disabled={!ready}
                title="Reads each program’s official pages and asks the model only what they say about when letters are due. You review every result before it is saved."
                className="rounded bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {unchecked.length > 0
                  ? `Look up letter deadlines (${unchecked.length})`
                  : `Check all ${scope.length} again`}
              </button>
              {unchecked.length > 0 && notedCount > 0 && (
                <button onClick={() => void run(scope)} disabled={!ready} className={btn}>
                  Check all {scope.length} again
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {!ready && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
          {provider.unavailableReason()} You can still type a letter deadline on any program’s page, under Admissions.
        </p>
      )}

      {running && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded bg-slate-100">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${Math.round((running.done / running.total) * 100)}%` }}
            />
          </div>
          <p className="mt-1 text-[11.5px] font-medium text-indigo-600 [overflow-wrap:anywhere]">
            {running.done + 1} of {running.total} · {running.message}
          </p>
        </div>
      )}

      {notice && (
        <p className={`mt-2 text-[11.5px] font-medium ${notice.tone === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}>
          {notice.text}
        </p>
      )}

      {outcomes.size > 0 && (
        <div className="mt-2.5 border-t border-slate-100 pt-2">
          {found.length > 0 && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Found on the program’s pages ({found.length})
                </span>
                {decidable.length > 0 && !running && (
                  <button
                    onClick={save}
                    className="rounded border border-emerald-300 bg-white px-3 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50"
                  >
                    Save {accepted.size} to the plan
                  </button>
                )}
              </div>
              <ul className="mt-1 rounded border border-slate-200 bg-white px-2.5">
                {found.map((s) => {
                  const o = outcomes.get(s.p.id)
                  if (o?.kind !== 'found') return null
                  return (
                    <ReviewRow
                      key={s.p.id}
                      item={{ ...o.item, label: o.offCycle ? `${s.name} · date looks like another cycle’s` : s.name }}
                      checked={accepted.has(s.p.id)}
                      onToggle={() =>
                        setAccepted((prev) => {
                          const next = new Set(prev)
                          if (next.has(s.p.id)) next.delete(s.p.id)
                          else next.add(s.p.id)
                          return next
                        })
                      }
                    />
                  )
                })}
              </ul>
            </>
          )}

          {nothing.length > 0 && (
            <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
              <span className="font-medium text-slate-600">Nothing of their own about letters</span> on the pages read
              for{' '}
              {nothing
                .map((s) => {
                  const o = outcomes.get(s.p.id)
                  const unread = o?.kind === 'nothing' ? o.unread : 0
                  return unread > 0 ? `${s.university} (${unread} page${unread === 1 ? '' : 's'} couldn’t be read)` : s.university
                })
                .join(', ')}{' '}
              — so the application deadline stands. That is the usual result, not a failure; nothing is filled in with a
              guess.
            </p>
          )}

          {failed.length > 0 && (
            <ul className="mt-2 space-y-0.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              {failed.map((s) => {
                const o = outcomes.get(s.p.id)
                return (
                  <li key={s.p.id} className="text-[11px] leading-relaxed text-amber-900 [overflow-wrap:anywhere]">
                    ⚠ {s.name}: {o?.kind === 'failed' ? o.error : ''}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
