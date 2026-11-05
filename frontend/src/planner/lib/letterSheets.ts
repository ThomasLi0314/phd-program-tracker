// Each letter writer's checklist as a live Google Sheet: their programs and
// deadlines, kept up to date as the plan changes, with a box per program for
// them to tick once their letter is in.
//
// Unlike the plan's Sheet this one is two-way, because the point of it is that
// the writer ticks boxes in it. Every rewrite replaces the Sheet's contents, so
// before writing, the Sheet is read back (as CSV — Drive API only) and any box
// ticked there since the last write is kept, and marks that letter "Letter
// received" in the plan. A tick the plan itself wrote last time is not news,
// so un-marking a letter in the plan still clears its box.
//
// Google converts the uploaded workbook's TRUE/FALSE column into plain values;
// clickable checkboxes need one Sheets API call after each write. That API has
// to be turned on in the user's Google Cloud project — when it isn't, the
// column stays TRUE/FALSE (which still works) and the UI says how to turn it on.

import { useEffect, useRef } from 'react'
import type { Program } from '../../types'
import type { PlannerState, Recommender } from '../types'
import type { PlannerApi } from './usePlanner'
import { programIdentity, resolveProgram } from './referenceBridge'
import { resolveDeadline } from './deadlines'
import { programLabel } from './exportRows'
import { isLetterIn, lettersOf } from './letters'
import { buildLetterChecklist, CHECKLIST_LAYOUT, type LetterRow } from './letterChecklist'
import {
  exportCsv,
  failure,
  flushOnHide,
  parseLink,
  readJson,
  SheetMirror,
  withToken,
  writeJson,
  type SheetLink,
} from './sheetMirror'

/** writer id → their Sheet. Backed up (lib/backup) like the plan Sheet's link. */
export const LETTER_SHEETS_KEY = 'planner.letterSheets.v1'
const PUSHED_PREFIX = 'planner.letterSheets.pushed.v1:'
/** The boxes this browser last wrote as ticked, per writer — to tell their ticks from ours. */
const WRITTEN_PREFIX = 'planner.letterSheets.ticks.v1:'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

/** A writer's checklist rows: every program listing them, minus any they declined. */
export function writerChecklistRows(rec: Recommender, state: PlannerState, byId: Map<string, Program>): LetterRow[] {
  return state.programs.flatMap((p) => {
    const letter = lettersOf(p).find((l) => l.recommenderId === rec.id)
    if (!letter || letter.status === 'declined') return []
    const live = resolveProgram(p, byId)
    const id = programIdentity(p, live)
    const d = resolveDeadline(p.admissions.deadline, live?.requirements.deadline)
    return [
      {
        university: id.university,
        program: programLabel(id.programName, id.degree),
        deadlineIso: d.kind === 'dated' ? d.iso : null,
        deadlineNote: d.kind === 'rolling' ? 'Rolling' : d.kind === 'paused' ? 'Paused' : 'To be confirmed',
        submitted: isLetterIn(letter.status),
        ref: p.id,
      },
    ]
  })
}

// ---- links ----

function loadLinks(): Record<string, Partial<SheetLink>> {
  const all = readJson<Record<string, Partial<SheetLink>>>(LETTER_SHEETS_KEY)
  return all && typeof all === 'object' && !Array.isArray(all) ? all : {}
}

function saveLink(recId: string, link: SheetLink | null): void {
  const all = loadLinks()
  if (link) all[recId] = link
  else delete all[recId]
  writeJson(LETTER_SHEETS_KEY, Object.keys(all).length ? all : null)
}

// ---- reading ticks back ----

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const TICKED = new Set(['TRUE', 'YES', 'Y', 'X', '✓', '✔', '☑', '1', 'DONE', 'SUBMITTED'])

/** The program ids whose box is ticked in an exported checklist. */
export function tickedRefs(csv: string): Set<string> {
  const rows = parseCsv(csv)
  const out = new Set<string>()
  const h = rows.findIndex((r) => r.includes(CHECKLIST_LAYOUT.headers.box) && r.includes(CHECKLIST_LAYOUT.headers.ref))
  if (h < 0) return out
  const boxCol = rows[h].indexOf(CHECKLIST_LAYOUT.headers.box)
  const refCol = rows[h].indexOf(CHECKLIST_LAYOUT.headers.ref)
  for (const r of rows.slice(h + 1)) {
    const ref = r[refCol]?.trim()
    if (ref && TICKED.has((r[boxCol] ?? '').trim().toUpperCase())) out.add(ref)
  }
  return out
}

const written = (recId: string) => new Set(readJson<string[]>(WRITTEN_PREFIX + recId) ?? [])

/** Called with the programs a writer ticked in their Sheet; PlannerApp marks those letters received. */
let onTicked: ((recId: string, programIds: string[]) => void) | null = null

/** Ticks in the Sheet that this browser didn't write: the writer's own. */
async function readTheirTicks(token: string, recId: string, fileId: string): Promise<Set<string>> {
  const mine = written(recId)
  const theirs = new Set([...tickedRefs(await exportCsv(token, fileId))].filter((r) => !mine.has(r)))
  if (theirs.size) onTicked?.(recId, [...theirs])
  return theirs
}

// ---- checkboxes ----

const SHEETS_API_HELP =
  'To show clickable checkboxes in Google Sheets, turn on the Google Sheets API for your Google Cloud project ' +
  '(the one holding your OAuth client: APIs & Services → Library → Google Sheets API → Enable), then click Sync now. ' +
  'Until then the column reads TRUE/FALSE, and typing TRUE works as a tick.'

/** Turn the TRUE/FALSE column into checkboxes. Returns a notice for the UI, or null. */
async function applyCheckboxes(token: string, fileId: string, count: number): Promise<string | null> {
  if (count === 0) return null
  try {
    const auth = { Authorization: `Bearer ${token}` }
    const meta = await fetch(`${SHEETS_API}/${encodeURIComponent(fileId)}?fields=sheets.properties(sheetId,index)`, {
      headers: auth,
    })
    if (!meta.ok) throw await failure(meta, 'Reading the Sheet layout')
    const data = await meta.json()
    const sheets: { properties?: { sheetId?: number; index?: number } }[] = data.sheets ?? []
    const sheetId = (sheets.find((s) => s.properties?.index === 0) ?? sheets[0])?.properties?.sheetId ?? 0
    const res = await fetch(`${SHEETS_API}/${encodeURIComponent(fileId)}:batchUpdate`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [
          {
            setDataValidation: {
              range: {
                sheetId,
                startRowIndex: CHECKLIST_LAYOUT.headerRow,
                endRowIndex: CHECKLIST_LAYOUT.headerRow + count,
                startColumnIndex: CHECKLIST_LAYOUT.boxColumn,
                endColumnIndex: CHECKLIST_LAYOUT.boxColumn + 1,
              },
              rule: { condition: { type: 'BOOLEAN' }, strict: true },
            },
          },
        ],
      }),
    })
    if (!res.ok) throw await failure(res, 'Adding checkboxes')
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/has not been used|is disabled|SERVICE_DISABLED|not been enabled|API.*disabled/i.test(msg)) return SHEETS_API_HELP
    return `Couldn’t turn the column into checkboxes (${msg}). It still works: TRUE means submitted.`
  }
}

// ---- one mirror per writer ----

interface WriterSnapshot {
  name: string
  cycle: string
  rows: LetterRow[]
}

const mirrors = new Map<string, SheetMirror<WriterSnapshot, Set<string>>>()

export function letterSheetFor(recId: string): SheetMirror<WriterSnapshot, Set<string>> {
  const existing = mirrors.get(recId)
  if (existing) return existing
  /** The boxes the workbook being written has ticked; committed once the write lands. */
  let pendingTicks: string[] = []
  const mirror = new SheetMirror<WriterSnapshot, Set<string>>({
    loadLink: () => parseLink(loadLinks()[recId], 'Recommendation letters'),
    saveLink: (l) => saveLink(recId, l),
    pushedKey: PUSHED_PREFIX + recId,
    title: (s) => `Recommendation letters — ${s.name.trim() || 'letter writer'} — ${s.cycle}`,
    pull: (token, fileId) => readTheirTicks(token, recId, fileId),
    build: (s, theirs) => {
      const rows = s.rows.map((r) => (r.ref && theirs?.has(r.ref) ? { ...r, submitted: true } : r))
      pendingTicks = rows.filter((r) => r.submitted && r.ref).map((r) => r.ref!)
      return buildLetterChecklist(
        rows,
        { cycle: s.cycle, preparedAt: new Date(), recommender: s.name.trim() || undefined, live: true },
        { excelCheckboxes: false },
      )
    },
    afterWrite: (token, fileId, s) => {
      writeJson(WRITTEN_PREFIX + recId, pendingTicks)
      return applyCheckboxes(token, fileId, s.rows.length)
    },
    onUnlink: () => writeJson(WRITTEN_PREFIX + recId, null),
  })
  flushOnHide(() => mirror.flush())
  mirrors.set(recId, mirror)
  return mirror
}

/**
 * Look for new ticks in every writer's Sheet. Runs when the planner opens and
 * whenever the tab regains focus, at most once a minute; quiet on failure — a
 * lapsed sign-in or a deleted Sheet shows up on the next write instead.
 */
let lastPoll = 0
async function pollTicks(recIds: string[]): Promise<void> {
  if (Date.now() - lastPoll < 60_000) return
  lastPoll = Date.now()
  const links = loadLinks()
  for (const recId of recIds) {
    const link = parseLink(links[recId], '')
    if (!link) continue
    try {
      await withToken(false, (t) => readTheirTicks(t, recId, link.fileId))
    } catch {
      /* see above */
    }
  }
}

/**
 * Keep every writer's Sheet in step with the plan, and bring their ticks back
 * into it. Mounted once, in PlannerApp; `ready` waits for the database so the
 * Sheets aren't written with half-resolved deadlines.
 */
export function useLetterSheetSync(state: PlannerState | null, byId: Map<string, Program>, ready: boolean, planner: PlannerApi): void {
  const latest = useRef(state)
  latest.current = state

  const setStatus = planner.setLetterStatus
  useEffect(() => {
    onTicked = (recId, programIds) => {
      const s = latest.current
      if (!s) return
      for (const pid of programIds) {
        const program = s.programs.find((p) => p.id === pid)
        const letter = program ? lettersOf(program).find((l) => l.recommenderId === recId) : undefined
        if (letter && !isLetterIn(letter.status)) setStatus(pid, recId, 'received')
      }
    }
    return () => {
      onTicked = null
    }
  }, [setStatus])

  useEffect(() => {
    if (!state || !ready) return
    for (const rec of state.recommenders) {
      letterSheetFor(rec.id).offer({
        name: rec.name,
        cycle: state.settings.cycle,
        rows: writerChecklistRows(rec, state, byId),
      })
    }
  }, [state, byId, ready])

  const ids = state?.recommenders.map((r) => r.id).join(',') ?? ''
  useEffect(() => {
    if (!ready || !ids) return
    const list = ids.split(',')
    void pollTicks(list)
    const onFocus = () => void pollTicks(list)
    window.addEventListener('focus', onFocus)
    // Another tab made or dropped a writer's Sheet: follow it.
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === LETTER_SHEETS_KEY) for (const id of list) letterSheetFor(id).reloadLink()
    }
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [ids, ready])
}
