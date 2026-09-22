// Excel export of the master's plan: one flat sheet, one row per programme, in
// the order the plan table shows them. Unlike the PhD export there is nothing
// to group underneath a row (no advisors), so the sheet gets an autofilter
// instead of an outline.
//
// ExcelJS is imported on demand — only this button needs its ~1 MB.

export interface MastersExportRow {
  university: string
  program: string
  country: string
  deadline: string
  tuition: string
  scholarship: string
  english: string
  interest: string
  status: string
  checklist: string
  notes: string
  link: string
}

type ExcelNS = typeof import('exceljs')

const COLUMNS: { header: string; key: keyof MastersExportRow; width: number }[] = [
  { header: 'University', key: 'university', width: 28 },
  { header: 'Programme', key: 'program', width: 40 },
  { header: 'Country', key: 'country', width: 14 },
  { header: 'Deadline', key: 'deadline', width: 30 },
  { header: 'Tuition (international)', key: 'tuition', width: 28 },
  { header: 'Scholarship', key: 'scholarship', width: 28 },
  { header: 'English', key: 'english', width: 26 },
  { header: 'Interest', key: 'interest', width: 14 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Checklist', key: 'checklist', width: 40 },
  { header: 'Notes', key: 'notes', width: 48 },
  { header: 'Link', key: 'link', width: 44 },
]

async function loadExcelJS(): Promise<ExcelNS> {
  const mod = (await import('exceljs')) as unknown as ExcelNS & { default?: ExcelNS }
  return mod.default ?? mod
}

export async function buildMastersWorkbook(rows: MastersExportRow[], exportedAt: Date) {
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PhD Program Tracker'
  wb.created = exportedAt
  wb.modified = exportedAt

  const ws = wb.addWorksheet("Master's plan", { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }))

  const head = ws.getRow(1)
  head.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  head.alignment = { vertical: 'middle' }
  head.height = 20

  for (const r of rows) {
    const row = ws.addRow(COLUMNS.map((c) => (c.key === 'link' ? '' : r[c.key])))
    row.alignment = { vertical: 'top', wrapText: true }
    row.font = { size: 11 }
    row.getCell(1).font = { bold: true, size: 11 }
    if (r.link) {
      const cell = row.getCell(COLUMNS.length)
      cell.value = { text: r.link, hyperlink: r.link }
      cell.font = { color: { argb: 'FF2563EB' }, underline: true, size: 11 }
    }
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } }
  return wb
}

export function mastersFilename(exportedAt: Date): string {
  return `masters-plan-${exportedAt.toISOString().slice(0, 10)}.xlsx`
}

export async function exportMastersExcel(rows: MastersExportRow[], exportedAt = new Date()): Promise<void> {
  const wb = await buildMastersWorkbook(rows, exportedAt)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = mastersFilename(exportedAt)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
