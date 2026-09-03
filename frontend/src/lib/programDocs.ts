// One Google Doc per program, for the notes that don't fit a form field —
// call notes, questions for a POC, why this program moved up or down.
//
// A Doc rather than a textarea because these notes get long, get pasted into
// emails, and get read on a phone. The app stores only the pointer; Google
// stores the writing.
//
// Scope is drive.file, which is per-file consent: this app can only touch files
// it created itself, so the user's existing Drive stays invisible to us. The
// Doc lands in the root of their Drive where they can move, share or delete it
// like any other file — and if they delete it, openProgramDoc's link 404s and
// they can unlink and start again.

import { ensureToken, reconsent } from './gmail'

const STORAGE_KEY = 'tracker.programDocs.v1'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const API = 'https://www.googleapis.com/drive/v3/files'

export interface ProgramDoc {
  docId: string
  url: string
  title: string
  createdAt: string
}

export type ProgramDocMap = Record<string, ProgramDoc>

export function loadProgramDocs(): ProgramDocMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: ProgramDocMap = {}
    for (const [id, v] of Object.entries(parsed as Record<string, unknown>)) {
      const d = v as Partial<ProgramDoc>
      if (d && typeof d.docId === 'string' && typeof d.url === 'string') {
        out[id] = {
          docId: d.docId,
          url: d.url,
          title: typeof d.title === 'string' ? d.title : 'Notes',
          createdAt: typeof d.createdAt === 'string' ? d.createdAt : '',
        }
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveProgramDocs(map: ProgramDocMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* storage full or blocked — the in-memory map still works this session */
  }
}

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The starting page. Drive converts uploaded HTML into a real Google Doc, so
 * the note opens with the program's facts already in it and headings to write
 * under — no Docs API scope needed, and no blank page to stare at.
 */
function seedHtml(p: SeedProgram): string {
  const facts: [string, string | null | undefined][] = [
    ['Degree', p.degree_type],
    ['Location', [p.country, p.region].filter(Boolean).join(' · ')],
    ['Field', p.discipline],
    ['Deadline', p.deadline],
    ['Funding', p.funding],
    ['Program page', p.programUrl],
  ]
  const rows = facts
    .filter(([, v]) => v)
    .map(([k, v]) => `<p><b>${esc(k)}:</b> ${esc(String(v))}</p>`)
    .join('\n')
  return `<html><body>
<h1>${esc(p.university)} — ${esc(p.program_name)}</h1>
${rows}
<hr>
<h2>Why this program</h2><p></p>
<h2>People to contact</h2><p></p>
<h2>Questions to ask</h2><p></p>
<h2>Application notes</h2><p></p>
</body></html>`
}

export interface SeedProgram {
  id: string
  university: string
  program_name: string
  degree_type?: string
  country?: string
  region?: string
  discipline?: string
  deadline?: string | null
  funding?: string | null
  programUrl?: string | null
}

/** A file name that sorts together in Drive and says what it is at a glance. */
export function docTitle(p: SeedProgram): string {
  return `PhD notes — ${p.university} — ${p.program_name}`
}

async function createDoc(token: string, p: SeedProgram): Promise<ProgramDoc> {
  const boundary = 'tracker-doc-boundary-4f81c2'
  const metadata = {
    name: docTitle(p),
    mimeType: 'application/vnd.google-apps.document',
  }
  const body =
    `\r\n--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    'Content-Type: text/html; charset=UTF-8\r\n\r\n' +
    seedHtml(p) +
    `\r\n--${boundary}--`

  const res = await fetch(`${UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Drive create failed (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ''}`)
  }
  const data = await res.json()
  return {
    docId: data.id,
    url: data.webViewLink ?? `https://docs.google.com/document/d/${data.id}/edit`,
    title: metadata.name,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Create the Doc for a program.
 *
 * The first call after this feature ships will 403 on a token minted before
 * drive.file was in SCOPE — Google keeps handing back the old grant on a silent
 * refresh. So a 403/401 triggers one interactive re-consent and a single retry,
 * which is the difference between "works" and "permanently broken for every
 * existing user".
 */
export async function createProgramDoc(
  clientId: string,
  program: SeedProgram,
): Promise<ProgramDoc> {
  let token = await ensureToken(clientId)
  try {
    return await createDoc(token, program)
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    if (!/\(40[13]\)/.test(msg)) throw e
    token = await reconsent(clientId)
    return createDoc(token, program)
  }
}

/** True if the Doc still exists in the user's Drive (they may have deleted it). */
export async function docStillExists(clientId: string, docId: string): Promise<boolean> {
  try {
    const token = await ensureToken(clientId)
    const res = await fetch(`${API}/${docId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return false
    const data = await res.json()
    return !data.trashed
  } catch {
    return false
  }
}
