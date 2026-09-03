import { useState } from 'react'
import type { Program } from '../types'
import { createProgramDoc, docTitle } from '../lib/programDocs'
import type { ProgramDoc, SeedProgram } from '../lib/programDocs'

function seedFrom(p: Program): SeedProgram {
  const r = p.requirements
  return {
    id: p.id,
    university: p.university,
    program_name: p.program_name,
    degree_type: p.degree_type,
    country: p.country,
    region: p.region,
    discipline: [p.discipline.primary, ...p.discipline.subs.slice(0, 3)].join(' · '),
    deadline: r?.deadline_display ?? r?.deadline ?? null,
    funding: r?.funding?.status ?? null,
    programUrl: p.links?.program ?? null,
  }
}

/**
 * "Note" on a program: a Google Doc the user owns, one per program.
 *
 * The window is opened SYNCHRONOUSLY on the click and only pointed at the Doc
 * once Drive answers. Opening it after the await is what a popup blocker kills,
 * and the failure is silent — the doc gets created and the user sees nothing
 * happen.
 */
export function ProgramNoteButton({
  program,
  doc,
  clientId,
  connected,
  onCreated,
  onUnlink,
}: {
  program: Program
  doc: ProgramDoc | undefined
  clientId: string
  connected: boolean
  onCreated: (programId: string, doc: ProgramDoc) => void
  onUnlink: (programId: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (doc) {
    return (
      <span className="inline-flex items-center gap-1">
        <a
          href={doc.url}
          target="_blank"
          rel="noreferrer"
          title={`Open "${doc.title}" in Google Docs`}
          className="rounded border border-emerald-400 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
        >
          📝 Note ↗
        </a>
        <button
          onClick={() => {
            if (
              confirm(
                'Unlink this note?\n\nThe Google Doc is NOT deleted — it stays in your Drive. This only forgets the link so you can create a fresh one.',
              )
            ) {
              onUnlink(program.id)
            }
          }}
          title="Forget this link (the Doc stays in your Drive)"
          className="text-[11px] text-slate-300 transition-colors hover:text-slate-500"
        >
          ✕
        </button>
      </span>
    )
  }

  const create = async () => {
    setError(null)
    if (!clientId || !connected) {
      setError('Connect Google first (the “Connect Gmail” button in the header).')
      return
    }
    // Claimed before the await, or the blocker eats it.
    const tab = window.open('', '_blank')
    setBusy(true)
    try {
      const created = await createProgramDoc(clientId, seedFrom(program))
      onCreated(program.id, created)
      if (tab) tab.location.href = created.url
      else window.open(created.url, '_blank')
    } catch (e) {
      tab?.close()
      setError(String((e as Error)?.message ?? e).slice(0, 160))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        onClick={create}
        disabled={busy}
        title={
          connected
            ? `Create "${docTitle(seedFrom(program))}" in your Google Drive and open it`
            : 'Connect Google first to create note Docs'
        }
        className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-50"
      >
        {busy ? 'Creating…' : '📝 Add note'}
      </button>
      {error && (
        <span className="max-w-md text-[10.5px] leading-tight text-rose-600" role="alert">
          {error}
        </span>
      )}
    </span>
  )
}
