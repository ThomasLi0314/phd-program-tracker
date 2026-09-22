// Program detail.
//
// Four facts decide whether a program is worth the evening it takes to apply:
// when it closes, whether it pays, where the application stands, and whether
// anyone there is someone you'd want to work with. Those sit at the top as
// tiles. Everything else is one tab away — Overview, Faculty, Requirements,
// Notes — instead of one long scroll where the deadline and the faculty
// roster competed for the same attention.

import { useEffect, useState } from 'react'
import type { Faculty, OutreachRecord, Program } from '../types'
import { UNKNOWN } from '../types'
import { StipendRent } from './StipendRent'
import { stipendText } from '../lib/costOfLiving'
import { Badge } from './Badge'
import { EditableLink } from './EditableLink'
import { ProgramNoteButton } from './ProgramNoteButton'
import { AdvisorCard, type AdvisorDensity } from './AdvisorCard'
import type { ProgramDoc } from '../lib/programDocs'
import { advisorKey } from '../lib/starredAdvisors'
import type { ProgramField } from '../lib/overrides'
import { deadlineStatus, DEADLINE_KIND_LABEL } from '../lib/deadlineStatus'
import type { PlanSummary } from '../lib/planBridge'
import { groupByCanonical } from '../lib/subfields'
import { usePref } from '../lib/viewPrefs'
import { APPLICATION_LABELS, INTEREST_LABELS } from '../planner/lib/labels'

type Tab = 'overview' | 'faculty' | 'requirements' | 'notes'

// ── Editable requirement cell ─────────────────────────────────────────────────

function EditableCell({
  label,
  value,
  note,
  override,
  onSave,
  wide = false,
  multiline = false,
  placeholder,
}: {
  label: string
  value: string
  note?: string
  override: string
  onSave: (text: string) => void
  wide?: boolean
  multiline?: boolean
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const hasOverride = override.trim().length > 0
  const effective = hasOverride ? override : value

  useEffect(() => {
    if (!editing) setDraft(hasOverride ? override : value === UNKNOWN ? '' : value)
  }, [editing, override, value, hasOverride])

  const save = () => {
    onSave(draft)
    setEditing(false)
  }

  return (
    <div
      className={`group/cell rounded-md border bg-white px-3 py-2 ${
        hasOverride ? 'border-indigo-300' : 'border-slate-200'
      } ${wide ? 'sm:col-span-2' : ''}`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {label}
          {hasOverride && (
            <span className="ml-1 rounded bg-indigo-100 px-1 py-px text-[10px] font-medium normal-case tracking-normal text-indigo-700">
              your edit
            </span>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            aria-label={`Edit ${label}`}
            title={`Edit ${label}`}
            className="shrink-0 text-[12px] text-slate-400 transition-colors hover:text-indigo-600"
          >
            ✎
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1">
          {multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              rows={3}
              placeholder={placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
                else if (e.key === 'Escape') setEditing(false)
              }}
              className="w-full resize-y rounded border border-indigo-300 px-2 py-1 text-[13px] leading-snug text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            />
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              placeholder={placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
                else if (e.key === 'Escape') setEditing(false)
              }}
              className="w-full rounded border border-indigo-300 px-2 py-1 text-[13px] leading-snug text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-200"
            />
          )}
          <div className="mt-1 flex items-center gap-2 text-[12px]">
            <button
              onClick={save}
              className="rounded bg-indigo-600 px-2 py-0.5 font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-slate-500 hover:text-slate-700">
              Cancel
            </button>
            {hasOverride && (
              <button
                onClick={() => {
                  onSave('')
                  setEditing(false)
                }}
                className="ml-auto text-slate-500 hover:text-rose-600"
              >
                reset to database value
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-0.5 whitespace-pre-wrap text-[13.5px] font-medium leading-snug text-slate-900 [overflow-wrap:anywhere]">
            {effective === UNKNOWN || !effective ? (
              <span className="italic text-amber-700">Unknown / Verify</span>
            ) : (
              effective
            )}
          </div>
          {/* The dataset's note explains the dataset's value; once replaced,
              the note could contradict it, so it goes away. */}
          {!hasOverride && note && note !== UNKNOWN && (
            <div className="mt-1 text-[12px] leading-snug text-slate-600 [overflow-wrap:anywhere]">
              {note}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Requirements({
  program,
  contactOverride,
  onSetContact,
  fields,
  onSetField,
  cycle,
}: {
  program: Program
  contactOverride: string
  onSetContact: (text: string) => void
  fields: Record<string, string>
  onSetField: (field: ProgramField, text: string) => void
  cycle: string
}) {
  const r = program.requirements
  const dl = deadlineStatus(program, cycle)
  const fundingValue =
    r.funding.status === UNKNOWN
      ? UNKNOWN
      : `${r.funding.status}${r.funding.years ? ` · ${r.funding.years} yrs` : ''}`
  const cell = (field: ProgramField) => ({
    override: fields[field] ?? '',
    onSave: (t: string) => onSetField(field, t),
  })
  return (
    <section>
      <p className="mb-2 text-[12px] text-slate-500">
        Every cell is editable — click ✎. Your edits are kept in this browser and marked, and the
        database value comes back on reset.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        <EditableCell
          label="Deadline"
          value={r.deadline_display}
          note={dl.kind === 'past' || dl.kind === 'upcoming' ? DEADLINE_KIND_LABEL[dl.kind] : undefined}
          placeholder="e.g. Dec 15, 2026"
          {...cell('deadline_display')}
        />
        <EditableCell label="Application fee" value={r.fee_display} placeholder="e.g. $110, or waived" {...cell('fee_display')} />
        <EditableCell
          label="GRE"
          value={r.gre === 'Optional' ? 'Optional / not required' : r.gre}
          placeholder="Required / Optional / Not Accepted"
          {...cell('gre')}
        />
        <EditableCell
          label="Letters"
          value={r.letters !== null ? `${r.letters} required` : UNKNOWN}
          placeholder="e.g. 3 required"
          {...cell('letters')}
        />
        <EditableCell
          label="English requirement"
          value={r.english}
          wide
          multiline
          placeholder="e.g. TOEFL iBT 100, IELTS 7.0; waived for English-medium degrees"
          {...cell('english')}
        />
        <EditableCell
          label="Duration / credits"
          value={r.ects !== null ? `${r.duration} · ${r.ects} ECTS` : r.duration}
          placeholder="e.g. 5 years"
          {...cell('duration')}
        />
        <EditableCell
          label="Funding"
          value={fundingValue}
          note={r.funding.note}
          wide
          multiline
          placeholder="e.g. Fully Funded · 5 yrs; stipend $42k"
          {...cell('funding')}
        />
        <EditableCell
          label="Admission model"
          value={r.admission_model}
          note={r.admission_model_note}
          wide
          multiline
          placeholder="e.g. Direct-to-department; rotations in year 1"
          {...cell('admission_model')}
        />
        <EditableCell
          label="Contact before applying"
          value={r.pre_application_contact}
          note={r.contact_note}
          wide
          multiline
          placeholder="e.g. Email Prof. X (x@uni.edu) before applying"
          override={contactOverride}
          onSave={onSetContact}
        />
      </div>
    </section>
  )
}

// ── Faculty roster ────────────────────────────────────────────────────────────

function Roster({
  programId,
  faculty,
  addedFaculty,
  levels,
  onSetLevel,
  notes,
  onSetNote,
  outreach,
  homepages,
  onSetHomepage,
  onAddAdvisor,
  onRemoveFaculty,
  density,
  onSetDensity,
}: {
  programId: string
  faculty: Faculty[]
  addedFaculty: Faculty[]
  levels: Map<string, number>
  onSetLevel: (key: string, level: number) => void
  notes: Map<string, string>
  onSetNote: (key: string, text: string) => void
  outreach: Record<string, OutreachRecord>
  homepages: Record<string, string>
  onSetHomepage: (key: string, url: string) => void
  onAddAdvisor: () => void
  onRemoveFaculty: (facultyId: string) => void
  density: AdvisorDensity
  onSetDensity: (d: AdvisorDensity) => void
}) {
  const all = [...faculty, ...addedFaculty]
  const groups = groupByCanonical(all, (f) => f.sub_field || 'Unspecified')
  // Saved advisors first within each group, then by name — the people you
  // already care about should not hide behind twenty you haven't looked at.
  for (const g of groups) {
    g.items.sort(
      (a, b) =>
        (levels.get(advisorKey(programId, b.id)) ?? 0) - (levels.get(advisorKey(programId, a.id)) ?? 0) ||
        a.name.localeCompare(b.name),
    )
  }
  groups.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label))

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px] text-slate-600">
          {all.length === 0
            ? 'No advisors scanned for this program yet.'
            : `${all.length} advisor${all.length === 1 ? '' : 's'}, grouped by research area · saved first`}
        </p>
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded border border-slate-300 text-[11.5px] font-medium">
            {(['card', 'compact'] as AdvisorDensity[]).map((d) => (
              <button
                key={d}
                onClick={() => onSetDensity(d)}
                className={`px-2 py-0.5 ${density === d ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
              >
                {d === 'card' ? 'Cards' : 'List'}
              </button>
            ))}
          </div>
          <button
            onClick={onAddAdvisor}
            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[12px] font-medium text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-700"
            title="Add an advisor from the Advisors search — their school and program are worked out from their page"
          >
            ＋ Add advisor
          </button>
        </div>
      </div>

      {groups.map((g) => (
        <div key={g.key} className="mt-3 first:mt-0">
          <h3 className="mb-1.5 border-b border-slate-200 pb-1 font-serif text-[14px] font-bold text-slate-800">
            {g.label} <span className="font-sans text-[12px] font-normal text-slate-500">({g.items.length})</span>
          </h3>
          <div className={density === 'card' ? 'gap-3 xl:columns-2 2xl:columns-3' : 'rounded-md border border-slate-200'}>
            {g.items.map((f) => {
              const key = advisorKey(programId, f.id)
              return (
                <AdvisorCard
                  key={f.id}
                  faculty={f}
                  rows={[]}
                  showUniversity={false}
                  showPrograms={false}
                  density={density}
                  level={levels.get(key) ?? 0}
                  onSetLevel={(n) => onSetLevel(key, n)}
                  note={notes.get(key) ?? ''}
                  onSaveNote={(text) => onSetNote(key, text)}
                  record={outreach[key]}
                  homepage={homepages[key] ?? f.links.homepage ?? ''}
                  onSetHomepage={(u) => onSetHomepage(key, u)}
                  onRemove={f.added ? () => onRemoveFaculty(f.id) : undefined}
                />
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}

// ── Key-fact tile ─────────────────────────────────────────────────────────────

const TILE_TONE: Record<string, string> = {
  emerald: 'border-l-emerald-500',
  amber: 'border-l-amber-500',
  sky: 'border-l-sky-500',
  rose: 'border-l-rose-500',
  slate: 'border-l-slate-400',
  indigo: 'border-l-indigo-500',
}

function Tile({
  label,
  value,
  caption,
  tone = 'slate',
  onClick,
  action,
}: {
  label: string
  value: React.ReactNode
  caption?: React.ReactNode
  tone?: keyof typeof TILE_TONE
  onClick?: () => void
  action?: React.ReactNode
}) {
  const inner = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      <div className="mt-0.5 text-[15px] font-semibold leading-snug text-slate-900 [overflow-wrap:anywhere]">
        {value}
      </div>
      {caption && <div className="mt-0.5 text-[12px] leading-snug text-slate-600">{caption}</div>}
      {action && <div className="mt-1.5">{action}</div>}
    </>
  )
  const cls = `rounded-md border border-slate-200 border-l-[3px] bg-white px-3 py-2 text-left ${TILE_TONE[tone]}`
  if (onClick) {
    return (
      <button onClick={onClick} className={`${cls} transition-colors hover:bg-slate-50`} title="Open the matching tab">
        {inner}
      </button>
    )
  }
  return <div className={cls}>{inner}</div>
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function DeepDive({
  program,
  cycle,
  loading,
  saved,
  onToggleSaved,
  plan,
  onAddToPlan,
  programSummary,
  levels,
  onSetLevel,
  notes,
  onSetNote,
  outreach,
  homepages,
  onSetHomepage,
  programPage,
  onSetProgramPage,
  contactOverride,
  onSetContact,
  addedFaculty,
  onAddAdvisor,
  onRemoveFaculty,
  fieldOverrides,
  onSetField,
  noteDoc,
  googleClientId,
  googleConnected,
  onNoteCreated,
  onNoteUnlink,
}: {
  program: Program | null
  cycle: string
  loading: boolean
  saved: boolean
  onToggleSaved: () => void
  plan: PlanSummary | undefined
  onAddToPlan: () => void | Promise<void>
  programSummary?: { summary: string; updatedAt: number; count: number }
  levels: Map<string, number>
  onSetLevel: (key: string, level: number) => void
  notes: Map<string, string>
  onSetNote: (key: string, text: string) => void
  outreach: Record<string, OutreachRecord>
  homepages: Record<string, string>
  onSetHomepage: (key: string, url: string) => void
  programPage: string
  onSetProgramPage: (url: string) => void
  contactOverride: string
  onSetContact: (text: string) => void
  addedFaculty: Faculty[]
  onAddAdvisor: () => void
  onRemoveFaculty: (facultyId: string) => void
  fieldOverrides: Record<string, string>
  onSetField: (field: ProgramField, text: string) => void
  noteDoc: ProgramDoc | undefined
  googleClientId: string
  googleConnected: boolean
  onNoteCreated: (programId: string, doc: ProgramDoc) => void
  onNoteUnlink: (programId: string) => void
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [density, setDensity] = usePref<AdvisorDensity>('rosterDensity', 'card')
  const [adding, setAdding] = useState(false)

  if (!program) {
    return (
      <main className="flex h-full flex-1 items-center justify-center bg-slate-50/40">
        <p className={`text-[13px] text-slate-500 ${loading ? 'animate-pulse' : ''}`}>
          {loading ? 'Loading programs…' : 'Select a program on the left to open it.'}
        </p>
      </main>
    )
  }

  const r = program.requirements
  const dl = deadlineStatus(program, cycle)
  const all = [...program.faculty, ...addedFaculty]
  const savedAdvisors = all
    .map((f) => ({ f, level: levels.get(advisorKey(program.id, f.id)) ?? 0 }))
    .filter((x) => x.level > 0)
    .sort((a, b) => b.level - a.level || a.f.name.localeCompare(b.f.name))
  const notedAdvisors = all
    .map((f) => ({ f, note: notes.get(advisorKey(program.id, f.id)) ?? '' }))
    .filter((x) => x.note)
  const fundingText =
    r.funding.status === UNKNOWN ? null : `${r.funding.status}${r.funding.years ? ` · ${r.funding.years} yrs` : ''}`
  const stipendLine = r.funding.stipend ? stipendText(r.funding.stipend) : null

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'faculty', label: `Faculty${all.length ? ` · ${all.length}` : ''}` },
    { id: 'requirements', label: 'Requirements' },
    { id: 'notes', label: `Notes${notedAdvisors.length || noteDoc ? ' ·' : ''}${noteDoc ? ' doc' : ''}${notedAdvisors.length ? ` ${notedAdvisors.length}` : ''}` },
  ]

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-5xl px-5 py-4">
        <header className="mb-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-serif text-[21px] font-bold leading-tight text-slate-900">
              {program.university}
              <span className="font-normal text-slate-600"> — {program.program_name}</span>
            </h1>
            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-500">
              {program.degree_type}
            </span>
            <button
              onClick={onToggleSaved}
              className={`rounded border px-2 py-0.5 text-[12px] font-medium transition-colors ${
                saved
                  ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-amber-400 hover:text-amber-800'
              }`}
              title={saved ? 'Remove from Saved programs' : 'Save this program to your shortlist'}
            >
              {saved ? '★ Saved' : '☆ Save'}
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-600">
            <span>
              {program.discipline.primary} · {program.country}
              {/* "United States · US" says the same thing twice; only a
                  multi-country region adds information. */}
              {(program.region === 'Europe' || program.region === 'Asia-Pacific') && ` · ${program.region}`}
            </span>
            <span className="text-slate-300">|</span>
            <span className="font-medium">
              <EditableLink label="Program page" url={programPage} onSave={onSetProgramPage} />
            </span>
            {program.links.admissions && (
              <a
                href={program.links.admissions}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-indigo-600 hover:underline"
              >
                Admissions ↗
              </a>
            )}
          </div>
        </header>

        {/* The four facts */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Tile
            label="Deadline"
            value={dl.text}
            caption={DEADLINE_KIND_LABEL[dl.kind]}
            tone={dl.tone}
            onClick={() => setTab('requirements')}
          />
          <Tile
            label="Funding"
            value={fundingText ?? <span className="italic text-amber-700">Unknown / Verify</span>}
            caption={
              stipendLine ? (
                <span className="line-clamp-2">Stipend {stipendLine}</span>
              ) : r.funding.note && r.funding.note !== UNKNOWN ? (
                <span className="line-clamp-2">{r.funding.note}</span>
              ) : undefined
            }
            tone={r.funding.status === 'Fully Funded' ? 'emerald' : fundingText ? 'sky' : 'amber'}
            onClick={() => setTab('requirements')}
          />
          <Tile
            label="Application"
            value={plan ? APPLICATION_LABELS[plan.status] : <span className="text-slate-500">Not in your plan</span>}
            caption={
              plan ? (
                <>
                  {INTEREST_LABELS[plan.interest]} · {plan.cycle}
                  {plan.facultyCount > 0 && ` · ${plan.facultyCount} faculty`}
                </>
              ) : (
                'Plan tracks status, deadlines and contacts.'
              )
            }
            tone={plan ? 'indigo' : 'slate'}
            action={
              plan ? (
                <a
                  href={`#/planner/programs/${plan.entryId}`}
                  className="text-[12px] font-medium text-indigo-600 hover:underline"
                >
                  Open in Plan ↗
                </a>
              ) : (
                <button
                  onClick={async () => {
                    setAdding(true)
                    try {
                      await onAddToPlan()
                    } finally {
                      setAdding(false)
                    }
                  }}
                  disabled={adding}
                  className="rounded bg-indigo-600 px-2 py-0.5 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {adding ? 'Adding…' : '＋ Add to plan'}
                </button>
              )
            }
          />
          <Tile
            label="Saved advisors"
            value={
              savedAdvisors.length ? (
                `${savedAdvisors.length} of ${all.length}`
              ) : (
                <span className="text-slate-500">None yet</span>
              )
            }
            caption={
              savedAdvisors.length ? (
                <span className="line-clamp-2">
                  {savedAdvisors
                    .slice(0, 3)
                    .map((x) => `${'★'.repeat(x.level)} ${x.f.name}`)
                    .join(' · ')}
                  {savedAdvisors.length > 3 ? ' …' : ''}
                </span>
              ) : all.length ? (
                'Star an advisor on the Faculty tab.'
              ) : (
                'No advisors scanned here yet.'
              )
            }
            tone={savedAdvisors.length ? 'amber' : 'slate'}
            onClick={() => setTab('faculty')}
          />
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-slate-200" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3 py-1.5 text-[13px] font-medium transition-colors ${
                tab === t.id
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {tab === 'overview' && (
            <div className="grid gap-3 md:grid-cols-2">
              <StipendRent university={program.university} stipend={r.funding.stipend} />
              <section className="rounded-md border border-slate-200 bg-white p-3.5">
                <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Field
                </h2>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="indigo">{program.discipline.primary}</Badge>
                  {program.discipline.subs.map((s) => (
                    <span key={s} className="text-[12.5px] text-slate-600">
                      {s}
                    </span>
                  ))}
                </div>
              </section>
              <section className="rounded-md border border-slate-200 bg-white p-3.5">
                <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  How admission works
                </h2>
                <p className="text-[13.5px] font-medium text-slate-900">
                  {fieldOverrides.admission_model || (r.admission_model === UNKNOWN ? <span className="italic text-amber-700">Unknown / Verify</span> : r.admission_model)}
                </p>
                {!fieldOverrides.admission_model && r.admission_model_note && r.admission_model_note !== UNKNOWN && (
                  <p className="mt-1 text-[12.5px] leading-snug text-slate-600">{r.admission_model_note}</p>
                )}
              </section>
              <section className="rounded-md border border-slate-200 bg-white p-3.5">
                <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Contact before applying
                </h2>
                <p className="whitespace-pre-wrap text-[13.5px] font-medium text-slate-900">
                  {contactOverride ||
                    (r.pre_application_contact === UNKNOWN ? (
                      <span className="italic text-amber-700">Unknown / Verify</span>
                    ) : (
                      r.pre_application_contact
                    ))}
                </p>
                {!contactOverride && r.contact_note && r.contact_note !== UNKNOWN && (
                  <p className="mt-1 text-[12.5px] leading-snug text-slate-600">{r.contact_note}</p>
                )}
              </section>
              <section className="rounded-md border border-amber-200 bg-amber-50/60 p-3.5">
                <h2 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                  About this data
                </h2>
                <p className="text-[12.5px] leading-snug text-amber-900">{program.data_currency}</p>
              </section>
              {programSummary && (
                <section className="rounded-md border border-sky-200 bg-sky-50/50 p-3.5 md:col-span-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-sky-800">
                      What professors told you
                    </h2>
                    <span className="text-[11px] text-slate-500">
                      {programSummary.count} repl{programSummary.count === 1 ? 'y' : 'ies'} ·{' '}
                      {new Date(programSummary.updatedAt).toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-800">{programSummary.summary}</p>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    Summarised from replies to your own emails — not from anything the program published.
                  </p>
                </section>
              )}
            </div>
          )}

          {tab === 'faculty' && (
            <Roster
              programId={program.id}
              faculty={program.faculty}
              addedFaculty={addedFaculty}
              levels={levels}
              onSetLevel={onSetLevel}
              notes={notes}
              onSetNote={onSetNote}
              outreach={outreach}
              homepages={homepages}
              onSetHomepage={onSetHomepage}
              onAddAdvisor={onAddAdvisor}
              onRemoveFaculty={onRemoveFaculty}
              density={density}
              onSetDensity={setDensity}
            />
          )}

          {tab === 'requirements' && (
            <Requirements
              program={program}
              contactOverride={contactOverride}
              onSetContact={onSetContact}
              fields={fieldOverrides}
              onSetField={onSetField}
              cycle={cycle}
            />
          )}

          {tab === 'notes' && (
            <div className="space-y-3">
              <section className="rounded-md border border-slate-200 bg-white p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Program note
                    </h2>
                    <p className="mt-0.5 text-[12.5px] text-slate-600">
                      A Google Doc in your own Drive, seeded with this program's facts.
                    </p>
                  </div>
                  <ProgramNoteButton
                    program={program}
                    doc={noteDoc}
                    clientId={googleClientId}
                    connected={googleConnected}
                    onCreated={onNoteCreated}
                    onUnlink={onNoteUnlink}
                  />
                </div>
              </section>
              {plan?.notes && (
                <section className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3.5">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-indigo-800">
                    Plan notes
                  </h2>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">{plan.notes}</p>
                  <a href={`#/planner/programs/${plan.entryId}`} className="mt-1 inline-block text-[12px] font-medium text-indigo-600 hover:underline">
                    Edit in Plan ↗
                  </a>
                </section>
              )}
              <section className="rounded-md border border-slate-200 bg-white p-3.5">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  Advisor notes{notedAdvisors.length ? ` · ${notedAdvisors.length}` : ''}
                </h2>
                {notedAdvisors.length === 0 ? (
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    None yet. Open an advisor on the Faculty tab and add a note.
                  </p>
                ) : (
                  <ul className="mt-1.5 divide-y divide-slate-100">
                    {notedAdvisors.map(({ f, note }) => (
                      <li key={f.id} className="py-1.5">
                        <span className="text-[13px] font-medium text-slate-900">{f.name}</span>
                        <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700">{note}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
