// The back arrow on a detail page.
//
// It returns to the page I actually came from, which is not always the list the
// page belongs to: opening a professor from a program sends me back to that
// program, not to the Faculty list. Only when the page was opened cold — a
// refresh, a bookmark, a pasted link — does it fall back to the list.
//
// Deliberately a real button rather than the small grey "← Programs" text it
// replaced: it is the control used most on these pages, and it was the easiest
// one to miss.

import { backTarget, goBack, segments } from '../lib/hashRoute'

/** A readable name for a route, for the arrow's label. */
function labelFor(route: string): string | null {
  const s = segments(route)
  if (s[0] === 'planner') {
    if (s[1] === 'programs') return s[2] ? 'program' : 'Programs'
    if (s[1] === 'faculty') return s[2] ? 'advisor' : 'Faculty'
    if (s[1] === 'dashboard') return 'Dashboard'
    if (s[1] === 'profile') return 'Research profile'
    if (s[1] === 'settings') return 'Settings'
    return 'Plan'
  }
  if (s[0] === 'masters') {
    if (s[1] === 'plan') return s[2] ? 'programme' : 'My plan'
    return "Master's abroad"
  }
  if (s[0] === 'explore') return 'Explore'
  if (s[0] === 'saved') return 'Saved'
  if (s[0] === 'contact') return 'Contact'
  return null
}

export function BackButton({ fallback, fallbackLabel }: { fallback: string; fallbackLabel: string }) {
  const prev = backTarget()
  const label = (prev && labelFor(prev)) ?? fallbackLabel
  return (
    <button
      onClick={() => goBack(fallback)}
      title={`Back to ${label}`}
      className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
    >
      <span aria-hidden className="text-[15px] leading-none">
        ←
      </span>
      Back to {label}
    </button>
  )
}
