// The application plan as a workbook: one sheet, programs as summary rows,
// each program's saved faculty grouped underneath with the spreadsheet's own
// outline controls.
//
// The groups are written OPEN. Google Sheets only lets someone with edit
// access fold or unfold a group, so a Sheet written with its groups folded
// hides the faculty from everyone it is shared with view-only — they have no
// way to open them. Open, everyone can read the rows, and an editor can still
// fold a group for themselves.
//
// It is what the live Google Sheet is made from (googleSheet.ts uploads it and
// Drive converts it), and is kept free of browser APIs so it can be exercised
// outside one. ExcelJS is imported on demand — it is a ~1 MB library that only
// the Sheet sync and the letter checklist need.

export interface ExportAdvisorRow {
  name: string
  /** e.g. "🟢 Actively Recruiting" — "⚪ Unknown" when nothing is known */
  recruiting: string
  /** contact status label, or '' */
  status: string
  /** short research keywords, or '' */
  research: string
  link: string
}

export interface ExportProgramRow {
  /** the user's own grouping, or '' */
  category: string
  university: string
  program: string
  /** its advisors' recruiting statuses counted up, e.g. "🟢 1 · ⚪ 3"; '' with no advisors */
  recruiting: string
  deadline: string
  funding: string
  /** e.g. "$49,000/yr (university minimum, 2026-27)" */
  stipend: string
  /** e.g. "$1,588/mo — 37% of stipend" */
  rent: string
  status: string
  /** "Lee: Letter received; Smith: Invitation sent", or '' */
  letters: string
  notes: string
  link: string
  advisors: ExportAdvisorRow[]
}

export interface ExportMeta {
  cycle: string
  exportedAt: Date
}

export type ExcelNS = typeof import('exceljs')

/**
 * Bump when the workbook changes in a way the rows don't show — folding,
 * widths, styling. A live Sheet is rewritten only when what it was given
 * changes (sheetMirror compares a hash of it), so a layout-only change would
 * otherwise wait for the next edit to the plan before reaching a Sheet that
 * already exists. googleSheet.ts hands this over along with the rows.
 */
export const WORKBOOK_LAYOUT = 2

const HEADERS = ['Category', 'University', 'Program / Advisor', 'Advisor recruiting', 'Deadline', 'Funding', 'Stipend', 'Rent near campus', 'Status', 'Letters', 'Research / Notes', 'Link']
const WIDTHS = [20, 30, 46, 24, 20, 16, 30, 30, 22, 40, 56, 46]
const LINK_COL = HEADERS.length

const LINK_FONT = { color: { argb: 'FF2563EB' }, underline: true, size: 11 }

export async function loadExcelJS(): Promise<ExcelNS> {
  const mod = (await import('exceljs')) as unknown as ExcelNS & { default?: ExcelNS }
  return mod.default ?? mod
}

/**
 * ExcelJS computes a row's `collapsed` flag from its outline level, so every
 * row inside a group would be written as collapsed. Nothing here is: the
 * groups are open (see the top of the file), so the flag is cleared by hand.
 */
function notCollapsed(row: object): void {
  Object.defineProperty(row, 'collapsed', { value: false, configurable: true, writable: true })
}

export async function buildWorkbook(rows: ExportProgramRow[], meta: ExportMeta) {
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PhD Program Tracker'
  wb.created = meta.exportedAt
  wb.modified = meta.exportedAt

  const ws = wb.addWorksheet('Programs', {
    // summaryBelow=false: the program row sits ABOVE its faculty group and
    // stays visible when an editor folds the group.
    properties: { outlineLevelRow: 1, outlineProperties: { summaryBelow: false, summaryRight: false } },
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  ws.columns = HEADERS.map((header, i) => ({ header, key: `c${i}`, width: WIDTHS[i] }))

  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  head.alignment = { vertical: 'middle' }
  head.height = 20

  const linkCell = (cell: import('exceljs').Cell, url: string) => {
    if (!url) return
    cell.value = { text: url, hyperlink: url }
    cell.font = LINK_FONT
  }

  for (const p of rows) {
    const r = ws.addRow([p.category, p.university, p.program, p.recruiting, p.deadline, p.funding, p.stipend, p.rent, p.status, p.letters, p.notes, ''])
    r.font = { bold: true, size: 11 }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    r.alignment = { vertical: 'top', wrapText: true }
    linkCell(r.getCell(LINK_COL), p.link)
    r.getCell(LINK_COL).font = { ...LINK_FONT, bold: true }
    if (!p.link) r.getCell(LINK_COL).font = { bold: true, size: 11 }

    notCollapsed(r)

    // The advisors form a group under their program, left open. A program
    // with no advisors gets no group, so nothing draws a [−] over nothing.
    for (const a of p.advisors) {
      const ar = ws.addRow(['', '', a.name, a.recruiting, '', '', '', '', a.status, '', a.research, ''])
      ar.outlineLevel = 1
      notCollapsed(ar)
      ar.font = { size: 11 }
      ar.alignment = { vertical: 'top', wrapText: true }
      ar.getCell(3).alignment = { indent: 2, vertical: 'top' }
      linkCell(ar.getCell(LINK_COL), a.link)
    }
  }

  return wb
}

/** The workbook as .xlsx bytes. */
export async function workbookBytes(rows: ExportProgramRow[], meta: ExportMeta): Promise<ArrayBuffer> {
  const wb = await buildWorkbook(rows, meta)
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
