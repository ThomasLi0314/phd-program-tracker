// Settings — the global cycle, staleness threshold, and the export/import that
// makes months of planner work survivable (spec §31).

import { useRef, useState } from 'react'
import type { PlannerState } from '../types'
import type { PlannerApi } from '../lib/usePlanner'
import { downloadPlanner, parsePlannerFile, type ParseResult } from '../lib/plannerIO'
import { providerSummary } from '../lib/research'
import { loadBaseUrl, loadPlannerModel, saveBaseUrl, savePlannerModel } from '../lib/research/llm'

export function SettingsView({ state, planner }: { state: PlannerState; planner: PlannerApi }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<ParseResult | null>(null)
  const provider = providerSummary()
  const [baseUrl, setBaseUrl] = useState(loadBaseUrl)
  const [model, setModel] = useState(loadPlannerModel)

  const onFile = async (file: File) => {
    setPending(parsePlannerFile(await file.text()))
  }

  const card = 'rounded-lg border border-slate-200 bg-white p-3.5'
  const heading = 'mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400'

  return (
    <main className="h-full flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-3 px-5 py-4">
        <h1 className="font-serif text-lg font-bold text-slate-900">Settings</h1>

        <section className={card}>
          <h2 className={heading}>Application cycle</h2>
          <label className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
            Default target cycle
            <input
              value={state.settings.cycle}
              onChange={(e) => planner.updateSettings({ cycle: e.target.value })}
              className="w-40 rounded border border-slate-300 px-2 py-1 text-[12.5px] text-slate-800 focus:border-indigo-400 focus:outline-none"
            />
          </label>
          <p className="mt-1 text-[11px] text-slate-400">
            Applies to programs you add from now on; each program keeps its own cycle so you can
            track more than one at a time.
          </p>
        </section>

        <section className={card}>
          <h2 className={heading}>Freshness</h2>
          <label className="flex flex-wrap items-center gap-2 text-[12px] text-slate-600">
            Flag researched values as stale after
            <input
              type="number"
              min={7}
              max={365}
              value={state.settings.staleAfterDays}
              onChange={(e) =>
                planner.updateSettings({ staleAfterDays: Math.max(7, Number(e.target.value) || 60) })
              }
              className="w-20 rounded border border-slate-300 px-2 py-1 text-[12.5px] text-slate-800 focus:border-indigo-400 focus:outline-none"
            />
            days
          </label>
          <p className="mt-1 text-[11px] text-slate-400">
            Deadlines, GRE policy and recruiting status are the fields most worth rechecking.
          </p>
        </section>

        <section className={card}>
          <h2 className={heading}>Backup</h2>
          <p className="mb-2 text-[12px] leading-relaxed text-slate-600">
            The planner lives in this browser's storage, which “clear browsing data” erases
            permanently. Export a copy regularly — it is the only durable record.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => downloadPlanner(state)}
              className="rounded bg-indigo-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-indigo-700"
            >
              Export Planner
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:border-indigo-400"
            >
              Import Planner…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
            <span className="text-[11px] text-slate-400">
              {state.programs.length} programs · {state.faculty.length} faculty
            </span>
          </div>

          {pending && (
            <div
              className={`mt-3 rounded border px-3 py-2 text-[12px] ${
                pending.ok ? 'border-indigo-200 bg-indigo-50' : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              {pending.ok && pending.planner ? (
                <>
                  <p className="text-slate-700">
                    This file holds <b>{pending.summary?.programs} programs</b> and{' '}
                    <b>{pending.summary?.faculty} faculty</b>, exported {pending.summary?.exportedAt}.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        planner.mergeIn(pending.planner!)
                        setPending(null)
                      }}
                      className="rounded bg-indigo-600 px-2.5 py-1 text-[11.5px] font-semibold text-white hover:bg-indigo-700"
                    >
                      Merge into my planner
                    </button>
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            'Replace everything currently in your planner with this file? This cannot be undone.',
                          )
                        ) {
                          planner.replaceAll(pending.planner!)
                          setPending(null)
                        }
                      }}
                      className="rounded border border-rose-300 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-rose-700 hover:bg-rose-50"
                    >
                      Replace everything
                    </button>
                    <button
                      onClick={() => setPending(null)}
                      className="text-[11.5px] text-slate-500 hover:underline"
                    >
                      cancel
                    </button>
                  </div>
                  <p className="mt-1.5 text-[10.5px] text-slate-500">
                    Merge keeps what you already have and adds anything new. Replace discards your
                    current planner.
                  </p>
                </>
              ) : (
                <>
                  <p>{pending.error}</p>
                  <button
                    onClick={() => setPending(null)}
                    className="mt-1 text-[11.5px] text-rose-700 underline"
                  >
                    dismiss
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        <section className={card}>
          <h2 className={heading}>Research provider</h2>
          <p className="text-[12px] leading-relaxed text-slate-600">
            Research reads a program or professor’s real pages through a reader service, then asks a
            model to extract only what those pages actually say. The planner stays fully usable
            without it — no button silently depends on an external API.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="text-slate-500">{provider.name}</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-medium ${
                provider.ready
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              {provider.ready ? 'ready' : 'no API key'}
            </span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500">
                API base URL <span className="text-slate-400">(any OpenAI-compatible endpoint)</span>
              </span>
              <input
                defaultValue={baseUrl}
                onBlur={(e) => {
                  saveBaseUrl(e.target.value)
                  setBaseUrl(e.target.value.trim() || provider.endpoint)
                }}
                className="w-full rounded border border-slate-300 px-2 py-1 text-[12px] text-slate-800 focus:border-indigo-400 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-slate-500">Model</span>
              <input
                defaultValue={model}
                onBlur={(e) => {
                  savePlannerModel(e.target.value)
                  setModel(e.target.value.trim() || loadPlannerModel())
                }}
                className="w-full rounded border border-slate-300 px-2 py-1 text-[12px] text-slate-800 focus:border-indigo-400 focus:outline-none"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[10.5px] leading-relaxed text-slate-400">
            The API key is shared with the tracker (📊 Overview → DeepSeek settings). On a static
            site there is no server to hold a secret, so it stays in this browser and is sent
            straight to the provider — nothing passes through a server of ours. Point the base URL
            at a proxy if you would rather it never leave your machine.
          </p>
        </section>
      </div>
    </main>
  )
}
