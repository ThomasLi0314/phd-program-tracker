import type { Program } from '../types'
import { UNKNOWN } from '../types'
import type { SortKey } from '../lib/filters'
import { Badge } from './Badge'

function deadlineBadge(p: Program) {
  const display = p.requirements.deadline_display
  if (display === UNKNOWN) return <Badge tone="amber">Deadline: Verify</Badge>
  if (/paused/i.test(display)) return <Badge tone="rose">Admissions PAUSED</Badge>
  // compact form for the card: strip parentheticals
  const compact = display.replace(/\s*\(.*\)\s*/g, '').trim()
  return <Badge tone="amber">Deadline: {compact}</Badge>
}

function StarButton({
  active,
  onToggle,
  size = 'text-[15px]',
}: {
  active: boolean
  onToggle: () => void
  size?: string
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={active ? 'Remove from My List' : 'Add to My List'}
      aria-label={active ? 'Remove from My List' : 'Add to My List'}
      className={`${size} leading-none transition-colors ${
        active ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-500'
      }`}
    >
      {active ? '★' : '☆'}
    </button>
  )
}

function ProgramCard({
  program,
  selected,
  inList,
  onSelect,
  onToggleList,
}: {
  program: Program
  selected: boolean
  inList: boolean
  onSelect: () => void
  onToggleList: () => void
}) {
  const req = program.requirements
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelect()
      }}
      aria-pressed={selected}
      className={`block w-full cursor-pointer border-b border-slate-200 px-3 py-2.5 text-left transition-colors ${
        selected
          ? 'border-l-2 border-l-indigo-600 bg-indigo-50/60'
          : 'border-l-2 border-l-transparent hover:bg-slate-50'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-serif text-[15px] font-bold leading-tight text-slate-900">
          {program.university}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {program.degree_type}
          </span>
          <StarButton active={inList} onToggle={onToggleList} />
        </span>
      </div>
      <div className="mt-0.5 text-[13px] leading-snug text-slate-600">{program.program_name}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">
        {program.country} · {program.discipline.primary} · {program.faculty.length} faculty tracked
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {deadlineBadge(program)}
        {req.funding.status === 'Fully Funded' && <Badge tone="emerald">Fully Funded</Badge>}
        {req.ects !== null && <Badge tone="sky">{req.ects} ECTS</Badge>}
        {(req.gre === 'Not Accepted' || req.gre === 'Optional') && (
          <Badge tone="indigo">
            GRE: {req.gre === 'Not Accepted' ? 'Not Accepted' : 'Optional'}
          </Badge>
        )}
        {req.gre === UNKNOWN && <Badge tone="amber">GRE: Verify</Badge>}
      </div>
    </div>
  )
}

export function ProgramIndex({
  programs,
  selectedId,
  myList,
  sortBy,
  onSelect,
  onToggleList,
  onSortChange,
}: {
  programs: Program[]
  selectedId: string | null
  myList: Set<string>
  sortBy: SortKey
  onSelect: (id: string) => void
  onToggleList: (id: string) => void
  onSortChange: (key: SortKey) => void
}) {
  return (
    <nav className="h-full w-[340px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Program Index
        </span>
        <label className="flex items-center gap-1 text-[10px] text-slate-400">
          sort
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] font-medium text-slate-600"
          >
            <option value="university">University A–Z</option>
            <option value="deadline">Deadline (soonest)</option>
            <option value="fee">Fee (low → high)</option>
          </select>
        </label>
      </div>
      {programs.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">
          No programs match the current filters.
        </p>
      ) : (
        programs.map((p) => (
          <ProgramCard
            key={p.id}
            program={p}
            selected={p.id === selectedId}
            inList={myList.has(p.id)}
            onSelect={() => onSelect(p.id)}
            onToggleList={() => onToggleList(p.id)}
          />
        ))
      )}
    </nav>
  )
}
