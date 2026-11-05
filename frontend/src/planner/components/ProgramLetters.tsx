// The recommendation letters for one program: who is writing, and where each
// letter stands. Writers are picked from the ones entered on the Letter
// Writers page, or added right here.

import { useState } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { PlannerProgram, PlannerState } from '../types'
import type { PlannerApi } from '../lib/usePlanner'
import { LETTER_LABELS, LETTER_ORDER, LETTER_TONES } from '../lib/labels'
import { letterSummary, lettersOf } from '../lib/letters'
import { StatusSelect } from './StatusChip'
import { RecommenderForm } from './RecommenderForm'

export function ProgramLetters({
  entry,
  state,
  planner,
}: {
  entry: PlannerProgram
  state: PlannerState
  planner: PlannerApi
}) {
  const [adding, setAdding] = useState(false)
  const letters = lettersOf(entry)
  const byId = new Map(state.recommenders.map((r) => [r.id, r]))
  const assigned = new Set(letters.map((l) => l.recommenderId))
  const unassigned = state.recommenders.filter((r) => !assigned.has(r.id))
  const sum = letterSummary(entry)

  return (
    <section className="mt-3 rounded-lg border border-slate-200 bg-white p-3.5">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recommendation letters</h2>
          <span className={`text-[11px] ${sum.complete ? 'font-medium text-emerald-700' : 'text-slate-500'}`}>
            {sum.target > 0 ? `${sum.received} of ${sum.target} received` : 'no writers yet'}
            {sum.required != null
              ? ` · program asks for ${sum.required}`
              : ' · how many the program asks for is unknown (set it under Admissions)'}
          </span>
        </div>
        <button
          onClick={() => navigate('/planner/letters')}
          className="text-[11px] text-slate-500 hover:text-indigo-700 hover:underline"
          title="Every letter writer, their details, and all their letters"
        >
          All letter writers →
        </button>
      </div>

      {sum.required != null && sum.active < sum.required && (
        <p className="mb-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11.5px] text-amber-800">
          The program asks for {sum.required} letter{sum.required === 1 ? '' : 's'}; {sum.active} writer
          {sum.active === 1 ? ' is' : 's are'} lined up.
        </p>
      )}

      {letters.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {letters.map((l) => {
            const r = byId.get(l.recommenderId)
            const who = [r?.title, r?.institution].filter(Boolean).join(', ')
            return (
              <li key={l.recommenderId} className="flex items-start justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-slate-800">{r?.name ?? 'Unknown writer'}</div>
                  <div className="text-[11px] text-slate-500 [overflow-wrap:anywhere]">
                    {[who, r?.relationship].filter(Boolean).join(' · ')}
                    {r?.email && (
                      <>
                        {(who || r.relationship) && ' · '}
                        <a href={`mailto:${r.email}`} className="text-indigo-600 hover:underline">
                          {r.email}
                        </a>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[10.5px] text-slate-400" title="When this status was last changed">
                    {l.updatedAt.slice(0, 10)}
                  </span>
                  <StatusSelect
                    value={l.status}
                    options={LETTER_ORDER}
                    labels={LETTER_LABELS}
                    tones={LETTER_TONES}
                    onChange={(s) => planner.setLetterStatus(entry.id, l.recommenderId, s)}
                    title="Where this letter stands"
                  />
                  <button
                    onClick={() => planner.unassignLetter(entry.id, l.recommenderId)}
                    title={`Take ${r?.name ?? 'this writer'} off this program (they stay in your letter writers)`}
                    aria-label={`Remove ${r?.name ?? 'writer'} from this program`}
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

      {adding ? (
        <div className="mt-2">
          <RecommenderForm
            saveLabel="Add and assign to this program"
            onCancel={() => setAdding(false)}
            onSave={(input) => {
              const id = planner.addRecommender(input)
              planner.assignLetters(id, [entry.id])
              setAdding(false)
            }}
          />
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {unassigned.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && planner.assignLetters(e.target.value, [entry.id])}
              className="max-w-xs rounded border border-slate-300 bg-white px-1.5 py-1 text-[11.5px] text-slate-700 focus:border-indigo-400 focus:outline-none"
            >
              <option value="">+ Add one of my letter writers…</option>
              {unassigned.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {r.institution ? ` — ${r.institution}` : ''}
                </option>
              ))}
            </select>
          )}
          {unassigned.length > 1 && (
            <button
              onClick={() => {
                for (const r of unassigned) planner.assignLetters(r.id, [entry.id])
              }}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
            >
              Add all {unassigned.length}
            </button>
          )}
          <button
            onClick={() => setAdding(true)}
            className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
          >
            + New letter writer
          </button>
          {state.recommenders.length === 0 && (
            <span className="text-[11px] text-slate-400">
              Enter each writer once; then pick them for every program they write for.
            </span>
          )}
        </div>
      )}
    </section>
  )
}
