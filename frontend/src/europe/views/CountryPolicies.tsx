// Tuition in Europe is mostly national law, not departmental policy: a German
// public university charges the same semester contribution whatever you study,
// and Norway's 2023 reform hit every non-EEA student at once. Verifying that
// once per country — and saying so — is more honest than copying a number onto
// forty programme rows as if each had been checked.

import type { CountryPolicy } from '../types'
import { Fact, Flag } from '../components/Bits'

export function CountryPolicies({
  countries,
  counts,
}: {
  countries: CountryPolicy[]
  counts: Map<string, number>
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <p className="mb-3 max-w-3xl text-[12px] leading-relaxed text-slate-500">
        These are the national rules a programme inherits when its own page publishes no separate
        figure. A programme row shows <span className="italic">national rule</span> when its tuition
        comes from here. Fees change yearly and several countries are mid-reform — treat every figure
        as a starting point and confirm on the linked page before you budget.
      </p>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {countries.map((c) => (
          <section key={c.country} className="rounded border border-slate-200 bg-white p-3">
            <header className="flex items-baseline justify-between">
              <h2 className="text-[13px] font-semibold text-slate-800">
                <Flag code={c.code} />
                {c.country}
              </h2>
              <span className="text-[10.5px] text-slate-400">
                {counts.get(c.country) ?? 0} programme{(counts.get(c.country) ?? 0) === 1 ? '' : 's'}
              </span>
            </header>

            <dl className="mt-2 space-y-1.5 text-[11.5px]">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Non-EU tuition
                </dt>
                <dd className="text-slate-800">
                  <Fact value={c.tuition.non_eu} />
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  EU/EEA tuition
                </dt>
                <dd className="text-slate-600">
                  <Fact value={c.tuition.eu} />
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Scholarships
                </dt>
                <dd className="text-slate-600">
                  <Fact value={c.scholarships} />
                </dd>
              </div>
              {c.living_cost && (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Living cost / visa proof
                  </dt>
                  <dd className="text-slate-600">
                    <Fact value={c.living_cost} />
                  </dd>
                </div>
              )}
            </dl>

            {c.note && (
              <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-snug text-slate-500">
                {c.note}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
