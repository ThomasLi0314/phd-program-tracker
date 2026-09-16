import type { Program } from '../types'
import { UNKNOWN } from '../types'
import type { SortKey } from '../lib/filters'
import { deadlineStatus } from '../lib/deadlineStatus'
import type { PlanSummary } from '../lib/planBridge'
import { Badge } from './Badge'

function SaveButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      title={active ? 'Remove from Saved programs' : 'Save this program'}
      aria-label={active ? 'Remove from Saved programs' : 'Save this program'}
      className={`text-[16px] leading-none transition-colors ${
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
  saved,
  plan,
  cycle,
  onSelect,
  onToggleSaved,
}: {
  program: Program
  selected: boolean
  saved: boolean
  plan: PlanSummary | undefined
  cycle: string
  onSelect: () => void
  onToggleSaved: () => void
}) {
  const req = program.requirements
  const dl = deadlineStatus(program, cycle)
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
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {program.degree_type}
          </span>
          <SaveButton active={saved} onToggle={onToggleSaved} />
        </span>
      </div>
      <div className="mt-0.5 text-[13px] leading-snug text-slate-700">{program.program_name}</div>
      <div className="mt-0.5 text-[12px] text-slate-500">
        {program.country} · {program.discipline.primary}
        {program.faculty.length > 0 && ` · ${program.faculty.length} advisors`}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <Badge tone={dl.tone} title={dl.detail}>
          {dl.kind === 'confirmed' ? '✓ ' : ''}
          {dl.text}
        </Badge>
        {req.funding.status === 'Fully Funded' && <Badge tone="emerald">Fully funded</Badge>}
        {(req.gre === 'Not Accepted' || req.gre === 'Optional') && (
          <Badge tone="indigo">GRE {req.gre === 'Not Accepted' ? 'not accepted' : 'optional'}</Badge>
        )}
        {req.gre === UNKNOWN && <Badge tone="amber">GRE unverified</Badge>}
        {plan && (
          <Badge tone="sky" title="This program is in your application plan">
            In plan
          </Badge>
        )}
      </div>
    </div>
  )
}

export function ProgramIndex({
  programs,
  selectedId,
  saved,
  plan,
  cycle,
  loading,
  sortBy,
  onSelect,
  onToggleSaved,
  onSortChange,
}: {
  programs: Program[]
  selectedId: string | null
  saved: Set<string>
  plan: Map<string, PlanSummary>
  cycle: string
  /** true while a selected field's data is still arriving */
  loading: boolean
  sortBy: SortKey
  onSelect: (id: string) => void
  onToggleSaved: (id: string) => void
  onSortChange: (key: SortKey) => void
}) {
  // Mounting a card per match froze the page once enough fields were ticked
  // (~1,400 programs). Same guard as the advisor search — the count stays honest.
  const RENDER_CAP = 150
  const visible = programs.slice(0, RENDER_CAP)

  return (
    <nav className="h-full w-[340px] shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-3 py-1.5 backdrop-blur">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600">
          {loading ? (
            <span className="animate-pulse normal-case tracking-normal text-slate-500">Loading programs…</span>
          ) : (
            `${programs.length.toLocaleString()} program${programs.length === 1 ? '' : 's'}`
          )}
        </span>
        <label className="flex items-center gap-1 text-[11px] text-slate-500">
          sort
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value as SortKey)}
            className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11.5px] font-medium text-slate-700"
          >
            <option value="university">University A–Z</option>
            <option value="deadline">Deadline (soonest)</option>
            <option value="fee">Fee (low → high)</option>
          </select>
        </label>
      </div>
      {programs.length === 0 ? (
        loading ? (
          <p className="animate-pulse px-4 py-10 text-center text-[13px] text-slate-500" role="status">
            Loading the selected fields…
          </p>
        ) : (
          <p className="px-4 py-10 text-center text-[13px] text-slate-500">
            No programs match these filters.
          </p>
        )
      ) : (
        <>
          {visible.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              selected={p.id === selectedId}
              saved={saved.has(p.id)}
              plan={plan.get(p.id)}
              cycle={cycle}
              onSelect={() => onSelect(p.id)}
              onToggleSaved={() => onToggleSaved(p.id)}
            />
          ))}
          {loading && (
            <p className="animate-pulse border-t border-slate-200 px-3 py-2 text-center text-[12px] text-slate-500">
              Still loading other selected fields…
            </p>
          )}
          {programs.length > RENDER_CAP && (
            <p className="border-t border-slate-200 px-3 py-3 text-center text-[12px] leading-relaxed text-slate-500">
              Showing the first {RENDER_CAP} of {programs.length.toLocaleString()}.
              <br />
              Narrow the filters to see the rest.
            </p>
          )}
        </>
      )}
    </nav>
  )
}
