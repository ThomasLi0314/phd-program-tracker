// Faculty detail (spec §9–§16). Recruiting status carries evidence, source,
// date and confidence — it is never a bare boolean, and silence never reads as
// "recruiting".

import { useState } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { PlannerFaculty, PlannerRecruitmentStatus, PlannerState } from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'
import { editedField, toggleLockField } from '../lib/researchField'
import { RECRUITMENT_DOTS, RECRUITMENT_LABELS, RECRUITMENT_ORDER } from '../lib/recruitment'
import { CONTACT_LABELS, CONTACT_ORDER, CONTACT_TONES, UNKNOWN_LABEL } from '../lib/labels'
import { FieldRow } from '../components/FieldValue'
import { StatusChip, StatusSelect } from '../components/StatusChip'
import { FacultyResearchPanel } from '../components/ResearchPanel'

export function FacultyDetail({
  id,
  state,
  pool,
  planner,
}: {
  id: string
  state: PlannerState
  pool: ReferencePool
  planner: PlannerApi
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [researching, setResearching] = useState(false)
  const entry = state.faculty.find((f) => f.id === id) ?? null

  if (!entry) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-slate-400">
        That person isn’t in your planner.
        <button onClick={() => navigate('/planner/faculty')} className="ml-1 text-indigo-600 underline">
          Back to Faculty
        </button>
      </main>
    )
  }

  const programs = entry.programIds
    .map((pid) => state.programs.find((p) => p.id === pid))
    .filter(Boolean)

  const set = (patch: Partial<PlannerFaculty>) => planner.updateFaculty(entry.id, patch)

  const card = 'rounded-lg border border-slate-200 bg-white p-3.5'
  const heading = 'mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400'
  const input =
    'w-full rounded border border-slate-300 px-2 py-1 text-[12.5px] text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200'

  const status = entry.recruiting.value ?? 'unknown'

  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-5 py-4">
        <button
          onClick={() => navigate('/planner/faculty')}
          className="mb-2 text-[11.5px] text-slate-500 hover:text-indigo-700"
        >
          ← Faculty
        </button>

        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-serif text-xl font-bold leading-tight text-slate-900">{entry.name}</h1>
            <p className="mt-0.5 text-[13px] text-slate-600">
              {[entry.title, entry.department, entry.university].filter(Boolean).join(' · ') || (
                <span className="italic text-slate-400">No title or affiliation recorded</span>
              )}
              {entry.ref.kind === 'custom' && (
                <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800">
                  custom entry
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => setResearching((v) => !v)}
            title="Read this person's pages and propose values — you review everything before it is saved."
            className={`ml-auto shrink-0 rounded border px-2 py-1 text-[11.5px] font-medium transition-colors ${
              researching
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 bg-white text-indigo-700 hover:border-indigo-400'
            }`}
          >
            Refresh Research
          </button>
          {confirmDelete ? (
            <span className="flex shrink-0 items-center gap-1.5 text-[11.5px]">
              <span className="text-rose-700">Remove?</span>
              <button
                onClick={() => {
                  planner.removeFaculty(entry.id)
                  navigate('/planner/faculty')
                }}
                className="rounded bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-700"
              >
                Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="text-slate-500 hover:underline">
                cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-rose-600 hover:border-rose-300"
            >
              Delete
            </button>
          )}
        </header>

        {researching && (
          <FacultyResearchPanel
            entry={entry}
            cycle={state.settings.cycle}
            onApply={(patch) => planner.updateFaculty(entry.id, patch)}
            onClose={() => setResearching(false)}
          />
        )}

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {/* Basic information */}
          <section className={card}>
            <h2 className={heading}>Basic information</h2>
            <div className="space-y-1.5">
              {(
                [
                  ['title', 'Title'],
                  ['university', 'University'],
                  ['department', 'Department'],
                  ['email', 'Email (only if publicly listed)'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] font-medium text-slate-500">{label}</span>
                  <input value={entry[k]} onChange={(e) => set({ [k]: e.target.value })} className={input} />
                </label>
              ))}
              {(
                [
                  ['faculty', 'Faculty page'],
                  ['personal', 'Personal site'],
                  ['lab', 'Lab site'],
                  ['scholar', 'Google Scholar'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] font-medium text-slate-500">{label}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      value={entry.links[k]}
                      onChange={(e) => set({ links: { ...entry.links, [k]: e.target.value } })}
                      placeholder="https://…"
                      className={input}
                    />
                    {entry.links[k] && (
                      <a
                        href={entry.links[k]}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-[11px] text-indigo-600 hover:underline"
                      >
                        open ↗
                      </a>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </section>

          <div className="space-y-3">
            {/* Recruiting — the most consequential field on the page. */}
            <section className={card}>
              <h2 className={heading}>Recruiting status</h2>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[15px]">{RECRUITMENT_DOTS[status]}</span>
                <span className="text-[13.5px] font-semibold text-slate-800">
                  {RECRUITMENT_LABELS[status]}
                </span>
              </div>
              <FieldRow
                label="Status"
                field={entry.recruiting}
                display={entry.recruiting.value ? RECRUITMENT_LABELS[entry.recruiting.value] : null}
                options={RECRUITMENT_ORDER.filter((r) => r !== 'unknown').map((r) => ({
                  value: r,
                  label: RECRUITMENT_LABELS[r],
                }))}
                onSetValue={(raw) =>
                  set({
                    recruiting: editedField(
                      entry.recruiting,
                      raw === '' ? null : (raw as PlannerRecruitmentStatus),
                    ),
                  })
                }
                onToggleLock={() => set({ recruiting: toggleLockField(entry.recruiting) })}
                staleAfterDays={state.settings.staleAfterDays}
              />
              <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
                An empty status means <b>Unknown</b>, not “not recruiting”. Absence of a recruiting
                statement never counts as evidence either way — “Possibly Recruiting” is an
                inference and should carry low confidence.
              </p>
            </section>

            {/* Programs this person can advise through (many-to-many). */}
            <section className={card}>
              <h2 className={heading}>Programs ({programs.length})</h2>
              {programs.length === 0 ? (
                <p className="text-[12px] text-slate-400">
                  Not linked to a program yet — open a program and use ＋ Add Faculty.
                </p>
              ) : (
                <ul className="space-y-1">
                  {programs.map(
                    (p) =>
                      p && (
                        <li key={p.id} className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => navigate(`/planner/programs/${p.id}`)}
                            className="min-w-0 truncate text-left text-[12.5px] text-indigo-700 hover:underline"
                          >
                            {p.university} — {p.programName}
                          </button>
                          <button
                            onClick={() => planner.unlinkFaculty(p.id, entry.id)}
                            title="Unlink from this program"
                            className="shrink-0 text-[11px] text-slate-400 hover:text-rose-600"
                          >
                            unlink
                          </button>
                        </li>
                      ),
                  )}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* Research summary */}
        <section className={`${card} mt-3`}>
          <h2 className={heading}>Research</h2>
          <label className="block">
            <span className="text-[11px] font-medium text-slate-500">One-line summary</span>
            <input
              value={entry.oneLiner?.value ?? ''}
              onChange={(e) => set({ oneLiner: editedField(entry.oneLiner, e.target.value || null) })}
              placeholder={UNKNOWN_LABEL}
              className={input}
            />
          </label>
          <label className="mt-2 block">
            <span className="text-[11px] font-medium text-slate-500">
              Research themes <span className="text-slate-400">(comma separated, 3–8)</span>
            </span>
            <input
              value={entry.themes.join(', ')}
              onChange={(e) =>
                set({
                  themes: e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                    .slice(0, 8),
                })
              }
              className={input}
            />
          </label>
          {entry.themes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {entry.themes.map((t) => (
                <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                  {t}
                </span>
              ))}
            </div>
          )}
          <label className="mt-2 block">
            <span className="text-[11px] font-medium text-slate-500">Detailed summary</span>
            <textarea
              value={entry.detailed?.value ?? ''}
              onChange={(e) => set({ detailed: editedField(entry.detailed, e.target.value || null) })}
              rows={4}
              placeholder={UNKNOWN_LABEL}
              className={`${input} resize-y`}
            />
          </label>
          <label className="mt-2 block">
            <span className="text-[11px] font-medium text-slate-500">Recent research directions</span>
            <textarea
              value={entry.recentResearch?.value ?? ''}
              onChange={(e) =>
                set({ recentResearch: editedField(entry.recentResearch, e.target.value || null) })
              }
              rows={3}
              placeholder="What they've been doing recently — often differs from an outdated homepage."
              className={`${input} resize-y`}
            />
          </label>
        </section>

        {/* Fit analysis lands in Phase 3; the shape already exists in the model. */}
        <section className={`${card} mt-3`}>
          <h2 className={heading}>Research fit</h2>
          {entry.fit ? (
            <div>
              <p className="text-[15px] font-bold text-slate-800">{entry.fit.overall.toFixed(1)} / 10</p>
              <p className="text-[10.5px] text-slate-400">A subjective ranking aid — not an admissions probability.</p>
            </div>
          ) : (
            <p className="text-[12px] text-slate-400">
              Fit analysis arrives with the personal-intelligence phase. It will compare this profile
              against <b>My Research Profile</b>.
            </p>
          )}
        </section>

        {/* Contact workflow */}
        <section className={`${card} mt-3`}>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className={heading + ' mb-0'}>Contact</h2>
            <StatusChip label={CONTACT_LABELS[entry.contact.status]} tone={CONTACT_TONES[entry.contact.status]} />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Status
              <StatusSelect
                value={entry.contact.status}
                options={CONTACT_ORDER}
                labels={CONTACT_LABELS}
                onChange={(v) => set({ contact: { ...entry.contact, status: v } })}
              />
            </label>
            {(
              [
                ['initialContactAt', 'First contact'],
                ['followUpAt', 'Follow-up'],
                ['meetingAt', 'Meeting'],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                {label}
                <input
                  type="date"
                  value={entry.contact[k] ?? ''}
                  onChange={(e) => set({ contact: { ...entry.contact, [k]: e.target.value || null } })}
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700 focus:border-indigo-400 focus:outline-none"
                />
              </label>
            ))}
          </div>
          <textarea
            value={entry.contact.notes}
            onChange={(e) => set({ contact: { ...entry.contact, notes: e.target.value } })}
            rows={3}
            placeholder="Emailed Aug 3. Replied Aug 6. Likely taking students."
            className={`${input} mt-2 resize-y`}
          />
          <p className="mt-1 text-[10.5px] leading-relaxed text-slate-400">
            This tracks your <b>intent</b>. Actual sent/replied email evidence is synced from Gmail
            in the tracker’s ✉ Outreach tab — this page deliberately doesn’t keep a second copy of
            it.
          </p>
        </section>

        {/* My Notes */}
        <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3.5">
          <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            My Notes
          </h2>
          <textarea
            value={entry.notes}
            onChange={(e) => set({ notes: e.target.value })}
            rows={4}
            placeholder="Your own observations. Never touched by a research refresh."
            className="w-full resize-y rounded border border-amber-200 bg-white px-2 py-1.5 text-[12.5px] text-slate-800 focus:border-amber-400 focus:outline-none"
          />
        </section>

        <p className="mt-3 text-[11px] text-slate-400">
          Last researched: {entry.lastResearchedAt?.slice(0, 10) ?? 'never'} · Last changed:{' '}
          {entry.updatedAt.slice(0, 10)}
          {pool.loading && ' · database still loading'}
        </p>
      </div>
    </main>
  )
}
