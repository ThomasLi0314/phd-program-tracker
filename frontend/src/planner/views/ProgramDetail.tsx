// Program detail (spec §6). Structure follows the spec's section order so the
// page reads the same way every time: header → status → admissions → funding →
// faculty → my notes → sources → research metadata.

import { useMemo, useState } from 'react'
import { navigate } from '../../lib/hashRoute'
import type { GreStatus } from '../../types'
import type {
  AdmissionModel,
  FundingLevel,
  PlannerProgram,
  PlannerState,
  ResearchField,
  SourceEvidence,
} from '../types'
import type { ReferencePool } from '../lib/useReferencePool'
import type { PlannerApi } from '../lib/usePlanner'
import { programIdentity, resolveProgram } from '../lib/referenceBridge'
import { editedField, isUnknown, toggleLockField } from '../lib/researchField'
import { RECRUITMENT_DOTS, RECRUITMENT_LABELS } from '../lib/recruitment'
import {
  ADMISSION_MODEL_LABELS,
  APPLICATION_LABELS,
  APPLICATION_ORDER,
  FUNDING_LABELS,
  INTEREST_LABELS,
  INTEREST_ORDER,
} from '../lib/labels'
import { FieldRow } from '../components/FieldValue'
import { StatusSelect } from '../components/StatusChip'
import { AddFacultyModal } from '../components/AddFacultyModal'
import { ProgramResearchPanel } from '../components/ResearchPanel'

type Section = 'admissions' | 'structure' | 'funding'

export function ProgramDetail({
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
  const [addingFaculty, setAddingFaculty] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [researching, setResearching] = useState(false)

  const entry = state.programs.find((p) => p.id === id) ?? null
  const live = entry ? resolveProgram(entry, pool.byId) : null

  const linkedFaculty = useMemo(
    () => (entry ? entry.facultyIds.map((fid) => state.faculty.find((f) => f.id === fid)).filter(Boolean) : []),
    [entry, state.faculty],
  )

  /** Every source cited anywhere on this program (spec §6 "Sources"). */
  const allSources = useMemo(() => {
    if (!entry) return [] as SourceEvidence[]
    const out: SourceEvidence[] = []
    for (const sec of ['admissions', 'structure', 'funding'] as Section[]) {
      const fields = entry[sec] as Record<string, ResearchField<unknown> | undefined>
      for (const f of Object.values(fields)) if (f) out.push(...f.sources)
    }
    const seen = new Set<string>()
    return out.filter((s) => !seen.has(s.url) && seen.add(s.url))
  }, [entry])

  const unknownCount = useMemo(() => {
    if (!entry) return 0
    let n = 0
    for (const sec of ['admissions', 'structure', 'funding'] as Section[]) {
      const fields = entry[sec] as Record<string, ResearchField<unknown> | undefined>
      for (const f of Object.values(fields)) if (isUnknown(f)) n++
    }
    return n
  }, [entry])

  if (!entry) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-slate-400">
        That program isn’t in your planner.
        <button onClick={() => navigate('/planner/programs')} className="ml-1 text-indigo-600 underline">
          Back to Programs
        </button>
      </main>
    )
  }

  const ident = programIdentity(entry, live)

  const patchField = (section: Section, key: string, value: unknown) => {
    const sec = entry[section] as Record<string, ResearchField<unknown> | undefined>
    planner.updateProgram(entry.id, {
      [section]: { ...sec, [key]: editedField(sec[key], value) },
    } as Partial<PlannerProgram>)
  }

  const lockField = (section: Section, key: string) => {
    const sec = entry[section] as Record<string, ResearchField<unknown> | undefined>
    planner.updateProgram(entry.id, {
      [section]: { ...sec, [key]: toggleLockField(sec[key]) },
    } as Partial<PlannerProgram>)
  }

  const textRow = (section: Section, key: string, label: string) => {
    const sec = entry[section] as Record<string, ResearchField<unknown> | undefined>
    const f = sec[key]
    return (
      <FieldRow
        label={label}
        field={f}
        display={f?.value == null ? null : String(f.value)}
        onSetValue={(raw) => patchField(section, key, raw.trim() === '' ? null : raw.trim())}
        onToggleLock={() => lockField(section, key)}
        staleAfterDays={state.settings.staleAfterDays}
      />
    )
  }

  const optionRow = (
    section: Section,
    key: string,
    label: string,
    options: { value: string; label: string }[],
  ) => {
    const sec = entry[section] as Record<string, ResearchField<unknown> | undefined>
    const f = sec[key]
    const found = options.find((o) => o.value === String(f?.value ?? ''))
    return (
      <FieldRow
        label={label}
        field={f}
        display={f?.value == null ? null : (found?.label ?? String(f.value))}
        options={options}
        onSetValue={(raw) => patchField(section, key, raw === '' ? null : raw)}
        onToggleLock={() => lockField(section, key)}
        staleAfterDays={state.settings.staleAfterDays}
      />
    )
  }

  const card = 'rounded-lg border border-slate-200 bg-white p-3.5'
  const heading = 'mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400'

  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-5 py-4">
        <button
          onClick={() => navigate('/planner/programs')}
          className="mb-2 text-[11.5px] text-slate-500 hover:text-indigo-700"
        >
          ← Programs
        </button>

        <header className="mb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-serif text-xl font-bold leading-tight text-slate-900">
                {ident.university}
              </h1>
              <p className="mt-0.5 text-[13.5px] text-slate-600">
                {ident.programName}
                {ident.degree ? ` · ${ident.degree}` : ''} · {entry.cycle}
                {!ident.fromDatabase && (
                  <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-800">
                    custom entry
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ident.website && (
              <a
                href={ident.website}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-indigo-700 hover:border-indigo-400"
              >
                Official Website ↗
              </a>
            )}
            {ident.portal && (
              <a
                href={ident.portal}
                target="_blank"
                rel="noreferrer"
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-indigo-700 hover:border-indigo-400"
              >
                Application Portal ↗
              </a>
            )}
            <button
              onClick={() => setResearching((v) => !v)}
              title="Read this program's official pages and propose values — you review everything before it is saved."
              className={`rounded border px-2 py-1 text-[11.5px] font-medium transition-colors ${
                researching
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-indigo-700 hover:border-indigo-400'
              }`}
            >
              Refresh Research
            </button>
            {confirmDelete ? (
              <span className="flex items-center gap-1.5 text-[11.5px]">
                <span className="text-rose-700">Remove from planner?</span>
                <button
                  onClick={() => {
                    planner.removeProgram(entry.id)
                    navigate('/planner/programs')
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
                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11.5px] font-medium text-rose-600 hover:border-rose-300"
              >
                Delete from Planner
              </button>
            )}
          </div>
        </header>

        {researching && (
          <ProgramResearchPanel
            entry={entry}
            cycle={entry.cycle}
            onApply={(patch) => planner.updateProgram(entry.id, patch)}
            onClose={() => setResearching(false)}
          />
        )}

        {/* Status */}
        <section className={`${card} mb-3`}>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Interest
              <StatusSelect
                value={entry.interest}
                options={INTEREST_ORDER}
                labels={INTEREST_LABELS}
                onChange={(v) => planner.updateProgram(entry.id, { interest: v })}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Application
              <StatusSelect
                value={entry.status}
                options={APPLICATION_ORDER}
                labels={APPLICATION_LABELS}
                onChange={(v) => planner.updateProgram(entry.id, { status: v })}
              />
            </label>
            <label className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
              Cycle
              <input
                value={entry.cycle}
                onChange={(e) => planner.updateProgram(entry.id, { cycle: e.target.value })}
                className="w-28 rounded border border-slate-300 px-1.5 py-0.5 text-[11px] text-slate-700 focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <section className={card}>
            <h2 className={heading}>Admissions</h2>
            {textRow('admissions', 'deadline', 'Deadline')}
            {optionRow('admissions', 'gre', 'GRE', [
              { value: 'Required', label: 'Required' },
              { value: 'Optional', label: 'Optional' },
              { value: 'Not Accepted', label: 'Not Accepted' },
            ] satisfies { value: GreStatus | string; label: string }[])}
            {textRow('admissions', 'english', 'English requirement')}
            {textRow('admissions', 'toefl', 'TOEFL')}
            {textRow('admissions', 'ielts', 'IELTS')}
            {textRow('admissions', 'minGpa', 'Minimum GPA')}
            {textRow('admissions', 'applicationFee', 'Application fee')}
            {textRow('admissions', 'feeWaiver', 'Fee waiver')}
            {textRow('admissions', 'letters', 'Recommendation letters')}
            {textRow('admissions', 'sop', 'Statement of purpose')}
            {textRow('admissions', 'cv', 'CV / resume')}
            {textRow('admissions', 'transcript', 'Transcript')}
            {textRow('admissions', 'writingSample', 'Writing sample')}
            {textRow('admissions', 'otherRequirements', 'Other requirements')}
          </section>

          <div className="space-y-3">
            <section className={card}>
              <h2 className={heading}>Program structure</h2>
              {optionRow(
                'structure',
                'admissionModel',
                'Admission model',
                (Object.keys(ADMISSION_MODEL_LABELS) as AdmissionModel[]).map((k) => ({
                  value: k,
                  label: ADMISSION_MODEL_LABELS[k],
                })),
              )}
              {textRow('structure', 'contactEncouraged', 'Contact faculty first?')}
              {textRow('structure', 'duration', 'Typical duration')}
              {textRow('structure', 'qualifyingExams', 'Qualifying exams')}
              {textRow('structure', 'researchAreas', 'Research areas')}
              {textRow('structure', 'institutes', 'Institutes / centers')}
            </section>

            <section className={card}>
              <h2 className={heading}>Funding</h2>
              {optionRow(
                'funding',
                'level',
                'Funding',
                (Object.keys(FUNDING_LABELS) as FundingLevel[]).map((k) => ({
                  value: k,
                  label: FUNDING_LABELS[k],
                })),
              )}
              {textRow('funding', 'years', 'Guaranteed years')}
              {textRow('funding', 'tuitionWaiver', 'Tuition waiver')}
              {textRow('funding', 'stipend', 'Stipend')}
              {textRow('funding', 'healthInsurance', 'Health insurance')}
              {textRow('funding', 'notes', 'Funding notes')}
            </section>
          </div>
        </div>

        {/* Faculty */}
        <section className={`${card} mt-3`}>
          <div className="mb-1.5 flex items-center justify-between">
            <h2 className={heading + ' mb-0'}>Faculty ({linkedFaculty.length})</h2>
            <button
              onClick={() => setAddingFaculty(true)}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11.5px] font-medium text-slate-700 hover:border-indigo-400 hover:text-indigo-700"
            >
              + Add Faculty
            </button>
          </div>
          {linkedFaculty.length === 0 ? (
            <p className="py-3 text-center text-[12px] text-slate-400">
              No faculty saved for this program yet.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {linkedFaculty.map(
                (f) =>
                  f && (
                    <li key={f.id} className="flex items-center justify-between gap-3 py-1.5">
                      <button
                        onClick={() => navigate(`/planner/faculty/${f.id}`)}
                        className="min-w-0 text-left"
                      >
                        <span className="text-[13px] font-medium text-slate-800 hover:text-indigo-700 hover:underline">
                          {f.name}
                        </span>
                        <span className="ml-2 text-[11px] text-slate-500">
                          {f.themes.slice(0, 3).join(' · ')}
                        </span>
                      </button>
                      <span className="shrink-0 text-[11px] text-slate-500">
                        {RECRUITMENT_DOTS[f.recruiting.value ?? 'unknown']}{' '}
                        {RECRUITMENT_LABELS[f.recruiting.value ?? 'unknown']}
                      </span>
                    </li>
                  ),
              )}
            </ul>
          )}
        </section>

        {/* My Notes — visually separate from researched content (spec §17). */}
        <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3.5">
          <h2 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            My Notes
          </h2>
          <textarea
            value={entry.notes}
            onChange={(e) => planner.updateProgram(entry.id, { notes: e.target.value })}
            rows={4}
            placeholder="Anything you want to remember about this program. Never touched by a research refresh."
            className="w-full resize-y rounded border border-amber-200 bg-white px-2 py-1.5 text-[12.5px] text-slate-800 focus:border-amber-400 focus:outline-none"
          />
        </section>

        {/* Sources + research metadata */}
        <section className={`${card} mt-3`}>
          <h2 className={heading}>Sources</h2>
          {allSources.length === 0 ? (
            <p className="text-[12px] text-slate-400">
              No sources yet — values here were entered by hand or carried from the database.
            </p>
          ) : (
            <ul className="space-y-1">
              {allSources.map((s) => (
                <li key={s.url} className="text-[11.5px]">
                  <a href={s.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline [overflow-wrap:anywhere]">
                    {s.title || s.url} ↗
                  </a>
                  <span className="ml-1.5 text-slate-400">tier {s.tier} · {s.fetchedAt}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-2.5 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            Last researched: {entry.lastResearchedAt?.slice(0, 10) ?? 'never'} · Last changed:{' '}
            {entry.updatedAt.slice(0, 10)} ·{' '}
            <span className={unknownCount > 0 ? 'text-amber-600' : ''}>
              {unknownCount} field{unknownCount === 1 ? '' : 's'} need verification
            </span>
          </div>
        </section>
      </div>

      {addingFaculty && (
        <AddFacultyModal
          state={state}
          pool={pool}
          planner={planner}
          programEntryId={entry.id}
          programProgramId={entry.ref.kind === 'database' ? entry.ref.programId : null}
          onClose={() => setAddingFaculty(false)}
          onAdded={() => setAddingFaculty(false)}
        />
      )}
    </main>
  )
}
