// The program's core curriculum: paste its page, get a summary, keep it if it
// reads right. As everywhere in the planner, nothing is saved until I accept
// it, and whatever the page didn't bear out says so.

import { useEffect, useRef, useState } from 'react'
import type { Curriculum, CurriculumClaim, CurriculumCourse } from '../types'
import { coursesWithoutNames, getProvider, isPageLink, unconfirmedCount } from '../lib/research'
import type { CurriculumPage } from '../lib/research'

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

/** Where a name came from, when it wasn't the page. */
function NameFrom({ source }: { source: CurriculumCourse['nameSource'] }) {
  if (!source || !/^https?:\/\//i.test(source.url)) return null
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      title={`The page gave only the number. This name is printed beside it at “${source.title}”.`}
      className="ml-1.5 whitespace-nowrap text-[10px] text-indigo-500 hover:underline"
    >
      looked up ↗
    </a>
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
                    {course.title || <span className="italic text-slate-400">name not given</span>}
                    <NameFrom source={course.nameSource} />
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
  website,
  onSave,
}: {
  value: Curriculum | null
  university: string
  programName: string
  degree: string | null
  website: string
  onSave: (next: Curriculum | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState<Curriculum | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [note, setNote] = useState('')
  /** The draft's page, for looking names up without reading it again. */
  const pageRef = useRef<CurriculumPage | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const provider = getProvider()
  const ready = provider.available()
  const running = progress !== null
  const asking = !draft && (editing || !value)
  const typed = input.trim()
  const shown = draft ?? (asking ? null : value)
  const nameless = shown ? coursesWithoutNames(shown).length : 0

  /** One cancellable piece of work, with its progress shown. */
  const work = async (job: (signal: AbortSignal) => Promise<void>) => {
    const ctrl = new AbortController()
    abort.current = ctrl
    setError(null)
    setNote('')
    setProgress('Starting…')
    try {
      await job(ctrl.signal)
    } catch (e) {
      if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProgress(null)
    }
  }

  const addNames = async (curriculum: Curriculum, page: CurriculumPage, signal: AbortSignal) => {
    setProgress('Looking up course names…')
    const named = await provider.findCourseNames({ university, website, curriculum, page }, setProgress, signal)
    if (signal.aborted) return
    if (named.found > 0) setDraft(named.curriculum)
    setNote(named.note)
  }

  const run = () =>
    work(async (signal) => {
      const { curriculum, page } = await provider.summarizeCurriculum(
        { university, programName, degree, page: input },
        setProgress,
        signal,
      )
      if (signal.aborted) return
      pageRef.current = page
      // Shown first, so stopping the lookup keeps the summary.
      setDraft(curriculum)
      if (coursesWithoutNames(curriculum).length > 0) await addNames(curriculum, page, signal)
    })

  const findNames = (curriculum: Curriculum) =>
    work((signal) => {
      const page = (draft && pageRef.current) || { url: curriculum.source?.url ?? '', markdown: '' }
      return addNames(curriculum, page, signal)
    })

  const close = () => {
    setNote('')
    pageRef.current = null
    setDraft(null)
    setEditing(false)
    setInput('')
    setError(null)
  }

  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Core curriculum</h2>
        {value && !asking && !draft && !running && (
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
                    setNote('')
                    setError(null)
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
                  : 'Pasted text: sent to the model as it is, and not stored.'}{' '}
                Course numbers without names are looked up on the university’s site.
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
                disabled={running}
                className="rounded border border-emerald-300 bg-white px-3 py-1 text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
              >
                Save to the plan
              </button>
              {/* Back to the box with what was pasted still in it, or, when only
                  names were looked up, to the saved summary. */}
              <button
                onClick={() => {
                  if (!typed) return close()
                  setDraft(null)
                  setNote('')
                  setError(null)
                  setEditing(true)
                }}
                disabled={running}
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

      {shown && (running || nameless > 0 || note || error) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
          {running ? (
            <>
              <span className="font-medium text-indigo-600">{progress}</span>
              <button onClick={() => abort.current?.abort()} className={btn}>
                Stop
              </button>
            </>
          ) : (
            nameless > 0 && (
              <button
                onClick={() => void findNames(shown)}
                disabled={!ready}
                title={ready ? 'Checks the linked catalog, then searches the university’s site' : provider.unavailableReason()}
                className={btn}
              >
                Find {nameless} course name{nameless === 1 ? '' : 's'}
              </button>
            )
          )}
          {!running && note && <span className="text-slate-500 [overflow-wrap:anywhere]">{note}</span>}
          {error && <span className="text-rose-600 [overflow-wrap:anywhere]">{error}</span>}
        </div>
      )}
    </section>
  )
}
