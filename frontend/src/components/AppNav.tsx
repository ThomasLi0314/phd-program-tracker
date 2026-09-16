// Navigation for the tracker, and the hash routes behind it.
//
// Four places, named by what you are doing there:
//   Explore  — the database: programs, advisors, schools (and master's abroad)
//   Saved    — your shortlist: saved programs and saved advisors
//   Plan     — the application plan (a separate app at #/planner)
//   Contact  — emails to professors and what came back
// plus Settings for the account, backup and AI plumbing that used to crowd
// the header. The old labels ("★ My List", "★ Starred", "Planner") each meant
// "the things I picked" in a different way; these say which.

import type { ReactNode } from 'react'

export type Section = 'explore' | 'saved' | 'contact' | 'settings'

export interface TrackerLocation {
  section: Section
  /** 'programs' | 'advisors' | 'schools' under explore; 'programs' | 'advisors' under saved; 'emails' | 'summary' under contact */
  view: string
}

const DEFAULT_VIEW: Record<Section, string> = {
  explore: 'programs',
  saved: 'programs',
  contact: 'emails',
  settings: '',
}

const VIEWS: Record<Section, string[]> = {
  explore: ['programs', 'advisors', 'schools'],
  saved: ['programs', 'advisors'],
  contact: ['emails', 'summary'],
  settings: [],
}

export function parseLocation(route: string): TrackerLocation {
  const [a = '', b = ''] = route.split('/').filter(Boolean)
  const section = (['explore', 'saved', 'contact', 'settings'] as Section[]).includes(a as Section)
    ? (a as Section)
    : 'explore'
  const view = VIEWS[section].includes(b) ? b : DEFAULT_VIEW[section]
  return { section, view }
}

export function pathFor(section: Section, view?: string): string {
  const v = view ?? DEFAULT_VIEW[section]
  return v ? `/${section}/${v}` : `/${section}`
}

const primaryBtn = (active: boolean) =>
  `rounded px-3 py-1 text-[13px] font-medium transition-colors ${
    active ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`

export function PrimaryNav({
  loc,
  contactCount,
  onGo,
}: {
  loc: TrackerLocation
  contactCount: number
  onGo: (section: Section) => void
}) {
  return (
    <nav className="flex items-center gap-1" aria-label="Sections">
      <button onClick={() => onGo('explore')} className={primaryBtn(loc.section === 'explore')}>
        Explore
      </button>
      <button onClick={() => onGo('saved')} className={primaryBtn(loc.section === 'saved')}>
        Saved
      </button>
      <a
        href="#/planner"
        className={`${primaryBtn(false)} text-indigo-200 hover:text-white`}
        title="Your application plan — programs you are applying to, their status, deadlines and faculty"
      >
        Plan ↗
      </a>
      <button onClick={() => onGo('contact')} className={primaryBtn(loc.section === 'contact')}>
        Contact
        {contactCount > 0 && (
          <span className="ml-1 rounded-full bg-slate-700 px-1.5 text-[11px] tabular-nums text-slate-200">
            {contactCount}
          </span>
        )}
      </button>
    </nav>
  )
}

const subBtn = (active: boolean) =>
  `rounded px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
    active ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  }`

export function SubNav({
  loc,
  savedPrograms,
  savedAdvisors,
  onGo,
  right,
}: {
  loc: TrackerLocation
  savedPrograms: number
  savedAdvisors: number
  onGo: (view: string) => void
  right?: ReactNode
}) {
  const count = (n: number) => (
    <span className="ml-1 text-[11px] tabular-nums opacity-70">{n}</span>
  )
  let items: ReactNode = null
  if (loc.section === 'explore') {
    items = (
      <>
        <button onClick={() => onGo('programs')} className={subBtn(loc.view === 'programs')}>
          Programs
        </button>
        <button onClick={() => onGo('advisors')} className={subBtn(loc.view === 'advisors')}>
          Advisors
        </button>
        <button onClick={() => onGo('schools')} className={subBtn(loc.view === 'schools')}>
          Schools
        </button>
        <a
          href="#/masters"
          className={`${subBtn(false)} text-teal-700 hover:text-teal-900`}
          title="Master's programmes in Europe, Singapore and Hong Kong — tuition, scholarships and language requirements"
        >
          Master's abroad ↗
        </a>
      </>
    )
  } else if (loc.section === 'saved') {
    items = (
      <>
        <button onClick={() => onGo('programs')} className={subBtn(loc.view === 'programs')}>
          Programs{count(savedPrograms)}
        </button>
        <button onClick={() => onGo('advisors')} className={subBtn(loc.view === 'advisors')}>
          Advisors{count(savedAdvisors)}
        </button>
      </>
    )
  } else if (loc.section === 'contact') {
    items = (
      <>
        <button onClick={() => onGo('emails')} className={subBtn(loc.view === 'emails')}>
          Emails
        </button>
        <button onClick={() => onGo('summary')} className={subBtn(loc.view === 'summary')}>
          Summary
        </button>
      </>
    )
  }
  if (!items && !right) return null
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-1">{items}</div>
      {right && <div className="flex items-center gap-2 text-[12px] text-slate-500">{right}</div>}
    </div>
  )
}
