// "My PhD Planner" — a personal application CRM layered over the shared
// program/faculty database.
//
// It is a separate application that happens to share a bundle: its own shell,
// its own navigation, its own storage namespace. The only things it borrows
// from the tracker are the reference dataset and a few presentational bits.

import { useMemo } from 'react'
import { navigate, segments, useHashRoute } from '../lib/hashRoute'
import { usePlanner } from './lib/usePlanner'
import { useReferencePool } from './lib/useReferencePool'
import { Dashboard } from './views/Dashboard'
import { ProgramsTable } from './views/ProgramsTable'
import { ProgramDetail } from './views/ProgramDetail'
import { FacultyTable } from './views/FacultyTable'
import { FacultyDetail } from './views/FacultyDetail'
import { ResearchProfileView } from './views/ResearchProfile'
import { SettingsView } from './views/Settings'

const NAV = [
  { path: '/planner', label: 'Dashboard' },
  { path: '/planner/programs', label: 'Programs' },
  { path: '/planner/faculty', label: 'Faculty' },
  { path: '/planner/profile', label: 'Research Profile' },
  { path: '/planner/settings', label: 'Settings' },
]

function SaveIndicator({ status }: { status: 'idle' | 'saving' | 'saved' }) {
  if (status === 'idle') return null
  return (
    <span className={`text-[11px] ${status === 'saving' ? 'text-slate-400' : 'text-emerald-600'}`}>
      {status === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}

export default function PlannerApp() {
  const route = useHashRoute()
  const planner = usePlanner()
  const pool = useReferencePool()

  // '/planner/programs/prog_x' → ['programs', 'prog_x']
  const parts = useMemo(() => segments(route).slice(1), [route])
  const section = parts[0] ?? ''
  const detailId = parts[1] ?? null

  const activePath = detailId ? `/planner/${section}` : route === '/planner/' ? '/planner' : route

  if (!planner.state) {
    return (
      <div className="flex h-full items-center justify-center bg-white text-sm text-slate-400">
        Loading your planner…
      </div>
    )
  }

  const state = planner.state

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 bg-slate-900 px-4 py-2 text-white">
        <div className="flex items-baseline gap-3">
          <h1 className="font-serif text-[15px] font-bold tracking-tight">Application Plan</h1>
          <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-300 ring-1 ring-inset ring-indigo-400/40">
            {state.settings.cycle}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={planner.saveStatus} />
          <a
            href="#/masters/plan"
            className="rounded border border-teal-400/50 bg-teal-500/15 px-2 py-1 text-[11px] font-medium text-teal-200 transition-colors hover:bg-teal-500/25"
            title="The application plan for master's programmes abroad"
          >
            Master's plan
          </a>
          <a
            href="#/"
            className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:bg-slate-700"
            title="Back to Explore — the program and faculty database"
          >
            ← Explore
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="w-[190px] shrink-0 border-r border-slate-200 bg-white py-3">
          {NAV.map((item) => {
            const active = activePath === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`block w-full px-4 py-1.5 text-left text-[13px] transition-colors ${
                  active
                    ? 'border-l-2 border-indigo-600 bg-indigo-50/60 font-semibold text-indigo-700'
                    : 'border-l-2 border-transparent text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            )
          })}

          <div className="mt-4 border-t border-slate-100 px-4 pt-3 text-[10.5px] leading-relaxed text-slate-400">
            {state.programs.length} program{state.programs.length === 1 ? '' : 's'} ·{' '}
            {state.faculty.length} faculty
            {pool.loading && <div className="mt-1 text-slate-300">loading database…</div>}
            {pool.failed.length > 0 && (
              <div className="mt-1 text-rose-500">
                {pool.failed.length} field{pool.failed.length === 1 ? '' : 's'} failed to load
              </div>
            )}
          </div>
        </nav>

        {section === '' ? (
          <Dashboard state={state} pool={pool} />
        ) : section === 'programs' ? (
          detailId ? (
            <ProgramDetail id={detailId} state={state} pool={pool} planner={planner} />
          ) : (
            <ProgramsTable state={state} pool={pool} planner={planner} />
          )
        ) : section === 'faculty' ? (
          detailId ? (
            <FacultyDetail id={detailId} state={state} pool={pool} planner={planner} />
          ) : (
            <FacultyTable state={state} pool={pool} planner={planner} />
          )
        ) : section === 'profile' ? (
          <ResearchProfileView state={state} planner={planner} />
        ) : section === 'settings' ? (
          <SettingsView state={state} planner={planner} />
        ) : (
          <main className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Nothing here. <button onClick={() => navigate('/planner')} className="ml-1 text-indigo-600 underline">Go to the dashboard</button>
          </main>
        )}
      </div>
    </div>
  )
}
