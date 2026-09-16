// One advisor, everywhere.
//
// The same card serves the Advisors search, the Saved advisors list and a
// program's faculty roster, so a professor looks identical wherever you meet
// them and stars/notes behave the same way. Collapsed, it answers the four
// questions you ask while scanning — who, where, what, are they recruiting —
// in two lines of summary; everything else waits behind "More". The compact
// density is one row per person for long lists.

import { useState } from 'react'
import type { Faculty, OutreachRecord, Program } from '../types'
import { UNKNOWN } from '../types'
import { RecruitmentBadge } from './Badge'
import { StarRating } from './StarRating'
import { AdvisorNote } from './AdvisorNote'
import { OutreachBadge } from './OutreachBadge'
import { EditableLink } from './EditableLink'
import { Highlight } from './Highlight'

export type AdvisorDensity = 'card' | 'compact'

export function AdvisorCard({
  faculty,
  rows,
  level,
  onSetLevel,
  note,
  onSaveNote,
  record,
  homepage,
  onSetHomepage,
  onOpenProgram,
  terms,
  density = 'card',
  showUniversity = true,
  showPrograms = true,
  onRemove,
}: {
  faculty: Faculty
  /** Programs this person advises through, primary first. */
  rows: Program[]
  level: number
  onSetLevel: (n: number) => void
  note: string
  onSaveNote: (text: string) => void
  record?: OutreachRecord
  homepage: string
  onSetHomepage: (url: string) => void
  onOpenProgram?: (programId: string) => void
  /** Search terms to mark in the text. */
  terms?: string[]
  density?: AdvisorDensity
  /** Off inside a program's own roster, where the school is already on screen. */
  showUniversity?: boolean
  showPrograms?: boolean
  /** Present only for advisors the user added locally. */
  onRemove?: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const f = faculty
  const primary = rows[0]
  const summaryText = f.summary === UNKNOWN ? '' : f.summary
  const hasMore =
    f.tags.length > 0 || summaryText.length > 160 || (showPrograms && rows.length > 0) || !!record || !!note

  const addedChip =
    f.added &&
    (f.source_url ? (
      <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
        added · sourced
      </span>
    ) : (
      <span className="ml-1.5 rounded bg-indigo-100 px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
        added · verify
      </span>
    ))

  const where = [f.title, showUniversity && primary ? primary.university : '']
    .filter(Boolean)
    .join(' · ')

  const body = (
    <div className="mt-2 border-t border-slate-100 pt-2">
      {f.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {f.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
            >
              <Highlight text={tag} terms={terms} />
            </span>
          ))}
        </div>
      )}
      {summaryText && (
        <p className="mt-2 text-[13px] leading-relaxed text-slate-700">
          <Highlight text={summaryText} terms={terms} />
        </p>
      )}
      {showPrograms && rows.length > 0 && (
        <div className="mt-2 space-y-1">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenProgram?.(p.id)}
              disabled={!onOpenProgram}
              className="flex w-full items-center justify-between gap-2 rounded border border-indigo-100 bg-indigo-50/60 px-2 py-1 text-left transition-colors enabled:hover:border-indigo-300 enabled:hover:bg-indigo-50"
              title={onOpenProgram ? 'Open this program' : undefined}
            >
              <span className="min-w-0 truncate text-[12.5px] font-medium text-indigo-800">
                {p.university}
                <span className="font-normal text-indigo-600"> — {p.program_name}</span>
              </span>
              <span className="shrink-0 text-[11.5px] font-semibold text-indigo-600">
                {p.degree_type} · {p.region}
              </span>
            </button>
          ))}
          {rows.length > 1 && (
            <p className="text-[11px] text-slate-500">
              One person, {rows.length} programs — stars and notes apply to all of them.
            </p>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium">
        <EditableLink label="Homepage" url={homepage} onSave={onSetHomepage} />
        {f.links.scholar && (
          <a
            href={f.links.scholar}
            target="_blank"
            rel="noreferrer"
            className="text-indigo-600 hover:underline"
          >
            Google Scholar ↗
          </a>
        )}
        {f.source_url && (
          <span className="text-[11px] font-normal text-slate-500">
            from{' '}
            <a
              href={f.source_url}
              target="_blank"
              rel="noreferrer"
              className="underline [overflow-wrap:anywhere] hover:text-indigo-600"
            >
              {f.source_url.replace(/^https?:\/\//, '').slice(0, 50)}
            </a>
            {f.fetched_at && ` · read ${f.fetched_at}`}
          </span>
        )}
      </div>
      <div>
        <OutreachBadge record={record} />
      </div>
      <AdvisorNote note={note} onSave={onSaveNote} />
    </div>
  )

  const controls = (
    <div className="flex shrink-0 items-center gap-1.5">
      <RecruitmentBadge status={f.recruitment_status} />
      <StarRating level={level} onSetLevel={onSetLevel} />
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${f.name}, an advisor you added`}
          title="Remove this added advisor"
          className="text-[13px] text-slate-400 hover:text-rose-600"
        >
          ✕
        </button>
      )}
    </div>
  )

  if (density === 'compact') {
    return (
      <article
        className={`border-b border-slate-100 bg-white px-3 py-2 last:border-0 ${
          expanded ? 'bg-indigo-50/30' : ''
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex min-w-0 flex-1 items-baseline gap-x-3 text-left"
            aria-expanded={expanded}
          >
            <span className="shrink-0 font-serif text-[14px] font-bold text-slate-900">
              <Highlight text={f.name} terms={terms} />
              {addedChip}
            </span>
            <span className="min-w-0 truncate text-[12px] text-slate-600">{where}</span>
            {f.sub_field && f.sub_field !== 'Unspecified' && (
              <span className="hidden shrink-0 text-[12px] font-medium text-indigo-700 md:inline">
                <Highlight text={f.sub_field} terms={terms} />
              </span>
            )}
            {note && <span className="shrink-0 text-[12px]" title="You have a note on this advisor">📝</span>}
          </button>
          {controls}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[12px] text-slate-500 hover:text-indigo-600"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? '▴' : '▾'}
          </button>
        </div>
        {expanded && body}
      </article>
    )
  }

  return (
    <article
      className={`mb-3 break-inside-avoid rounded-md border bg-white p-3 ${
        f.added ? 'border-indigo-200' : 'border-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="font-serif text-[15px] font-bold leading-tight text-slate-900">
            <Highlight text={f.name} terms={terms} />
            {addedChip}
          </h4>
          {where && <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{where}</p>}
        </div>
        {controls}
      </div>

      {f.sub_field && f.sub_field !== 'Unspecified' && (
        <p className="mt-1.5 text-[12.5px] font-medium text-indigo-700">
          <Highlight text={f.sub_field} terms={terms} />
        </p>
      )}
      {!expanded && summaryText && (
        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-700">
          <Highlight text={summaryText} terms={terms} />
        </p>
      )}
      {!expanded && !summaryText && f.summary === UNKNOWN && (
        <p className="mt-1 text-[12.5px] italic text-amber-700">Summary not yet written.</p>
      )}

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 text-[12px] text-slate-600">
          {!expanded && record && (
            <span className={record.replyState === 'replied' ? 'text-emerald-700' : 'text-amber-700'}>
              {record.replyState === 'replied' ? '✓ replied' : '✉ emailed'}
            </span>
          )}
          {!expanded && note && (
            <span className="truncate" title={note}>
              📝 {note}
            </span>
          )}
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 text-[12px] font-medium text-slate-500 hover:text-indigo-600"
            aria-expanded={expanded}
          >
            {expanded ? 'Less ▴' : 'More ▾'}
          </button>
        )}
      </div>

      {expanded && body}
    </article>
  )
}
