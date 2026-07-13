import { useMemo, useState } from 'react'
import type { Faculty, OutreachRecord, Program, ReplyAnalysis, ReplyType } from '../types'
import { advisorKey } from '../lib/starredAdvisors'
import { REPLY_TYPES } from '../lib/outreach'
import { AiSettings } from './AiSettings'

interface Hit {
  faculty: Faculty
  program: Program
}

const REC_TONE: Record<string, string> = {
  yes: 'bg-emerald-100 text-emerald-700',
  no: 'bg-rose-100 text-rose-700',
  unclear: 'bg-slate-100 text-slate-500',
}

const STALE_DAYS = 14
const daysSince = (ms: number) => Math.floor((Date.now() - ms) / 86_400_000)

type GroupBy = 'field' | 'school'

const CHIP_TONE: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800',
  amber: 'bg-amber-100 text-amber-800',
  rose: 'bg-rose-100 text-rose-700',
  orange: 'bg-orange-100 text-orange-800',
  slate: 'bg-slate-100 text-slate-600',
}

interface GroupStat {
  key: string
  total: number
  replied: number
  awaiting: number
  stale: number
  byType: Partial<Record<ReplyType, number>>
}

/** A read-only dashboard: every tracked outreach, grouped by field or school,
 *  with reply-status and reply-type breakdowns. */
export function OutreachOverview({
  pool,
  records,
  programSummaries,
  onOpenProgram,
}: {
  pool: Hit[]
  records: Record<string, OutreachRecord>
  programSummaries: Record<string, { summary: string; updatedAt: number; count: number }>
  onOpenProgram: (programId: string) => void
}) {
  const [groupBy, setGroupBy] = useState<GroupBy>('field')

  const poolByKey = useMemo(() => {
    const m = new Map<string, Hit>()
    for (const h of pool) m.set(advisorKey(h.program.id, h.faculty.id), h)
    return m
  }, [pool])

  const recList = useMemo(() => Object.values(records), [records])

  const totals = useMemo(() => {
    let replied = 0,
      awaiting = 0,
      stale = 0
    for (const r of recList) {
      if (r.replyState === 'replied') replied++
      else {
        awaiting++
        if (daysSince(r.sentAt) >= STALE_DAYS) stale++
      }
    }
    return { total: recList.length, replied, awaiting, stale }
  }, [recList])

  const groups = useMemo(() => {
    const map = new Map<string, GroupStat>()
    for (const r of recList) {
      const hit = poolByKey.get(r.facultyKey)
      const key =
        groupBy === 'field'
          ? (hit?.program.discipline.primary ?? 'Unknown field')
          : (hit?.program.university ?? 'Unknown school')
      let g = map.get(key)
      if (!g) {
        g = { key, total: 0, replied: 0, awaiting: 0, stale: 0, byType: {} }
        map.set(key, g)
      }
      g.total++
      if (r.replyState === 'replied') {
        g.replied++
        if (r.replyType) g.byType[r.replyType] = (g.byType[r.replyType] ?? 0) + 1
      } else {
        g.awaiting++
        if (daysSince(r.sentAt) >= STALE_DAYS) g.stale++
      }
    }
    return [...map.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key))
  }, [recList, poolByKey, groupBy])

  // School → program grouping of AI-analyzed replies, for the admissions summary.
  const aiSchools = useMemo(() => {
    const schools = new Map<
      string,
      Map<string, { program: string; programId: string; replies: { name: string; ai: ReplyAnalysis }[] }>
    >()
    for (const r of recList) {
      if (r.replyState !== 'replied' || !r.ai) continue
      const hit = poolByKey.get(r.facultyKey)
      const uni = hit?.program.university ?? 'Unknown school'
      const programId = r.facultyKey.split('/')[0]
      const programName = hit?.program.program_name ?? programId
      if (!schools.has(uni)) schools.set(uni, new Map())
      const progs = schools.get(uni)!
      if (!progs.has(programId)) progs.set(programId, { program: programName, programId, replies: [] })
      progs.get(programId)!.replies.push({ name: hit?.faculty.name ?? r.toName, ai: r.ai })
    }
    return [...schools.entries()]
      .map(([uni, progs]) => ({ uni, programs: [...progs.values()] }))
      .sort((a, b) => a.uni.localeCompare(b.uni))
  }, [recList, poolByKey])

  const rate = totals.total ? Math.round((totals.replied / totals.total) * 100) : 0

  const tiles = [
    { label: 'Emailed', value: totals.total, tone: 'text-slate-900' },
    { label: `Replied · ${rate}%`, value: totals.replied, tone: 'text-emerald-700' },
    { label: 'Awaiting', value: totals.awaiting - totals.stale, tone: 'text-amber-700' },
    { label: 'No reply 14d+', value: totals.stale, tone: 'text-rose-700' },
  ]

  return (
    <main className="h-full flex-1 overflow-y-auto bg-slate-50/40">
      <div className="mx-auto max-w-4xl px-5 py-4">
        <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-serif text-lg font-bold text-slate-900">Outreach Overview</h1>
            <p className="text-[12px] text-slate-500">
              All 套磁 outreach and reply status, grouped by field or school.
            </p>
          </div>
          <div className="flex gap-1">
            {(['field', 'school'] as GroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`rounded px-2.5 py-1 text-[12px] font-medium capitalize transition-colors ${
                  groupBy === g ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                By {g}
              </button>
            ))}
          </div>
        </header>

        <AiSettings />

        {totals.total === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No tracked outreach yet. Sync Gmail or add one manually in the Outreach tab.
          </p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {tiles.map((t) => (
                <div key={t.label} className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className={`font-serif text-2xl font-bold tabular-nums ${t.tone}`}>{t.value}</div>
                  <div className="text-[11px] font-medium text-slate-500">{t.label}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2.5">
              {groups.map((g) => {
                const answeredAwaiting = g.awaiting - g.stale
                const pct = (n: number) => (g.total ? (n / g.total) * 100 : 0)
                return (
                  <section key={g.key} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 className="font-serif text-[14px] font-bold text-slate-800">{g.key}</h2>
                      <span className="text-[11px] font-medium text-slate-400">
                        {g.total} emailed · {g.total ? Math.round((g.replied / g.total) * 100) : 0}% replied
                      </span>
                    </div>

                    {/* stacked status bar */}
                    <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                      {g.replied > 0 && (
                        <div className="bg-emerald-500" style={{ width: `${pct(g.replied)}%` }} />
                      )}
                      {answeredAwaiting > 0 && (
                        <div className="bg-amber-400" style={{ width: `${pct(answeredAwaiting)}%` }} />
                      )}
                      {g.stale > 0 && <div className="bg-rose-400" style={{ width: `${pct(g.stale)}%` }} />}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium">
                      {g.replied > 0 && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                          ✅ replied {g.replied}
                        </span>
                      )}
                      {answeredAwaiting > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                          ⏳ awaiting {answeredAwaiting}
                        </span>
                      )}
                      {g.stale > 0 && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-700">
                          🔴 no reply {g.stale}
                        </span>
                      )}
                      {/* reply-type breakdown */}
                      {REPLY_TYPES.filter((t) => g.byType[t.id]).map((t) => (
                        <span
                          key={t.id}
                          className={`rounded-full px-2 py-0.5 ${CHIP_TONE[t.tone] ?? CHIP_TONE.slate}`}
                        >
                          {t.short} {g.byType[t.id]}
                        </span>
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>

            {aiSchools.length > 0 && (
              <section className="mt-6">
                <h2 className="mb-2 font-serif text-[15px] font-bold text-slate-800">
                  🤖 Admissions summary by school → program
                  <span className="ml-2 font-sans text-[11px] font-normal text-slate-400">
                    DeepSeek read of professor replies
                  </span>
                </h2>
                <div className="space-y-3">
                  {aiSchools.map((s) => (
                    <div key={s.uni} className="rounded-lg border border-slate-200 bg-white p-3">
                      <h3 className="font-serif text-[14px] font-bold text-slate-900">{s.uni}</h3>
                      <div className="mt-1.5 space-y-2.5">
                        {s.programs.map((p) => {
                          const sum = programSummaries[p.programId]
                          return (
                            <div key={p.programId} className="border-l-2 border-indigo-200 pl-2.5">
                              <button
                                onClick={() => onOpenProgram(p.programId)}
                                className="text-left text-[12.5px] font-semibold text-indigo-700 hover:underline"
                              >
                                {p.program}
                              </button>
                              {sum && (
                                <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
                                  {sum.summary}
                                </p>
                              )}
                              <div className="mt-1 flex flex-wrap gap-1">
                                {p.replies.map((r, i) => (
                                  <span
                                    key={i}
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                      REC_TONE[r.ai.recruiting] ?? REC_TONE.unclear
                                    }`}
                                    title={r.ai.summary}
                                  >
                                    {r.name}: {r.ai.recruiting === 'yes'
                                      ? 'recruiting'
                                      : r.ai.recruiting === 'no'
                                        ? 'not recruiting'
                                        : 'unclear'}
                                    {r.ai.funding === 'yes' ? ' · funded' : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
