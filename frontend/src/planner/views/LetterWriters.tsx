// Everyone writing me a recommendation letter: their details, typed in once,
// and every program they write for with where that letter stands — the view to
// open before chasing someone, since it answers "what do I still need from
// them, and by when?" in one place.

import { useState } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { PlannerProgram, PlannerState, Recommender } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'
import { programIdentity, resolveProgram } from '../lib/referenceBridge'
import { daysUntil, deadlineLabel, resolveDeadline } from '../lib/deadlines'
import { LETTER_LABELS, LETTER_ORDER, LETTER_TONES } from '../lib/labels'
import { isLetterIn, lettersOf } from '../lib/letters'
import { programLabel } from '../lib/exportRows'
import { downloadLetterChecklist } from '../lib/letterChecklist'
import { StatusSelect } from '../components/StatusChip'
import { RecommenderForm } from '../components/RecommenderForm'

const field =
  'w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-[12.5px] text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:bg-white focus:outline-none'

/** Programs that still need letters: not dropped, not withdrawn. */
const stillApplying = (p: PlannerProgram) => p.interest !== 'drop' && p.status !== 'withdrawn'

function WriterCard({
  rec,
  state,
  pool,
  planner,
}: {
  rec: Recommender
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Every program listing this writer, soonest deadline first.
  const rows = state.programs
    .map((p) => {
      const letter = lettersOf(p).find((l) => l.recommenderId === rec.id)
      if (!letter) return null
      const live = resolveProgram(p, pool.byId)
      const id = programIdentity(p, live)
      const deadline = resolveDeadline(p.admissions.deadline, live?.requirements.deadline)
      return { p, letter, id, deadline, iso: deadline.kind === 'dated' ? deadline.iso : null }
    })
    .filter((r): r is NonNullable<typeof r> => !!r)
    .sort((a, b) => {
      if (a.iso && b.iso) return a.iso.localeCompare(b.iso)
      if (a.iso) return -1
      if (b.iso) return 1
      return a.id.university.localeCompare(b.id.university)
    })

  const active = rows.filter((r) => r.letter.status !== 'declined')
  const received = active.filter((r) => isLetterIn(r.letter.status)).length
  const nextDue = active.find((r) => !isLetterIn(r.letter.status) && r.iso && daysUntil(r.iso) >= 0)
  const missing = state.programs.filter((p) => stillApplying(p) && !lettersOf(p).some((l) => l.recommenderId === rec.id))

  const set = (k: keyof Recommender) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    planner.updateRecommender(rec.id, { [k]: e.target.value })

  const checklist = async () => {
    setBusy(true)
    setError(null)
    try {
      await downloadLetterChecklist(
        active.map((r) => ({
          university: r.id.university,
          program: programLabel(r.id.programName, r.id.degree),
          deadlineIso: r.iso,
          deadlineNote:
            r.deadline.kind === 'rolling' ? 'Rolling' : r.deadline.kind === 'paused' ? 'Paused' : 'To be confirmed',
          submitted: isLetterIn(r.letter.status),
        })),
        { cycle: state.settings.cycle, preparedAt: new Date(), recommender: rec.name.trim() || undefined },
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const btn =
    'rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700 disabled:opacity-50'

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <input
          value={rec.name}
          onChange={set('name')}
          placeholder="Name"
          className={`${field} max-w-sm font-serif text-[15px] font-bold`}
        />
        <div className="flex items-center gap-2 text-[11.5px]">
          <span className={received === active.length && active.length > 0 ? 'font-medium text-emerald-700' : 'text-slate-500'}>
            {received} of {active.length} received
            {nextDue?.iso && ` · next due ${deadlineLabel(nextDue.deadline)}`}
          </span>
          {confirmDelete ? (
            <span className="flex items-center gap-1.5">
              <span className="text-rose-700">Delete, and remove from every program?</span>
              <button
                onClick={() => planner.removeRecommender(rec.id)}
                className="rounded bg-rose-600 px-2 py-0.5 font-semibold text-white hover:bg-rose-700"
              >
                Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-slate-500 hover:underline">
                cancel
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-slate-400 hover:text-rose-600">
              delete
            </button>
          )}
        </div>
      </div>

      <div className="mt-1 grid gap-x-3 gap-y-0.5 sm:grid-cols-2">
        {(
          [
            ['title', 'Title'],
            ['institution', 'Institution'],
            ['email', 'Email'],
            ['relationship', 'Relationship'],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
            <input value={rec[k]} onChange={set(k)} placeholder="—" className={field} />
          </label>
        ))}
        <label className="flex items-start gap-2 sm:col-span-2">
          <span className="mt-1 w-20 shrink-0 text-[11px] font-medium text-slate-500">Notes</span>
          <textarea
            value={rec.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="What you sent them, what they asked for, when to follow up…"
            className={`${field} resize-y`}
          />
        </label>
      </div>

      <div className="mt-2.5 border-t border-slate-100 pt-2">
        {rows.length === 0 ? (
          <p className="py-1 text-[12px] text-slate-400">Not assigned to any program yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ p, letter, id, deadline, iso }) => {
              const left = iso ? daysUntil(iso) : null
              return (
                <li key={p.id} className="flex items-start justify-between gap-3 py-1.5">
                  <button onClick={() => navigate(`/planner/programs/${p.id}`)} className="min-w-0 text-left">
                    <span className="text-[12.5px] font-medium text-slate-800 hover:text-indigo-700 hover:underline">
                      {id.university}
                    </span>
                    <span className="ml-1.5 text-[11.5px] text-slate-500">{programLabel(id.programName, id.degree)}</span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`whitespace-nowrap text-[11px] tabular-nums ${
                        !iso
                          ? 'italic text-amber-700'
                          : !isLetterIn(letter.status) && left != null && left < 0
                            ? 'text-rose-600'
                            : !isLetterIn(letter.status) && left != null && left <= 7
                              ? 'text-amber-700'
                              : 'text-slate-500'
                      }`}
                    >
                      {deadlineLabel(deadline)}
                    </span>
                    <StatusSelect
                      value={letter.status}
                      options={LETTER_ORDER}
                      labels={LETTER_LABELS}
                      tones={LETTER_TONES}
                      onChange={(s) => planner.setLetterStatus(p.id, rec.id, s)}
                    />
                    <button
                      onClick={() => planner.unassignLetter(p.id, rec.id)}
                      title="Take this writer off this program"
                      aria-label="Remove from this program"
                      className="rounded px-1.5 py-0.5 text-[13px] leading-none text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {missing.length > 0 && (
            <>
              <select
                value=""
                onChange={(e) => e.target.value && planner.assignLetters(rec.id, [e.target.value])}
                className="max-w-xs rounded border border-slate-300 bg-white px-1.5 py-1 text-[11.5px] text-slate-700 focus:border-indigo-400 focus:outline-none"
              >
                <option value="">+ Add to a program…</option>
                {missing.map((p) => {
                  const id = programIdentity(p, resolveProgram(p, pool.byId))
                  return (
                    <option key={p.id} value={p.id}>
                      {id.university} — {id.programName}
                    </option>
                  )
                })}
              </select>
              <button onClick={() => planner.assignLetters(rec.id, missing.map((p) => p.id))} className={btn}>
                Add to all my programs ({missing.length})
              </button>
            </>
          )}
          <button
            onClick={() => void checklist()}
            disabled={busy || active.length === 0}
            className={btn}
            title={`An Excel checklist of ${rec.name || 'this writer'}’s programs and deadlines to send them, with the letters already received ticked`}
          >
            {busy ? 'Preparing…' : 'Checklist for this writer (Excel)'}
          </button>
          {error && <span className="text-[11px] text-rose-600">{error}</span>}
        </div>
      </div>
    </section>
  )
}

export function LetterWritersView({
  state,
  pool,
  planner,
}: {
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
}) {
  const [adding, setAdding] = useState(false)
  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-5 py-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-lg font-bold text-slate-900">Letter Writers</h1>
            <p className="text-[12.5px] text-slate-600">
              The people writing your recommendation letters, and where each letter stands for every program.
            </p>
          </div>
          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="shrink-0 rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700"
            >
              + Add letter writer
            </button>
          )}
        </div>

        {adding && (
          <div className="mb-3">
            <RecommenderForm
              onCancel={() => setAdding(false)}
              onSave={(input) => {
                planner.addRecommender(input)
                setAdding(false)
              }}
            />
          </div>
        )}

        {state.recommenders.length === 0 && !adding ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="font-serif text-[15px] font-bold text-slate-800">No letter writers yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-slate-600">
              Add each person once — name, title, email, how they know you. Then attach them to your programs here or
              on each program’s page, and track every letter from Asked to Received.
            </p>
            <button
              onClick={() => setAdding(true)}
              className="mt-3 rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700"
            >
              + Add letter writer
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {state.recommenders.map((r) => (
              <WriterCard key={r.id} rec={r} state={state} pool={pool} planner={planner} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
