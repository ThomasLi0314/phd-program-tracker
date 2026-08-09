// "My Research Profile" (spec §13) — the description of my own background that
// the fit analysis will read in Phase 3. Seeded with editable text; entirely
// mine to rewrite.

import type { PlannerState } from '../types'
import type { PlannerApi } from '../lib/usePlanner'
import { DEFAULT_PROFILE } from '../lib/storage'

export function ResearchProfileView({
  state,
  planner,
}: {
  state: PlannerState
  planner: PlannerApi
}) {
  const isDefault = state.researchProfile.trim() === DEFAULT_PROFILE.trim()

  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-4">
        <h1 className="font-serif text-lg font-bold text-slate-900">My Research Profile</h1>
        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">
          Describe your own background in your own words. Faculty fit analysis will compare this
          against what each professor actually works on, so specifics — methods, systems, the
          problems you care about — matter more than titles.
        </p>

        <textarea
          value={state.researchProfile}
          onChange={(e) => planner.setResearchProfile(e.target.value)}
          rows={18}
          className="mt-3 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        />

        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-400">
            {state.researchProfile.trim().split(/\s+/).filter(Boolean).length} words
            {isDefault && ' · still the seeded text — worth making it yours'}
          </p>
          {!isDefault && (
            <button
              onClick={() => planner.setResearchProfile(DEFAULT_PROFILE)}
              className="text-[11px] text-slate-500 hover:text-indigo-700 hover:underline"
            >
              Reset to the seeded text
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
