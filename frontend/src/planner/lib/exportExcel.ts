// Excel export of the application plan: one sheet, programs as summary rows,
// each program's saved faculty grouped underneath with Excel's own outline
// controls, collapsed by default.
//
// The workbook is built separately from the download so it can be exercised
// outside a browser. ExcelJS is imported on demand — it is a ~1 MB library
// that only the export button needs.

export interface ExportAdvisorRow {
  name: string
  /** contact status label, or '' */
  status: string
  /** short research keywords, or '' */
  research: string
  link: string
}

export interface ExportProgramRow {
  university: string
  program: string
  deadline: string
  funding: string
  /** e.g. "$49,000/yr (university minimum, 2026-27)" */
  stipend: string
  /** e.g. "$1,588/mo — 37% of stipend" */
  rent: string
  status: string
  notes: string
  link: string
  advisors: ExportAdvisorRow[]
}

export interface ExportMeta {
  cycle: string
  exportedAt: Date
}

type ExcelNS = typeof import('exceljs')

const HEADERS = ['University', 'Program / Advisor', 'Deadline', 'Funding', 'Stipend', 'Rent near campus', 'Status', 'Research / Notes', 'Link']
const WIDTHS = [30, 46, 20, 16, 30, 30, 22, 56, 46]
const LINK_COL = HEADERS.length

const LINK_FONT = { color: { argb: 'FF2563EB' }, underline: true, size: 11 }

async function loadExcelJS(): Promise<ExcelNS> {
  const mod = (await import('exceljs')) as unknown as ExcelNS & { default?: ExcelNS }
  return mod.default ?? mod
}

/**
 * ExcelJS computes a row's `collapsed` flag from its outline level, which puts
 * the flag on the hidden DETAIL rows. Excel wants it on the visible SUMMARY row
 * (the program), which is what draws the [+] button; so the flag is set per row
 * by hand.
 */
function setCollapsed(row: object, value: boolean): void {
  Object.defineProperty(row, 'collapsed', { value, configurable: true, writable: true })
}

export async function buildWorkbook(rows: ExportProgramRow[], meta: ExportMeta) {
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PhD Program Tracker'
  wb.created = meta.exportedAt
  wb.modified = meta.exportedAt

  const ws = wb.addWorksheet('Programs', {
    // summaryBelow=false: the program row sits ABOVE its faculty group and
    // stays visible while the group is folded.
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
    const r = ws.addRow([p.university, p.program, p.deadline, p.funding, p.stipend, p.rent, p.status, p.notes, ''])
    r.font = { bold: true, size: 11 }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    r.alignment = { vertical: 'top', wrapText: true }
    linkCell(r.getCell(LINK_COL), p.link)
    r.getCell(LINK_COL).font = { ...LINK_FONT, bold: true }
    if (!p.link) r.getCell(LINK_COL).font = { bold: true, size: 11 }

    // No advisors → no group. An empty outline would draw a [+] over nothing.
    if (p.advisors.length === 0) {
      setCollapsed(r, false)
      continue
    }
    setCollapsed(r, true)
    for (const a of p.advisors) {
      const ar = ws.addRow(['', a.name, '', '', '', '', a.status, a.research, ''])
      ar.outlineLevel = 1
      ar.hidden = true
      setCollapsed(ar, false)
      ar.font = { size: 11 }
      ar.alignment = { vertical: 'top', wrapText: true }
      ar.getCell(2).alignment = { indent: 2, vertical: 'top' }
      linkCell(ar.getCell(LINK_COL), a.link)
    }
  }

  return wb
}

export function excelFilename(exportedAt: Date): string {
  return `phd-plan-programs-${exportedAt.toISOString().slice(0, 10)}.xlsx`
}

/** Build the workbook and hand it to the browser as a download. */
export async function exportPlannerExcel(rows: ExportProgramRow[], meta: ExportMeta): Promise<void> {
  const wb = await buildWorkbook(rows, meta)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = excelFilename(meta.exportedAt)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
