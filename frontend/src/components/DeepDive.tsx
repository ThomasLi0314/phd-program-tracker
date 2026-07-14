import { useEffect, useState } from 'react'
import type { Faculty, OutreachRecord, Program } from '../types'
import { UNKNOWN } from '../types'
import { Badge, RecruitmentBadge } from './Badge'
import { StarRating } from './StarRating'
import { AdvisorNote } from './AdvisorNote'
import { OutreachBadge } from './OutreachBadge'
import { EditableLink } from './EditableLink'
import { advisorKey } from '../lib/starredAdvisors'
import { aiActive, researchAdvisor } from '../lib/deepseek'

function Value({ text }: { text: string }) {
  if (text === UNKNOWN) {
    return <span className="italic text-amber-700">Unknown / Verify</span>
  }
  return <>{text}</>
}

function MatrixCell({
  label,
  value,
  note,
  wide = false,
}: {
  label: string
  value: string
  note?: string
  wide?: boolean
}) {
  return (
    <div
      className={`rounded border border-slate-200 bg-white px-2.5 py-2 ${wide ? 'sm:col-span-2' : ''}`}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-medium leading-snug text-slate-900">
        <Value text={value} />
      </div>
      {note && note !== UNKNOWN && (
        <div className="mt-1 text-[11px] leading-snug text-slate-500">{note}</div>
      )}
    </div>
  )
}

/** Pre-Application Contact cell the user can overwrite (stored as an override).
 *  Shows the dataset value + note until overridden; then shows the custom text. */
function EditableContactCell({
  value,
  note,
  override,
  onSave,
}: {
  value: string
  note: string
  override: string
  onSave: (text: string) => void
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
    <div className="rounded border border-slate-200 bg-white px-2.5 py-2 sm:col-span-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          Pre-Application Contact
          {hasOverride && (
            <span className="ml-1 rounded bg-indigo-100 px-1 py-px text-[9px] font-medium text-indigo-600">
              custom
            </span>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            title="Edit contact info"
            className="text-[11px] text-slate-300 hover:text-indigo-600"
          >
            ✎
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            rows={3}
            placeholder="e.g. Email Prof. X (x@uni.edu) before applying; program coordinator gradadm@…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
              else if (e.key === 'Escape') setEditing(false)
            }}
            className="w-full resize-y rounded border border-indigo-300 px-2 py-1 text-[12.5px] leading-snug text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-200"
          />
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <button
              onClick={save}
              className="rounded bg-indigo-600 px-2 py-0.5 font-semibold text-white transition-colors hover:bg-indigo-700"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600">
              Cancel
            </button>
            {hasOverride && (
              <button
                onClick={() => {
                  onSave('')
                  setEditing(false)
                }}
                className="ml-auto text-slate-400 hover:text-rose-600"
              >
                reset to default
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-0.5 whitespace-pre-wrap text-[13px] font-medium leading-snug text-slate-900">
            {effective === UNKNOWN ? (
              <span className="italic text-amber-700">Unknown / Verify</span>
            ) : (
              effective
            )}
          </div>
          {!hasOverride && note && note !== UNKNOWN && (
            <div className="mt-1 text-[11px] leading-snug text-slate-500">{note}</div>
          )}
        </>
      )}
    </div>
  )
}

function AdmissionMatrix({
  program,
  contactOverride,
  onSetContact,
}: {
  program: Program
  contactOverride: string
  onSetContact: (text: string) => void
}) {
  const r = program.requirements
  const fundingValue =
    r.funding.status === UNKNOWN
      ? UNKNOWN
      : `${r.funding.status}${r.funding.years ? ` · ${r.funding.years} yrs` : ''}`
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span className="inline-block size-1.5 rounded-full bg-indigo-600" />
        A · Admission Matrix
      </h2>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
        <MatrixCell label="Deadline" value={r.deadline_display} />
        <MatrixCell label="Application Fee" value={r.fee_display} />
        <MatrixCell label="GRE" value={r.gre === 'Optional' ? 'Optional / Not Required' : r.gre} />
        <MatrixCell label="Letters" value={r.letters !== null ? `${r.letters} required` : UNKNOWN} />
        <MatrixCell label="English Requirement" value={r.english} wide />
        <MatrixCell
          label="Duration / Credits"
          value={r.ects !== null ? `${r.duration} · ${r.ects} ECTS` : r.duration}
        />
        <MatrixCell label="Admission Model" value={r.admission_model} note={r.admission_model_note} wide />
        <MatrixCell label="Funding" value={fundingValue} note={r.funding.note} wide />
        <EditableContactCell
          value={r.pre_application_contact}
          note={r.contact_note}
          override={contactOverride}
          onSave={onSetContact}
        />
      </div>
    </section>
  )
}

function FacultyCard({
  faculty,
  level,
  onSetLevel,
  note,
  onSaveNote,
  record,
  homepage,
  onSetHomepage,
  onRemove,
}: {
  faculty: Faculty
  level: number
  onSetLevel: (n: number) => void
  note: string
  onSaveNote: (text: string) => void
  record?: OutreachRecord
  homepage: string
  onSetHomepage: (url: string) => void
  onRemove?: () => void
}) {
  return (
    <article
      className={`mb-3 break-inside-avoid rounded border bg-white p-3 ${
        faculty.added ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-serif text-[15px] font-bold leading-tight text-slate-900">
            {faculty.name}
            {faculty.added && (
              <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-px align-middle text-[9px] font-semibold uppercase tracking-wide text-indigo-600">
                added · verify
              </span>
            )}
          </h4>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{faculty.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <RecruitmentBadge status={faculty.recruitment_status} />
          <StarRating level={level} onSetLevel={onSetLevel} />
          {onRemove && (
            <button
              onClick={onRemove}
              title="Remove this added advisor"
              className="text-[12px] text-slate-300 hover:text-rose-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {faculty.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
          >
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">
        {faculty.summary === UNKNOWN ? (
          <span className="italic text-amber-700">Summary pending — run the pipeline with LLM enrichment.</span>
        ) : (
          faculty.summary
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-medium">
        <EditableLink label="Homepage" url={homepage} onSave={onSetHomepage} />
        {faculty.links.scholar && (
          <a
            href={faculty.links.scholar}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Google Scholar ↗
          </a>
        )}
      </div>
      <div>
        <OutreachBadge record={record} />
      </div>
      <AdvisorNote note={note} onSave={onSaveNote} />
    </article>
  )
}

function slugId(name: string, existing: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'advisor'
  let id = base
  let i = 2
  while (existing.has(id)) id = `${base}-${i++}`
  return id
}

/** Add an advisor to a program by name, optionally auto-drafting the card with
 *  DeepSeek (from its training knowledge — the user reviews before adding). */
function AddAdvisorForm({
  university,
  programName,
  existingIds,
  onAdd,
  onClose,
}: {
  university: string
  programName: string
  existingIds: Set<string>
  onAdd: (f: Faculty) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [subField, setSubField] = useState('')
  const [tags, setTags] = useState('')
  const [summary, setSummary] = useState('')
  const [homepage, setHomepage] = useState('')
  const [scholar, setScholar] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const autofill = async () => {
    if (!name.trim()) return
    setBusy(true)
    setError(null)
    try {
      const d = await researchAdvisor(name.trim(), { university, program: programName })
      if (d.title) setTitle(d.title)
      setSubField(d.sub_field)
      setTags(d.tags.join(', '))
      setSummary(d.summary)
      setHomepage(d.homepage)
      setScholar(d.scholar)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const add = () => {
    if (!name.trim()) return
    const fac: Faculty = {
      id: slugId(name, existingIds),
      name: name.trim(),
      title: title.trim(),
      sub_field: subField.trim() || 'Unspecified',
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      summary: summary.trim(),
      recruitment_status: UNKNOWN,
      links: { homepage: homepage.trim() || null, scholar: scholar.trim() || null },
      added: true,
    }
    onAdd(fac)
    onClose()
  }

  const input = 'w-full rounded border border-slate-300 px-2 py-1 text-[12px] text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200'

  return (
    <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-slate-700">Add an advisor</h3>
        <button onClick={onClose} className="text-[11px] text-slate-400 hover:text-slate-600">
          close
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Professor name"
          autoFocus
          className={`${input} min-w-[180px] flex-1`}
        />
        <button
          onClick={autofill}
          disabled={!name.trim() || busy || !aiActive()}
          title={aiActive() ? 'Draft the card from DeepSeek (verify it)' : 'Enable DeepSeek in the Overview tab first'}
          className="rounded bg-slate-800 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40"
        >
          {busy ? 'Researching…' : '🤖 Auto-fill'}
        </button>
      </div>
      {!aiActive() && (
        <p className="mt-1 text-[11px] text-slate-400">
          Auto-fill needs DeepSeek enabled (📊 Overview → DeepSeek settings). You can also fill the
          fields by hand.
        </p>
      )}
      {error && <p className="mt-1 text-[11px] font-medium text-rose-600">{error}</p>}

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Assistant Professor)" className={input} />
        <input value={subField} onChange={(e) => setSubField(e.target.value)} placeholder="Sub-field" className={input} />
      </div>
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags, comma-separated" className={`${input} mt-2`} />
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Research summary" rows={2} className={`${input} mt-2 resize-y`} />
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input value={homepage} onChange={(e) => setHomepage(e.target.value)} placeholder="Homepage URL (optional)" className={input} />
        <input value={scholar} onChange={(e) => setScholar(e.target.value)} placeholder="Google Scholar URL (optional)" className={input} />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={add}
          disabled={!name.trim()}
          className="rounded bg-indigo-600 px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
        >
          Add advisor
        </button>
        <span className="text-[11px] text-slate-400">
          Added advisors are marked unverified &amp; stored only in your browser. Recruitment status
          defaults to “Verify”.
        </span>
      </div>
    </div>
  )
}

function FacultyWaterfall({
  programId,
  university,
  programName,
  faculty,
  addedFaculty,
  levels,
  onSetLevel,
  notes,
  onSetNote,
  outreach,
  homepages,
  onSetHomepage,
  onAddFaculty,
  onRemoveFaculty,
}: {
  programId: string
  university: string
  programName: string
  faculty: Faculty[]
  addedFaculty: Faculty[]
  levels: Map<string, number>
  onSetLevel: (key: string, level: number) => void
  notes: Map<string, string>
  onSetNote: (key: string, text: string) => void
  outreach: Record<string, OutreachRecord>
  homepages: Record<string, string>
  onSetHomepage: (key: string, url: string) => void
  onAddFaculty: (f: Faculty) => void
  onRemoveFaculty: (facultyId: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const all = [...faculty, ...addedFaculty]
  const groups = new Map<string, Faculty[]>()
  for (const f of all) {
    if (!groups.has(f.sub_field)) groups.set(f.sub_field, [])
    groups.get(f.sub_field)!.push(f)
  }
  const existingIds = new Set(all.map((f) => f.id))

  return (
    <section className="mt-5">
      <h2 className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span className="inline-block size-1.5 rounded-full bg-emerald-600" />
        B · Faculty Waterfall
        <span className="normal-case tracking-normal text-slate-400">
          {all.length} researchers, grouped by sub-field
        </span>
        <button
          onClick={() => setAdding((v) => !v)}
          className="ml-auto rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal text-slate-700 transition-colors hover:border-indigo-400 hover:text-indigo-700"
        >
          ＋ Add advisor
        </button>
      </h2>

      {adding && (
        <AddAdvisorForm
          university={university}
          programName={programName}
          existingIds={existingIds}
          onAdd={onAddFaculty}
          onClose={() => setAdding(false)}
        />
      )}

      {all.length === 0 && !adding && (
        <p className="text-sm italic text-slate-400">
          No faculty scraped yet for this program — use “＋ Add advisor” to add one.
        </p>
      )}
      {[...groups.entries()].map(([subField, members]) => (
        <div key={subField} className="mt-3 first:mt-0">
          <h3 className="mb-1.5 border-b border-slate-200 pb-1 font-serif text-[13px] font-bold text-slate-700">
            {subField} <span className="font-sans text-[11px] font-normal text-slate-400">({members.length})</span>
          </h3>
          <div className="gap-3 xl:columns-2 2xl:columns-3">
            {members.map((f) => {
              const key = advisorKey(programId, f.id)
              return (
                <FacultyCard
                  key={f.id}
                  faculty={f}
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

export function DeepDive({
  program,
  inList,
  onToggleList,
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
  onAddFaculty,
  onRemoveFaculty,
}: {
  program: Program | null
  inList: boolean
  onToggleList: () => void
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
  onAddFaculty: (f: Faculty) => void
  onRemoveFaculty: (facultyId: string) => void
}) {
  if (!program) {
    return (
      <main className="flex h-full flex-1 items-center justify-center bg-slate-50/40">
        <p className="text-sm text-slate-400">Select a program from the index to open its deep-dive.</p>
      </main>
    )
  }
  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-5xl px-5 py-4">
        <header className="mb-4">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-serif text-xl font-bold text-slate-900">
              {program.university}
              <span className="font-normal text-slate-500"> — {program.program_name}</span>
            </h1>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
              {program.degree_type}
            </span>
            <button
              onClick={onToggleList}
              className={`rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                inList
                  ? 'border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-amber-400 hover:text-amber-700'
              }`}
            >
              {inList ? '★ In My List — remove' : '☆ Add to My List'}
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge tone="slate">{program.region}</Badge>
            <Badge tone="slate">{program.country}</Badge>
            <Badge tone="indigo">{program.discipline.primary}</Badge>
            {program.discipline.subs.map((s) => (
              <span key={s} className="text-[11px] text-slate-400">
                {s}
              </span>
            ))}
            <span className="mx-1 text-slate-300">|</span>
            <span className="text-[11px] font-medium">
              <EditableLink label="Program page" url={programPage} onSave={onSetProgramPage} />
            </span>
            {program.links.admissions && (
              <a
                href={program.links.admissions}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-medium text-indigo-600 hover:underline"
              >
                Admissions ↗
              </a>
            )}
          </div>
          <p className="mt-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
            {program.data_currency}
          </p>
        </header>

        <AdmissionMatrix
          program={program}
          contactOverride={contactOverride}
          onSetContact={onSetContact}
        />
        <FacultyWaterfall
          programId={program.id}
          university={program.university}
          programName={program.program_name}
          faculty={program.faculty}
          addedFaculty={addedFaculty}
          levels={levels}
          onSetLevel={onSetLevel}
          notes={notes}
          onSetNote={onSetNote}
          outreach={outreach}
          homepages={homepages}
          onSetHomepage={onSetHomepage}
          onAddFaculty={onAddFaculty}
          onRemoveFaculty={onRemoveFaculty}
        />
      </div>
    </main>
  )
}
