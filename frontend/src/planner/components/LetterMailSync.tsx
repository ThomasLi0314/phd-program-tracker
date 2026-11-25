// One click: read my Gmail for news of my recommendation letters and bring it
// into the plan (the matching itself is lib/letterMail).
//
// A portal email that names one of my writers and leaves no doubt about the
// program moves that letter forward at once, and is listed with an Undo. The
// rest — an email that fits two programs, names no writer, or that a writer
// wrote me themselves — waits below for me to apply or ignore. An undone or
// ignored email is remembered, so the next check doesn't bring it back.

import { useEffect, useRef, useState } from 'react'
import type { LetterStatus, PlannerState } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'
import { getMessageText, getProfile, listMessages, type MessageText } from '../../lib/gmail'
import { gmailThreadUrl } from '../../lib/gmailLinks'
import { readJson, withToken, writeJson } from '../lib/sheetMirror'
import {
  actionable,
  ignoreKey,
  letterMailQuery,
  letterStatusOf,
  mailContext,
  mailSince,
  movesForward,
  planLetterUpdates,
  readLetterMail,
  type LetterFinding,
  type LetterUpdate,
} from '../lib/letterMail'
import { LETTER_LABELS, LETTER_TONES } from '../lib/labels'
import { programIdentity, resolveProgram } from '../lib/referenceBridge'
import { programLabel } from '../lib/exportRows'
import { formatDeadline } from '../lib/deadlines'
import { StatusChip, StatusSelect } from './StatusChip'

/** When I last checked, and the matches I undid or ignored. Backed up (lib/backup). */
export const LETTER_MAIL_KEY = 'planner.letterMail.v1'
interface Stored {
  checkedAt: string | null
  ignored: string[]
}
function loadStored(): Stored {
  const s = readJson<Partial<Stored>>(LETTER_MAIL_KEY)
  return {
    checkedAt: typeof s?.checkedAt === 'string' ? s.checkedAt : null,
    ignored: Array.isArray(s?.ignored) ? s.ignored.filter((x): x is string => typeof x === 'string') : [],
  }
}
function saveStored(patch: Partial<Stored>): Stored {
  const next = { ...loadStored(), ...patch }
  // Old dismissals stop mattering once their emails fall out of the search.
  next.ignored = next.ignored.slice(-2000)
  writeJson(LETTER_MAIL_KEY, next)
  return next
}
const ignore = (key: string) => saveStored({ ignored: [...new Set([...loadStored().ignored, key])] })

/** The newest emails read per check. A season's portal mail is well under this. */
const MAX_MESSAGES = 500
/** Emails already read this session — a second check only fetches what's new. */
const cache = new Map<string, MessageText>()

async function eachLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) await fn(items[next++])
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

const REVIEW_STATUSES: LetterStatus[] = ['agreed', 'invitation_sent', 'reminded', 'received', 'declined']

/** The local calendar day, in the planner's date style. */
const shortDate = (ms: number) => {
  const d = new Date(ms)
  return formatDeadline(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
}

interface Result {
  account: string
  scanned: number
  since: Date
  applied: LetterUpdate[]
  review: LetterFinding[]
  upToDate: number
}

function MailLink({ f, account }: { f: LetterFinding; account: string }) {
  return (
    <a
      href={gmailThreadUrl(f.threadId, account)}
      target="_blank"
      rel="noreferrer"
      className="whitespace-nowrap text-indigo-600 hover:underline"
      title={`${f.subject}\nFrom ${f.from}`}
    >
      {shortDate(f.sentAt)} · open in Gmail ↗
    </a>
  )
}

function ReviewCard({
  f,
  account,
  state,
  labelOf,
  planner,
  onDone,
}: {
  f: LetterFinding
  account: string
  state: PlannerState
  labelOf: (pid: string) => string
  planner: PlannerApi
  onDone: (applied: number) => void
}) {
  const [recId, setRecId] = useState(f.recId ?? '')
  const [status, setStatus] = useState<LetterStatus>(f.status)
  const finding = { ...f, recId: recId || null, status }
  const can = (pid: string) => !!recId && actionable(finding, pid, state, new Set())
  const [picked, setPicked] = useState<Set<string>>(() => new Set(f.likely.filter((pid) => actionable(f, pid, state, new Set()))))
  const chosen = [...picked].filter(can)
  const writerName = state.recommenders.find((r) => r.id === recId)?.name || 'this writer'

  const apply = () => {
    for (const pid of chosen) {
      if (letterStatusOf(state, pid, recId) === undefined) planner.assignLetters(recId, [pid])
      planner.setLetterStatus(pid, recId, status)
    }
    // I've decided what this email means; the programs I left unticked stay as they are.
    ignore(ignoreKey(f.messageId))
    onDone(chosen.length)
  }

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[11.5px]">
        <span className="min-w-0 font-medium text-slate-700 [overflow-wrap:anywhere]">
          {f.source === 'writer' ? `${writerName} wrote: ` : ''}
          {f.subject || '(no subject)'}
        </span>
        <MailLink f={f} account={account} />
      </div>
      <p className="mt-0.5 text-[11.5px] italic leading-relaxed text-slate-500 [overflow-wrap:anywhere]">“{f.evidence}”</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]">
        {f.recId ? (
          <span className="font-medium text-slate-700">{writerName}</span>
        ) : (
          <select
            value={recId}
            onChange={(e) => setRecId(e.target.value)}
            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11.5px] text-slate-700 focus:border-indigo-400 focus:outline-none"
          >
            <option value="">Which writer?</option>
            {state.recommenders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name || 'Unnamed writer'}
              </option>
            ))}
          </select>
        )}
        <span className="text-slate-400">→</span>
        <StatusSelect value={status} options={REVIEW_STATUSES} labels={LETTER_LABELS} tones={LETTER_TONES} onChange={setStatus} />
      </div>
      <ul className="mt-1 space-y-0.5">
        {f.programIds.map((pid) => {
          const cur = recId ? letterStatusOf(state, pid, recId) : undefined
          const ok = can(pid)
          return (
            <li key={pid}>
              <label className={`flex items-center gap-2 text-[11.5px] ${ok ? 'text-slate-700' : 'text-slate-400'}`}>
                <input
                  type="checkbox"
                  disabled={!ok}
                  checked={ok && picked.has(pid)}
                  onChange={() =>
                    setPicked((prev) => {
                      const next = new Set(prev)
                      if (next.has(pid)) next.delete(pid)
                      else next.add(pid)
                      return next
                    })
                  }
                />
                <span className="[overflow-wrap:anywhere]">{labelOf(pid)}</span>
                <span className="text-[10.5px] text-slate-400">
                  {!recId
                    ? ''
                    : cur === undefined
                      ? f.unassigned.includes(pid)
                        ? `${writerName} isn’t on this program — applying adds them`
                        : 'not on this program'
                      : movesForward(cur, status)
                        ? `now ${LETTER_LABELS[cur]}`
                        : `already ${LETTER_LABELS[cur]}`}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={apply}
          disabled={chosen.length === 0}
          className="rounded border border-emerald-300 bg-white px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
        >
          Apply{chosen.length > 1 ? ` to ${chosen.length}` : ''}
        </button>
        <button
          onClick={() => {
            ignore(ignoreKey(f.messageId))
            onDone(0)
          }}
          className="text-[11.5px] text-slate-500 hover:underline"
          title="Hide this email from future checks"
        >
          Ignore
        </button>
      </div>
    </li>
  )
}

export function LetterMailSync({
  state,
  pool,
  planner,
}: {
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
}) {
  const [running, setRunning] = useState<{ message: string; done?: number; total?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [undone, setUndone] = useState<Set<string>>(new Set())
  const [checkedAt, setCheckedAt] = useState(() => loadStored().checkedAt)
  // The check is async; read the plan as it is when the mail comes back.
  const latest = useRef(state)
  latest.current = state
  const alive = useRef(true)
  useEffect(() => {
    // Set here as well as above: React may mount, unmount and mount again.
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const labelOf = (pid: string) => {
    const p = state.programs.find((x) => x.id === pid)
    if (!p) return 'Removed program'
    const id = programIdentity(p, resolveProgram(p, pool.byId))
    return `${id.university} — ${programLabel(id.programName, id.degree)}`
  }
  const nameOf = (rid: string) => state.recommenders.find((r) => r.id === rid)?.name || 'Unnamed writer'

  const run = async () => {
    setError(null)
    setResult(null)
    setUndone(new Set())
    setRunning({ message: 'Connecting to Gmail…' })
    try {
      const since = mailSince(latest.current.settings.cycle)
      const { account, mails } = await withToken(true, async () => {
        const profile = await getProfile()
        setRunning({ message: 'Searching your mail…' })
        const query = letterMailQuery(
          since,
          latest.current.recommenders.map((r) => r.email),
        )
        const stubs = await listMessages(query, MAX_MESSAGES)
        const fresh = stubs.filter((m) => !cache.has(m.id))
        let done = 0
        setRunning({ message: 'Reading emails', done, total: fresh.length })
        await eachLimit(fresh, 6, async (m) => {
          try {
            cache.set(m.id, await getMessageText(m.id))
          } catch {
            /* one unreadable email doesn't stop the rest */
          } finally {
            done++
            if (alive.current) setRunning({ message: 'Reading emails', done, total: fresh.length })
          }
        })
        return {
          account: profile.emailAddress,
          mails: stubs.map((m) => cache.get(m.id)).filter((m): m is MessageText => !!m),
        }
      })
      if (!alive.current) return
      const s = latest.current
      const ctx = mailContext(s, pool.byId)
      const findings = mails.flatMap((m) => readLetterMail(m, ctx, account))
      const plan = planLetterUpdates(findings, s, new Set(loadStored().ignored))
      for (const u of plan.updates) planner.setLetterStatus(u.programId, u.recId, u.to)
      const at = new Date().toISOString()
      saveStored({ checkedAt: at })
      setCheckedAt(at)
      setResult({ account, scanned: mails.length, since, applied: plan.updates, review: plan.review, upToDate: plan.upToDate })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(
        /Gmail API error 403/.test(msg)
          ? 'Gmail refused the request (403). Turn on the Gmail API for your Google Cloud project, or reconnect Google in Settings so this site may read your mail.'
          : msg,
      )
    } finally {
      if (alive.current) setRunning(null)
    }
  }

  const undo = (u: LetterUpdate) => {
    planner.setLetterStatus(u.programId, u.recId, u.from)
    ignore(ignoreKey(u.finding.messageId, u.programId, u.recId))
    setUndone((prev) => new Set(prev).add(`${u.programId}|${u.recId}`))
  }

  const dropReview = (f: LetterFinding) =>
    setResult((r) => (r ? { ...r, review: r.review.filter((x) => x !== f) } : r))

  const btn =
    'rounded bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40'

  return (
    <section className="mb-3 rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 max-w-xl">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Letter updates from Gmail</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
            Reads the emails application portals send you — request sent, reminder sent, letter received, writer declined —
            and moves each letter forward. Never backwards: a status you set by hand stays unless an email shows a later
            step. Anything it can’t pin to one writer and one program is listed for you to decide. Your mail is read in
            this browser and sent nowhere.
          </p>
          {checkedAt && !running && (
            <p className="mt-0.5 text-[11px] text-slate-400">
              Last checked {new Date(checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </p>
          )}
        </div>
        <button onClick={() => void run()} disabled={!!running} className={btn}>
          {running ? 'Checking…' : 'Check Gmail now'}
        </button>
      </div>

      {running && (
        <div className="mt-2">
          {running.total ? (
            <div className="h-1 overflow-hidden rounded bg-slate-100">
              <div
                className="h-full bg-indigo-500 transition-all"
                style={{ width: `${Math.round(((running.done ?? 0) / running.total) * 100)}%` }}
              />
            </div>
          ) : null}
          <p className="mt-1 text-[11.5px] font-medium text-indigo-600">
            {running.message}
            {running.total ? ` · ${running.done} of ${running.total}` : ''}
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-[11.5px] font-medium text-rose-600 [overflow-wrap:anywhere]">{error}</p>}

      {result && (
        <div className="mt-2.5 border-t border-slate-100 pt-2">
          <p className="text-[11.5px] text-slate-500">
            Read {result.scanned} email{result.scanned === 1 ? '' : 's'} since {shortDate(result.since.getTime())}
            {result.scanned >= MAX_MESSAGES ? ' (the newest only)' : ''}.{' '}
            {result.applied.length === 0 && result.review.length === 0
              ? `Nothing new${result.upToDate > 0 ? ` — the ${result.upToDate} that mention your letters match what the plan already shows` : ''}.`
              : [
                  result.applied.length > 0 && `${result.applied.length} letter${result.applied.length === 1 ? '' : 's'} updated`,
                  result.review.length > 0 && `${result.review.length} to look at`,
                  result.upToDate > 0 && `${result.upToDate} already up to date`,
                ]
                  .filter(Boolean)
                  .join(' · ') + '.'}
          </p>

          {result.applied.length > 0 && (
            <>
              <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Updated</div>
              <ul className="mt-0.5 divide-y divide-slate-100 rounded border border-emerald-100 bg-emerald-50/30 px-2.5">
                {result.applied.map((u) => {
                  const off = undone.has(`${u.programId}|${u.recId}`)
                  return (
                    <li key={`${u.programId}|${u.recId}`} className={`py-1.5 ${off ? 'opacity-50' : ''}`}>
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11.5px]">
                        <span className="min-w-0 [overflow-wrap:anywhere]">
                          <span className="font-medium text-slate-800">{nameOf(u.recId)}</span>
                          <span className="text-slate-500"> · {labelOf(u.programId)}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <StatusChip label={LETTER_LABELS[u.from]} tone={LETTER_TONES[u.from]} />
                          <span className="text-slate-400">→</span>
                          <StatusChip label={LETTER_LABELS[u.to]} tone={LETTER_TONES[u.to]} />
                          {off ? (
                            <span className="ml-1 text-[11px] text-slate-500">undone</span>
                          ) : (
                            <button onClick={() => undo(u)} className="ml-1 text-[11px] text-slate-500 hover:text-rose-600 hover:underline">
                              undo
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-3 text-[11px]">
                        <span className="min-w-0 italic text-slate-500 [overflow-wrap:anywhere]">“{u.finding.evidence}”</span>
                        <MailLink f={u.finding} account={result.account} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {result.review.length > 0 && (
            <>
              <div className="mt-2.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                For you to decide
              </div>
              <p className="text-[11px] text-slate-500">
                These fit more than one program, name no writer, or come from a writer directly — check the email, then apply
                or ignore.
              </p>
              <ul className="mt-1 divide-y divide-slate-100 rounded border border-amber-200 bg-amber-50/30 px-2.5">
                {result.review.map((f) => (
                  <ReviewCard
                    key={`${f.messageId}|${f.recId ?? ''}`}
                    f={f}
                    account={result.account}
                    state={state}
                    labelOf={labelOf}
                    planner={planner}
                    onDone={() => dropReview(f)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
