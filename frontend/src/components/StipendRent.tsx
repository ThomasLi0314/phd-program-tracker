// "Stipend & rent" card on a program's overview: what the program pays, what
// renting near campus costs, and how much of the one the other takes. Every
// number links to where it came from; a missing number says so plainly.

import { useState } from 'react'
import type { Stipend } from '../types'
import { money, rentShare, SCOPE_LABEL, stipendText, useHousingPlace } from '../lib/costOfLiving'

const heading = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500'

export function StipendRent({ university, stipend }: { university: string; stipend: Stipend | undefined }) {
  const { place } = useHousingPlace(university)
  const [showSources, setShowSources] = useState(false)
  const text = stipend ? stipendText(stipend) : null
  const share = rentShare(stipend, place)
  const shareTone =
    share == null ? 'text-slate-400' : share <= 0.35 ? 'text-emerald-700' : share <= 0.5 ? 'text-amber-700' : 'text-rose-700'

  return (
    <section className="rounded-md border border-slate-200 bg-white p-3.5 md:col-span-2">
      <h2 className={`${heading} mb-2`}>Stipend &amp; rent</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {/* Stipend */}
        <div>
          <div className="text-[11.5px] font-medium text-slate-500">Stipend</div>
          {text ? (
            <>
              <div className="text-[15px] font-semibold text-slate-900">{text}</div>
              <div className="text-[12px] leading-snug text-slate-600">
                {SCOPE_LABEL[stipend!.scope ?? ''] ?? ''}
                {stipend!.academic_year ? ` · ${stipend!.academic_year}` : ''}
                {stipend!.source && (
                  <>
                    {' · '}
                    <a
                      href={stipend!.source}
                      target="_blank"
                      rel="noreferrer"
                      title={stipend!.quote ? `“${stipend!.quote}”` : undefined}
                      className="text-indigo-600 hover:underline"
                    >
                      source ↗
                    </a>
                  </>
                )}
              </div>
              {stipend!.period === '9-month' && (
                <div className="text-[11.5px] text-slate-500">9-month pay; summer support not included.</div>
              )}
              {stipend!.note && (
                <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-slate-500" title={stipend!.note}>
                  {stipend!.note}
                </div>
              )}
            </>
          ) : stipend ? (
            <>
              <div className="text-[14px] italic text-amber-700">No official figure found</div>
              <div className="text-[11.5px] leading-snug text-slate-500">
                {stipend.note && stipend.note !== 'not found on official pages' ? `${stipend.note} · ` : ''}checked{' '}
                {stipend.checked_at ?? ''}
              </div>
            </>
          ) : (
            <div className="text-[14px] italic text-slate-400">Not checked yet</div>
          )}
        </div>

        {/* Rent */}
        <div>
          <div className="text-[11.5px] font-medium text-slate-500">
            Average rent{place ? ` · ${place.city}` : ''}
          </div>
          {place && place.average != null ? (
            <>
              <div className="text-[15px] font-semibold text-slate-900">{money(place.average, place.currency)} / month</div>
              <button
                onClick={() => setShowSources((v) => !v)}
                className="text-[12px] text-indigo-600 hover:underline"
                title={place.measure}
              >
                mean of {place.sources.length} published figure{place.sources.length === 1 ? '' : 's'} {showSources ? '▾' : '▸'}
              </button>
            </>
          ) : (
            <div className="text-[14px] italic text-slate-400">{place ? 'No figure found' : 'Not available'}</div>
          )}
        </div>

        {/* Ratio */}
        <div>
          <div className="text-[11.5px] font-medium text-slate-500">Rent as a share of stipend</div>
          {share != null ? (
            <>
              <div className={`text-[15px] font-semibold ${shareTone}`}>{Math.round(share * 100)}%</div>
              <div className="text-[12px] text-slate-600">
                12 months of rent ÷ {stipend!.period === 'monthly' ? '12 × monthly stipend' : 'the stipend'}
              </div>
            </>
          ) : (
            <div className="text-[14px] italic text-slate-400">
              {text && place?.average != null && stipend?.currency !== place.currency ? 'Different currencies' : '—'}
            </div>
          )}
        </div>
      </div>

      {showSources && place && (
        <div className="mt-2.5 border-t border-slate-100 pt-2">
          <p className="mb-1 text-[11.5px] text-slate-500">{place.measure}.</p>
          <ul className="space-y-1">
            {place.sources.map((s) => (
              <li key={s.label} className="text-[12px] leading-snug">
                <span className="font-medium text-slate-800">{money(s.value, place.currency)}</span>
                <span className="text-slate-600"> — {s.label}</span>
                {s.period && <span className="text-slate-400"> · {s.period}</span>}{' '}
                <a href={s.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                  ↗
                </a>
                {s.note && <div className="text-[11px] text-slate-500">{s.note}</div>}
              </li>
            ))}
          </ul>
          {place.note && <p className="mt-1 text-[11.5px] text-slate-500">{place.note}</p>}
        </div>
      )}
    </section>
  )
}
