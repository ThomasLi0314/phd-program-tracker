import type { Faculty, OutreachRecord, Program } from '../types'
import { UNKNOWN } from '../types'
import { Badge, RecruitmentBadge } from './Badge'
import { StarRating } from './StarRating'
import { AdvisorNote } from './AdvisorNote'
import { OutreachBadge } from './OutreachBadge'
import { EditableLink } from './EditableLink'
import { advisorKey } from '../lib/starredAdvisors'

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

function AdmissionMatrix({ program }: { program: Program }) {
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
        <MatrixCell
          label="Pre-Application Contact"
          value={r.pre_application_contact}
          note={r.contact_note}
          wide
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
}: {
  faculty: Faculty
  level: number
  onSetLevel: (n: number) => void
  note: string
  onSaveNote: (text: string) => void
  record?: OutreachRecord
  homepage: string
  onSetHomepage: (url: string) => void
}) {
  return (
    <article className="mb-3 break-inside-avoid rounded border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-serif text-[15px] font-bold leading-tight text-slate-900">
            {faculty.name}
          </h4>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{faculty.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <RecruitmentBadge status={faculty.recruitment_status} />
          <StarRating level={level} onSetLevel={onSetLevel} />
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

function FacultyWaterfall({
  programId,
  faculty,
  levels,
  onSetLevel,
  notes,
  onSetNote,
  outreach,
  homepages,
  onSetHomepage,
}: {
  programId: string
  faculty: Faculty[]
  levels: Map<string, number>
  onSetLevel: (key: string, level: number) => void
  notes: Map<string, string>
  onSetNote: (key: string, text: string) => void
  outreach: Record<string, OutreachRecord>
  homepages: Record<string, string>
  onSetHomepage: (key: string, url: string) => void
}) {
  const groups = new Map<string, Faculty[]>()
  for (const f of faculty) {
    if (!groups.has(f.sub_field)) groups.set(f.sub_field, [])
    groups.get(f.sub_field)!.push(f)
  }
  return (
    <section className="mt-5">
      <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span className="inline-block size-1.5 rounded-full bg-emerald-600" />
        B · Faculty Waterfall
        <span className="normal-case tracking-normal text-slate-400">
          {faculty.length} researchers, grouped by sub-field
        </span>
      </h2>
      {faculty.length === 0 && (
        <p className="text-sm italic text-slate-400">
          No faculty scraped yet for this program — add a faculty_directory to targets.yaml.
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

        <AdmissionMatrix program={program} />
        <FacultyWaterfall
          programId={program.id}
          faculty={program.faculty}
          levels={levels}
          onSetLevel={onSetLevel}
          notes={notes}
          onSetNote={onSetNote}
          outreach={outreach}
          homepages={homepages}
          onSetHomepage={onSetHomepage}
        />
      </div>
    </main>
  )
}
