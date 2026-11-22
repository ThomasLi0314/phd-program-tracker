// The program's core curriculum: paste its page, get a summary, keep it if it
// reads right. As everywhere in the planner, nothing is saved until I accept
// it, and whatever the page didn't bear out says so.

import { useEffect, useRef, useState } from 'react'
import type { Curriculum, CurriculumClaim } from '../types'
import { getProvider, isPageLink, unconfirmedCount } from '../lib/research'

const btn =
  'rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50'

function NotOnPage() {
  return (
    <span
      className="ml-1.5 whitespace-nowrap rounded-full border border-rose-300 bg-rose-50 px-1.5 py-px text-[9.5px] font-medium text-rose-700"
      title="This couldn’t be matched to the page’s own words. Check it before relying on it."
    >
      not found on page
    </span>
  )
}

/** A checked statement; hover shows the words it rests on. */
function Claim({ claim }: { claim: CurriculumClaim }) {
  return (
    <>
      <span title={claim.quote ? `From the page: “${claim.quote}”` : undefined}>{claim.text}</span>
      {!claim.onPage && <NotOnPage />}
    </>
  )
}

function Summary({ value }: { value: Curriculum }) {
  const unconfirmed = unconfirmedCount(value)
  const { source } = value
  return (
    <div className="text-[12.5px] leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
      {(value.appliesTo || value.totalCredits) && (
        <p className="text-[11.5px] text-slate-500">
          {value.appliesTo && <span className="font-medium text-slate-700">{value.appliesTo}</span>}
          {value.appliesTo && value.totalCredits && ' · '}
          {value.totalCredits && <Claim claim={value.totalCredits} />}
        </p>
      )}
      {value.overview && <p className="mt-1">{value.overview}</p>}

      {value.groups.map((group, i) => (
        <div key={i} className="mt-2.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-[12px] font-semibold text-slate-800">{group.title}</h3>
            {group.core && (
              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-px text-[9.5px] font-medium text-indigo-700">
                core
              </span>
            )}
            {group.rule && (
              <span className="text-[11.5px] text-slate-500">
                <Claim claim={group.rule} />
              </span>
            )}
          </div>
          {group.courses.length > 0 && (
            <ul className="mt-1 divide-y divide-slate-100 rounded border border-slate-200 bg-white px-2">
              {group.courses.map((course, j) => (
                <li key={j} className="flex items-baseline gap-2 py-1 text-[12px]">
                  {course.code && <span className="w-24 shrink-0 font-medium text-slate-800">{course.code}</span>}
                  <span className="min-w-0 flex-1">
                    {course.title}
                    {!course.onPage && <NotOnPage />}
                  </span>
                  {course.credits && (
                    <span className="shrink-0 tabular-nums text-slate-500">
                      {course.credits}
                      {/^[\d.–-]+$/.test(course.credits) && ' cr'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      {value.requirements.length > 0 && (
        <div className="mt-2.5">
          <h3 className="text-[12px] font-semibold text-slate-800">Other requirements</h3>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-[12px]">
            {value.requirements.map((r, i) => (
              <li key={i}>
                <Claim claim={r} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {(unconfirmed > 0 || value.truncated) && (
        <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
          {unconfirmed > 0 &&
            `${unconfirmed} item${unconfirmed === 1 ? '' : 's'} couldn’t be matched to the page — marked above. `}
          {value.truncated && 'The page was too long to read whole, so anything near its end may be missing.'}
        </p>
      )}

      <p className="mt-2 text-[10.5px] text-slate-400">
        AI summary of{' '}
        {source && /^https?:\/\//i.test(source.url) ? (
          <a href={source.url} target="_blank" rel="noreferrer" className="text-indigo-500 hover:underline">
            {source.title || source.url} ↗
          </a>
        ) : (
          'text you pasted'
        )}{' '}
        · {value.summarizedAt.slice(0, 10)} · hover a rule or requirement for the page’s words
      </p>
    </div>
  )
}

export function CurriculumSection({
  value,
  university,
  programName,
  degree,
  onSave,
}: {
  value: Curriculum | null
  university: string
  programName: string
  degree: string | null
  onSave: (next: Curriculum | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState<Curriculum | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const provider = getProvider()
  const ready = provider.available()
  const running = progress !== null
  const asking = !draft && (editing || !value)
  const typed = input.trim()

  const run = async () => {
    const ctrl = new AbortController()
    abort.current = ctrl
    setError(null)
    setProgress('Starting…')
    try {
      const result = await provider.summarizeCurriculum(
        { university, programName, degree, page: input },
        setProgress,
        ctrl.signal,
      )
      if (!ctrl.signal.aborted) setDraft(result)
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProgress(null)
    }
  }

  const close = () => {
    setDraft(null)
    setEditing(false)
    setInput('')
    setError(null)
  }

  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Core curriculum</h2>
        {value && !asking && !draft && (
          <div className="flex items-center gap-2 text-[11px]">
            {confirmRemove ? (
              <>
                <span className="text-rose-700">Remove this summary?</span>
                <button
                  onClick={() => {
                    onSave(null)
                    setConfirmRemove(false)
                    close()
                  }}
                  className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700"
                >
                  Remove
                </button>
                <button onClick={() => setConfirmRemove(false)} className="text-slate-500 hover:underline">
                  cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setInput(value.source?.url ?? '')
                    setEditing(true)
                  }}
                  className={btn}
                >
                  Summarize again
                </button>
                <button onClick={() => setConfirmRemove(true)} className="text-slate-400 hover:text-rose-600">
                  remove
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {asking && (
        <div>
          <label className="block">
            <span className="text-[12px] text-slate-600">
              Paste the link to the curriculum or degree-requirements page — or, if it needs a login, copy all of the
              page and paste the text.
            </span>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={running}
              rows={typed && !isPageLink(typed) ? 8 : 2}
              placeholder="https://… or the page’s text"
              className="mt-1.5 w-full resize-y rounded border border-slate-300 px-2 py-1.5 text-[12px] text-slate-800 focus:border-indigo-400 focus:outline-none disabled:bg-slate-50"
            />
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void run()}
              disabled={!ready || running || !typed}
              className="rounded bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {running ? 'Working…' : 'Summarize curriculum'}
            </button>
            {running ? (
              <button onClick={() => abort.current?.abort()} className={btn}>
                Stop
              </button>
            ) : (
              value && (
                <button onClick={close} className={btn}>
                  Cancel
                </button>
              )
            )}
            {progress && <span className="text-[11.5px] font-medium text-indigo-600">{progress}</span>}
            {!running && typed && (
              <span className="text-[10.5px] text-slate-400">
                {isPageLink(typed)
                  ? 'A link: the page will be read for you.'
                  : 'Pasted text: sent to the model as it is, and not stored.'}
              </span>
            )}
          </div>
          {!ready && (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-900">
              {provider.unavailableReason()}
            </p>
          )}
          {error && <p className="mt-2 text-[11.5px] text-rose-600 [overflow-wrap:anywhere]">{error}</p>}
        </div>
      )}

      {draft && (
        <div className="rounded border border-indigo-200 bg-indigo-50/40 p-2.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-indigo-700">
              Not saved yet{value ? ' — saving replaces your current summary' : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  onSave(draft)
                  close()
                }}
                className="rounded border border-emerald-300 bg-white px-3 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                Save to the plan
              </button>
              {/* Back to the box with what was pasted still in it. */}
              <button
                onClick={() => {
                  setDraft(null)
                  setEditing(true)
                }}
                className={btn}
              >
                Discard
              </button>
            </div>
          </div>
          <Summary value={draft} />
        </div>
      )}

      {!draft && !asking && value && <Summary value={value} />}
    </section>
  )
}
