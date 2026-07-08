import type { ReactNode } from 'react'
import type { RecruitmentStatus } from '../types'

export type Tone = 'emerald' | 'amber' | 'sky' | 'rose' | 'slate' | 'indigo'

const TONES: Record<Tone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-600/25',
  amber: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  sky: 'bg-sky-50 text-sky-700 ring-sky-600/25',
  rose: 'bg-rose-50 text-rose-700 ring-rose-600/25',
  slate: 'bg-slate-100 text-slate-600 ring-slate-400/30',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-600/25',
}

const SOLID_TONES: Record<Tone, string> = {
  emerald: 'bg-emerald-600 text-white ring-emerald-600',
  amber: 'bg-amber-500 text-white ring-amber-500',
  sky: 'bg-sky-600 text-white ring-sky-600',
  rose: 'bg-rose-600 text-white ring-rose-600',
  slate: 'bg-slate-500 text-white ring-slate-500',
  indigo: 'bg-indigo-600 text-white ring-indigo-600',
}

export function Badge({
  tone = 'slate',
  solid = false,
  children,
}: {
  tone?: Tone
  solid?: boolean
  children: ReactNode
}) {
  const palette = solid ? SOLID_TONES[tone] : TONES[tone]
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium leading-4 ring-1 ring-inset ${palette}`}
    >
      {children}
    </span>
  )
}

export function RecruitmentBadge({ status }: { status: RecruitmentStatus }) {
  if (status === 'Looking for Students') {
    return (
      <Badge tone="emerald" solid>
        Looking for Students
      </Badge>
    )
  }
  if (status === 'Not Advising') {
    return <Badge tone="slate">Not Advising</Badge>
  }
  return <Badge tone="amber">Status: Unknown / Verify</Badge>
}
