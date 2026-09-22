// One programme in the master's plan: status, the dates and costs to plan
// around (mine where I typed them, the database's otherwise), what the
// database says about it, the document checklist, and my notes.

import { useState, type ReactNode } from 'react'
import { navigate } from '../../lib/hashRoute'
import { INTEREST_LABELS, INTEREST_ORDER } from '../../planner/lib/labels'
import { daysUntil, formatDeadline } from '../../planner/lib/deadlines'
import { StatusSelect } from '../../planner/components/StatusChip'
import type { CountryPolicy, EuroProgram } from '../types'
import { DetailCell, Fact, FieldChip, Flag, ScholarshipChip } from '../components/Bits'
import { isUnknown } from '../types'
import type { MastersPlanApi } from './useMastersPlan'
import { parseMastersDeadline, resolveEntry, type Resolved } from './resolve'
import {
  PAST_DEADLINE_STATUSES,
  SCHOLARSHIP_LABELS,
  SCHOLARSHIP_ORDER,
  STATUS_LABELS,
  STATUS_ORDER,
  type MastersPlanEntry,
  type MineValues,
} from './types'
import { Countdown, OriginTag, UNKNOWN_LABEL } from './PlanBits'

/** A value I can override. Empty input clears my value and the database's shows again. */
function EditableRow({
  label,
  r,
  country,
  placeholder,
  onSave,
  children,
}: {
  label: string
  r: Resolved
  country?: CountryPolicy
  placeholder: string
  onSave: (value: string | null) => void
  children?: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const commit = () => {
    onSave(draft.trim() ? draft.trim() : null)
    setEditing(false)
  }
  return (
    <div className="border-b border-slate-100 py-1.5 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 rounded border border-indigo-300 px-1.5 py-0.5 text-right text-[12px] text-slate-800 focus:outline-none"
          />
        ) : (
          <div className="flex min-w-0 items-baseline justify-end gap-1 text-right">
            <button
              onClick={() => {
                setDraft(r.text ?? '')
                setEditing(true)
              }}
              title={r.note ? `${r.note} — click to edit` : 'Click to edit'}
              className={`text-right text-[12.5px] hover:underline ${
                r.text ? 'font-medium text-slate-800' : 'italic text-amber-700'
              }`}
            >
              {r.text ?? UNKNOWN_LABEL}
            </button>
            <OriginTag r={r} country={country} />
            {r.source && r.origin !== 'mine' && (
              <a
                href={r.source}
                target="_blank"
                rel="noreferrer"
                title={`Source: ${r.source}`}
                className="text-[10px] text-slate-400 hover:text-indigo-600"
              >
                ↗
              </a>
            )}
            {r.origin === 'mine' && (
              <button
                onClick={() => onSave(null)}
                title="Clear my value — the database's value (if any) shows again"
                className="text-[10px] text-slate-300 hover:text-rose-600"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

export function PlanDetail({
  id,
  plan,
  byId,
  countries,
}: {
  id: string
  plan: MastersPlanApi
  byId: Map<string, EuroProgram>
  countries: Map<string, CountryPolicy>
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newItem, setNewItem] = useState('')
  const entry = plan.state.programs.find((e) => e.id === id)

  if (!entry) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-slate-400">
        That programme isn’t in your plan.
        <button onClick={() => navigate('/masters/plan')} className="ml-1 text-indigo-600 underline">
          Back to My plan
        </button>
      </main>
    )
  }

  const r = resolveEntry(entry, byId, countries)
  const live = r.live
  const settled = PAST_DEADLINE_STATUSES.includes(entry.status)
  const setMine = (key: keyof MineValues) => (v: string | null) => plan.setMine(entry.id, key, v)
  const done = entry.checklist.filter((c) => c.done).length
  const scholarshipParsed = parseMastersDeadline(r.scholarshipDeadline.text)

  const card = 'rounded-lg border border-slate-200 bg-white p-3.5'
  const heading = 'mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400'
  const small =
    'rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700 focus:border-indigo-400 focus:outline-none'
  const identity = (key: 'university' | 'programName' | 'city' | 'country', label: string) => (
    <label className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <span className="shrink-0 text-[11px] font-medium text-slate-500">{label}</span>
      <input
        value={entry[key]}
        onChange={(e) => plan.update(entry.id, { [key]: e.target.value } as Partial<MastersPlanEntry>)}
        className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 text-right text-[12.5px] text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
      />
    </label>
  )

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-5 py-4">
        <button onClick={() => navigate('/masters/plan')} className="mb-2 text-[11.5px] text-slate-500 hover:text-indigo-700">
          ← My plan
        </button>

        <header className="mb-3">
          <h1 className="font-serif text-xl font-bold leading-tight text-slate-900">{r.university}</h1>
          <p className="mt-0.5 text-[13.5px] text-slate-600">
            {r.programName}
            {entry.ref.kind === 'custom' && (
              <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800">
                custom entry
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[12px] text-slate-500">
            {r.countryPolicy && <Flag code={r.countryPolicy.code} />}
            {[r.city, r.country].filter(Boolean).join(', ')}
            {live && live.fields.length > 0 && (
              <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                {live.fields.map((f) => (
                  <FieldChip key={f} field={f} short />
                ))}
              </span>
            )}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {r.website && (
              <a
                href={r.website}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-indigo-700 hover:border-indigo-400"
              >
                Programme page ↗
              </a>
            )}
            {r.portal && (
              <a
                href={r.portal}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-indigo-700 hover:border-indigo-400"
              >
                Application portal ↗
              </a>
            )}
            {confirmDelete ? (
              <span className="flex items-center gap-1.5 text-[11.5px]">
                <span className="text-rose-700">Remove from your plan (checklist and notes too)?</span>
                <button
                  onClick={() => {
                    plan.remove(entry.id)
                    navigate('/masters/plan')
                  }}
                  className="rounded bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-700"
                >
                  Remove
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-slate-500 hover:underline">
                  cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-rose-600 hover:border-rose-300"
              >
                Remove from plan
              </button>
            )}
          </div>
        </header>

        <section className={`${card} mb-3`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Interest
              <StatusSelect
                value={entry.interest}
                options={INTEREST_ORDER}
                labels={INTEREST_LABELS}
                onChange={(v) => plan.update(entry.id, { interest: v })}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Application
              <StatusSelect
                value={entry.status}
                options={STATUS_ORDER}
                labels={STATUS_LABELS}
                onChange={(v) => plan.update(entry.id, { status: v })}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Scholarship
              <StatusSelect
                value={entry.scholarship}
                options={SCHOLARSHIP_ORDER}
                labels={SCHOLARSHIP_LABELS}
                onChange={(v) => plan.update(entry.id, { scholarship: v })}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Intake
              <input
                value={entry.intake}
                onChange={(e) => plan.update(entry.id, { intake: e.target.value })}
                className={`${small} w-24`}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Submitted on
              <input
                type="date"
                value={entry.submittedOn ?? ''}
                onChange={(e) => plan.update(entry.id, { submittedOn: e.target.value || null })}
                className={small}
              />
            </label>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className={card}>
            <h2 className={heading}>Dates &amp; costs</h2>
            <EditableRow label="Application deadline" r={r.deadline} placeholder="e.g. 31 January 2027" onSave={setMine('deadline')}>
              {r.deadline.text && (
                <div className="mt-0.5 text-right text-[10.5px] text-slate-500">
                  {r.deadline.parsed.kind === 'dated' && r.deadline.parsed.iso ? (
                    <>
                      read as {formatDeadline(r.deadline.parsed.iso)}
                      {r.deadline.parsed.yearInferred && ' (no year given — next occurrence assumed)'} ·{' '}
                      <Countdown parsed={r.deadline.parsed} settled={settled} />
                      {!settled && daysUntil(r.deadline.parsed.iso) < 0 && (
                        <div className="text-rose-600">
                          This date has passed — it is probably last cycle’s. Check the programme page for the{' '}
                          {entry.intake} deadline and enter it here.
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="text-amber-700">No date to count down to — enter the {entry.intake} deadline.</span>
                  )}
                </div>
              )}
            </EditableRow>
            <EditableRow
              label="Scholarship deadline"
              r={r.scholarshipDeadline}
              placeholder="e.g. 1 December 2026"
              onSave={setMine('scholarshipDeadline')}
            >
              {scholarshipParsed.kind === 'dated' && scholarshipParsed.iso && (
                <div className="mt-0.5 text-right text-[10.5px] text-slate-500">
                  read as {formatDeadline(scholarshipParsed.iso)} ·{' '}
                  <Countdown
                    parsed={scholarshipParsed}
                    settled={!['undecided', 'planning'].includes(entry.scholarship)}
                  />
                </div>
              )}
            </EditableRow>
            <EditableRow
              label={`Tuition — ${r.tuition.label}`}
              r={r.tuition}
              country={r.countryPolicy}
              placeholder="e.g. CHF 730 / semester"
              onSave={setMine('tuition')}
            >
              {r.tuition.origin === 'country' && (
                <div className="mt-0.5 text-right text-[10.5px] italic text-amber-700">
                  {r.countryPolicy?.basis === 'per-programme'
                    ? `A range across ${r.country}, not this programme’s own fee — check its page before you budget.`
                    : `The ${r.country} national rule; the programme page gives no figure of its own.`}
                </div>
              )}
            </EditableRow>
            <EditableRow
              label="Application fee"
              r={r.applicationFee}
              placeholder="e.g. HK$300"
              onSave={setMine('applicationFee')}
            />
            <EditableRow
              label="English requirement"
              r={r.english}
              placeholder="e.g. IELTS 6.5 (no band below 6.0)"
              onSave={setMine('english')}
            />
            <label className="flex items-center justify-between gap-3 py-1.5">
              <span className="shrink-0 text-[11px] font-medium text-slate-500">Application portal</span>
              <input
                value={entry.links.portal}
                onChange={(e) => plan.update(entry.id, { links: { ...entry.links, portal: e.target.value.trim() } })}
                placeholder="https://…"
                className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 text-right text-[12px] text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
              />
            </label>
            {entry.ref.kind === 'custom' && (
              <label className="flex items-center justify-between gap-3 border-t border-slate-100 py-1.5">
                <span className="shrink-0 text-[11px] font-medium text-slate-500">Programme page</span>
                <input
                  value={entry.links.program}
                  onChange={(e) => plan.update(entry.id, { links: { ...entry.links, program: e.target.value.trim() } })}
                  placeholder="https://…"
                  className="min-w-0 flex-1 rounded border border-transparent px-1.5 py-0.5 text-right text-[12px] text-slate-800 hover:border-slate-200 focus:border-indigo-400 focus:outline-none"
                />
              </label>
            )}
          </section>

          <div className="space-y-3">
            <section className={card}>
              <div className="mb-1.5 flex items-baseline justify-between">
                <h2 className={`${heading} mb-0`}>Checklist</h2>
                <span className="text-[11px] tabular-nums text-slate-500">
                  {done}/{entry.checklist.length} done
                </span>
              </div>
              <ul>
                {entry.checklist.map((c) => (
                  <li key={c.id} className="group flex items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={c.done}
                      onChange={() => plan.toggleItem(entry.id, c.id)}
                      className="accent-indigo-600"
                      id={`chk-${c.id}`}
                    />
                    <label
                      htmlFor={`chk-${c.id}`}
                      className={`flex-1 text-[12.5px] ${c.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}
                    >
                      {c.label}
                    </label>
                    <button
                      onClick={() => plan.removeItem(entry.id, c.id)}
                      title="Remove this item"
                      className="text-[10px] text-slate-300 opacity-0 hover:text-rose-600 group-hover:opacity-100"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="mt-1.5 flex gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault()
                  plan.addItem(entry.id, newItem)
                  setNewItem('')
                }}
              >
                <input
                  value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  placeholder="Add an item (e.g. APS certificate, GRE score, portfolio)…"
                  className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-0.5 text-[12px] focus:border-indigo-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!newItem.trim()}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11.5px] font-medium text-slate-700 hover:border-indigo-400 disabled:opacity-50"
                >
                  Add
                </button>
              </form>
            </section>

            {live ? (
              <section className={card}>
                <h2 className={heading}>From the database · checked {live.checked_at}</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <DetailCell label="Language">
                    <Fact value={live.language} />
                  </DetailCell>
                  <DetailCell label="Length">
                    <Fact value={live.duration} />
                  </DetailCell>
                  <DetailCell label="Scholarships">
                    <ScholarshipChip level={live.scholarship.level} />
                    {!isUnknown(live.scholarship) && (
                      <div className="mt-0.5">
                        <Fact value={live.scholarship} />
                      </div>
                    )}
                  </DetailCell>
                  <DetailCell label="Doctoral study">
                    {live.phd.value === 'yes' ? 'Yes' : live.phd.value === 'no' ? 'No' : UNKNOWN_LABEL}
                    {live.phd.note ? ` — ${live.phd.note}` : ''}
                  </DetailCell>
                  <DetailCell label="Links">
                    <div className="flex flex-col gap-0.5">
                      {live.links.admissions && (
                        <a href={live.links.admissions} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                          Admission requirements ↗
                        </a>
                      )}
                      {live.links.tuition && (
                        <a href={live.links.tuition} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                          Fees page ↗
                        </a>
                      )}
                      {!live.links.admissions && !live.links.tuition && <span className="text-slate-400">—</span>}
                    </div>
                  </DetailCell>
                  {r.countryPolicy && !isUnknown(r.countryPolicy.scholarships) && (
                    <DetailCell label={`${r.country} schemes`}>
                      <Fact value={r.countryPolicy.scholarships} />
                    </DetailCell>
                  )}
                </div>
              </section>
            ) : entry.ref.kind === 'custom' ? (
              <section className={card}>
                <h2 className={heading}>Programme (typed in by you)</h2>
                {identity('university', 'University')}
                {identity('programName', 'Programme')}
                {identity('city', 'City')}
                {identity('country', 'Country / region')}
              </section>
            ) : (
              <section className={`${card} text-[12px] text-amber-700`}>
                This programme is no longer in the database, so only what you saved is shown.
              </section>
            )}
          </div>
        </div>

        <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3.5">
          <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">My notes</h2>
          <textarea
            value={entry.notes}
            onChange={(e) => plan.update(entry.id, { notes: e.target.value })}
            rows={5}
            placeholder="Referees asked, portal login hints, courses to mention, what the programme is looking for…"
            className="w-full resize-y rounded border border-amber-200 bg-white px-2 py-1.5 text-[12.5px] text-slate-800 focus:border-amber-400 focus:outline-none"
          />
        </section>

        <p className="mt-2 text-[10.5px] text-slate-400">
          Added {entry.createdAt.slice(0, 10)} · last changed {entry.updatedAt.slice(0, 10)}
        </p>
      </div>
    </main>
  )
}
