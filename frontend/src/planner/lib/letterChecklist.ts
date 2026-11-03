// The recommendation-letter checklist: an Excel file to send to the people
// writing letters, listing each program with its deadline and a box to tick
// once the letter for it is in.
//
// The boxes are Excel's own in-cell checkboxes (Insert → Checkbox): a TRUE /
// FALSE cell drawn as a box that toggles on click, in Excel for Microsoft 365
// on Windows, Mac and the web. Older Excel shows the same cell as the word
// TRUE or FALSE, which still works as a checklist. ExcelJS cannot write the
// checkbox format, so the workbook is built with ExcelJS and the format is
// added to the saved file afterwards (addCellCheckboxes).
//
// Self-contained on purpose — it imports nothing from the app at runtime — so
// it can be run and checked in Node as well as the browser.

export interface LetterRow {
  university: string
  program: string
  /** YYYY-MM-DD, when the deadline is a date */
  deadlineIso: string | null
  /** what to show when there is no date: "Rolling", "Paused", "To be confirmed" */
  deadlineNote: string
}

export interface LetterMeta {
  cycle: string
  preparedAt: Date
}

type ExcelNS = typeof import('exceljs')

async function loadExcelJS(): Promise<ExcelNS> {
  const mod = (await import('exceljs')) as unknown as ExcelNS & { default?: ExcelNS }
  return mod.default ?? mod
}

/** Dated deadlines first, soonest at the top; then the rest by university. */
export function sortLetterRows(rows: LetterRow[]): LetterRow[] {
  return [...rows].sort((a, b) => {
    if (a.deadlineIso && b.deadlineIso) {
      return a.deadlineIso.localeCompare(b.deadlineIso) || a.university.localeCompare(b.university)
    }
    if (a.deadlineIso) return -1
    if (b.deadlineIso) return 1
    return a.university.localeCompare(b.university)
  })
}

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Layout. The table header sits on HEADER_ROW; programs follow it. */
const HEADER_ROW = 5
const FIRST = HEADER_ROW + 1
/** The column holding the boxes, and its first cell — used to find its style. */
const BOX_COL = 'E'
const PROBE_CELL = `${BOX_COL}${FIRST}`

/** Named on every font: without one, Excel picks the system's default UI font,
 *  which on a Chinese-locale Windows is a CJK monospace face. */
const FONT = 'Calibri'
const font = (f: Partial<import('exceljs').Font>): Partial<import('exceljs').Font> => ({ name: FONT, ...f })

/** Column widths, in characters; B and C wrap within these. */
const UNI_WIDTH = 38
const PROGRAM_WIDTH = 52

/**
 * Rows are given a height rather than left to autofit: Excel autofits wrapped
 * text only when a cell is edited, so a long program name would otherwise sit
 * clipped behind its row until someone touched it.
 */
function rowHeight(university: string, program: string): number {
  const lines = (text: string, width: number) => Math.max(1, Math.ceil(text.length / (width * 0.9)))
  return Math.max(22, 15 * Math.max(lines(university, UNI_WIDTH), lines(program, PROGRAM_WIDTH)) + 7)
}

const SLATE_900 = 'FF0F172A'
const SLATE_500 = 'FF64748B'
const LINE = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }
const BOXED = { top: LINE, left: LINE, bottom: LINE, right: LINE }

/** The workbook as .xlsx bytes, checkboxes included. */
export async function buildLetterChecklist(input: LetterRow[], meta: LetterMeta): Promise<ArrayBuffer> {
  if (input.length === 0) throw new Error('No programs to list')
  const rows = sortLetterRows(input)
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PhD Program Tracker'
  wb.created = meta.preparedAt
  wb.modified = meta.preparedAt

  const last = FIRST + rows.length - 1
  const ws = wb.addWorksheet('Letters', {
    views: [{ state: 'frozen', ySplit: HEADER_ROW, showGridLines: false }],
    pageSetup: {
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${HEADER_ROW}:${HEADER_ROW}`,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  })
  ws.columns = [
    { key: 'n', width: 5 },
    { key: 'university', width: UNI_WIDTH },
    { key: 'program', width: PROGRAM_WIDTH },
    { key: 'deadline', width: 15 },
    { key: 'box', width: 18 },
  ]

  ws.mergeCells('A1:E1')
  ws.getCell('A1').value = 'Recommendation letter checklist'
  ws.getCell('A1').font = font({ bold: true, size: 16, color: { argb: SLATE_900 } })
  ws.getRow(1).height = 26

  ws.mergeCells('A2:E2')
  ws.getCell('A2').value =
    `${meta.cycle} applications · ${rows.length} program${rows.length === 1 ? '' : 's'}, ` +
    `by deadline · list prepared ${localIso(meta.preparedAt)}`
  ws.getCell('A2').font = font({ size: 10.5, color: { argb: SLATE_500 } })

  ws.mergeCells('A3:E3')
  ws.getCell('A3').value = 'Please tick the box next to each program once your letter for it has been submitted. Thank you!'
  ws.getCell('A3').font = font({ size: 11, color: { argb: SLATE_900 } })
  ws.getCell('A3').alignment = { wrapText: true, vertical: 'middle' }
  ws.getRow(3).height = 20

  // How many are in, counted from the boxes themselves.
  ws.getCell('D4').value = 'Submitted'
  ws.getCell('D4').font = font({ bold: true, size: 11, color: { argb: SLATE_500 } })
  ws.getCell('D4').alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getCell('E4').value = {
    formula: `COUNTIF(${BOX_COL}${FIRST}:${BOX_COL}${last},TRUE)&" of ${rows.length}"`,
    result: `0 of ${rows.length}`,
  }
  ws.getCell('E4').font = font({ bold: true, size: 11, color: { argb: SLATE_900 } })
  ws.getCell('E4').alignment = { horizontal: 'center', vertical: 'middle' }

  const head = ws.getRow(HEADER_ROW)
  head.values = ['#', 'University', 'Program', 'Deadline', 'Letter submitted']
  head.height = 20
  head.eachCell((c, col) => {
    c.font = font({ bold: true, size: 11, color: { argb: 'FFFFFFFF' } })
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    c.alignment = { vertical: 'middle', horizontal: col === 1 || col >= 4 ? 'center' : 'left' }
    c.border = BOXED
  })

  rows.forEach((r, i) => {
    const row = ws.getRow(FIRST + i)
    const n = row.getCell(1)
    n.value = i + 1
    n.font = font({ size: 10, color: { argb: SLATE_500 } })
    n.alignment = { horizontal: 'right', vertical: 'middle' }

    row.getCell(2).value = r.university
    row.getCell(2).font = font({ bold: true, size: 11 })
    row.getCell(3).value = r.program
    row.getCell(3).font = font({ size: 11 })
    for (const c of [2, 3]) row.getCell(c).alignment = { vertical: 'middle', wrapText: true }

    const d = row.getCell(4)
    if (r.deadlineIso) {
      const [y, m, day] = r.deadlineIso.split('-').map(Number)
      // A real date, so the sheet can sort on it and the overdue rule can compare it.
      d.value = new Date(Date.UTC(y, m - 1, day))
      d.numFmt = 'yyyy-mm-dd'
      d.font = font({ size: 11 })
    } else {
      d.value = r.deadlineNote
      d.font = font({ italic: true, size: 10.5, color: { argb: 'FFB45309' } })
    }
    d.alignment = { horizontal: 'center', vertical: 'middle' }

    // The box. Size 14 makes it easy to hit, and keeps this cell's style unique
    // in the file, which is how addCellCheckboxes finds it.
    const box = row.getCell(5)
    box.value = false
    box.font = font({ size: 14 })
    box.alignment = { horizontal: 'center', vertical: 'middle' }

    for (let c = 1; c <= 5; c++) row.getCell(c).border = BOXED
    row.height = rowHeight(r.university, r.program)
  })

  const rowsRef = `A${FIRST}:E${last}`
  const r1 = `$${BOX_COL}${FIRST}`
  const dl = `$D${FIRST}`
  ws.addConditionalFormatting({
    ref: rowsRef,
    rules: [
      {
        // Ticked: the whole row turns green.
        type: 'expression',
        priority: 1,
        formulae: [`${r1}=TRUE`],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFDCFCE7' } },
          font: { color: { argb: 'FF166534' } },
        },
      },
      {
        // Not ticked and the deadline has passed.
        type: 'expression',
        priority: 2,
        formulae: [`AND(${r1}<>TRUE,ISNUMBER(${dl}),${dl}<TODAY())`],
        style: {
          fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFE4E6' } },
          font: { color: { argb: 'FF9F1239' } },
        },
      },
      {
        // Not ticked and due within a week.
        type: 'expression',
        priority: 3,
        formulae: [`AND(${r1}<>TRUE,ISNUMBER(${dl}),${dl}>=TODAY(),${dl}-TODAY()<=7)`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFEF3C7' } } },
      },
    ],
  })

  ws.getCell(`A${last + 2}`).value =
    'Green: submitted · amber: due within 7 days · red: deadline passed, not yet ticked.'
  ws.getCell(`A${last + 2}`).font = font({ size: 9.5, italic: true, color: { argb: SLATE_500 } })

  const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer
  return addCellCheckboxes(bytes, 'xl/worksheets/sheet1.xml', PROBE_CELL)
}

// ---- Excel in-cell checkboxes ----
//
// What Excel itself writes for Insert → Checkbox (and XlsxWriter's
// insert_checkbox reproduces): the cell holds a boolean, and its cell format
// carries an extension pointing into a "feature property bag" part that says
// "draw this as a checkbox".

const FPB_PATH = 'xl/featurePropertyBag/featurePropertyBag.xml'
const FPB_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<FeaturePropertyBags xmlns="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag">' +
  '<bag type="Checkbox"/>' +
  '<bag type="XFControls"><bagId k="CellControl">0</bagId></bag>' +
  '<bag type="XFComplement"><bagId k="XFControls">1</bagId></bag>' +
  '<bag type="XFComplements" extRef="XFComplementsMapperExtRef"><a k="MappedFeaturePropertyBags"><bagId>2</bagId></a></bag>' +
  '</FeaturePropertyBags>'
const FPB_CONTENT_TYPE = 'application/vnd.ms-excel.featurepropertybag+xml'
const FPB_REL_TYPE = 'http://schemas.microsoft.com/office/2022/11/relationships/FeaturePropertyBag'
const XF_CHECKBOX_EXT =
  '<extLst><ext uri="{C7286773-470A-42A8-94C5-96B5CB345126}" ' +
  'xmlns:xfpb="http://schemas.microsoft.com/office/spreadsheetml/2022/featurepropertybag">' +
  '<xfpb:xfComplement i="0"/></ext></extLst>'

/**
 * Turn every cell that shares `probeCell`'s style into a checkbox.
 *
 * Refuses (throws) rather than guess if that style is also used by a cell that
 * is not a TRUE/FALSE value — a checkbox drawn over a date would be worse than
 * no checkbox.
 */
export async function addCellCheckboxes(bytes: ArrayBuffer, sheetPath: string, probeCell: string): Promise<ArrayBuffer> {
  const JSZip = ((await import('jszip')) as unknown as { default: typeof import('jszip') }).default
  const zip = await JSZip.loadAsync(bytes)
  const read = async (path: string) => {
    const f = zip.file(path)
    if (!f) throw new Error(`Checklist workbook is missing ${path}`)
    return f.async('string')
  }

  const sheet = await read(sheetPath)
  const probe = sheet.match(new RegExp(`<c r="${probeCell}"[^>]*?\\ss="(\\d+)"`))
  if (!probe) throw new Error(`Could not find the checkbox cell ${probeCell}`)
  const xfIndex = Number(probe[1])
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)>/g)) {
    const attrs = m[2]
    if (new RegExp(`\\ss="${xfIndex}"`).test(attrs) && !/\st="b"/.test(attrs)) {
      throw new Error(`Cell ${m[1]} shares the checkbox style but is not TRUE/FALSE`)
    }
  }

  const styles = await read('xl/styles.xml')
  const block = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)
  if (!block) throw new Error('Checklist workbook has no cell formats')
  let seen = -1
  const inner = block[1].replace(/<xf\b[^>]*?\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g, (xf) => {
    seen++
    if (seen !== xfIndex) return xf
    return xf.endsWith('/>') ? `${xf.slice(0, -2)}>${XF_CHECKBOX_EXT}</xf>` : xf.replace(/<\/xf>$/, `${XF_CHECKBOX_EXT}</xf>`)
  })
  if (seen < xfIndex) throw new Error('Checkbox cell format not found')
  zip.file('xl/styles.xml', styles.replace(block[1], () => inner))

  zip.file(FPB_PATH, FPB_XML)

  const types = await read('[Content_Types].xml')
  if (!types.includes(FPB_CONTENT_TYPE)) {
    zip.file(
      '[Content_Types].xml',
      types.replace('</Types>', () => `<Override PartName="/${FPB_PATH}" ContentType="${FPB_CONTENT_TYPE}"/></Types>`),
    )
  }

  const relsPath = 'xl/_rels/workbook.xml.rels'
  const rels = await read(relsPath)
  if (!rels.includes(FPB_REL_TYPE)) {
    zip.file(
      relsPath,
      rels.replace(
        '</Relationships>',
        () => `<Relationship Id="rIdFeaturePropertyBag1" Type="${FPB_REL_TYPE}" Target="featurePropertyBag/featurePropertyBag.xml"/></Relationships>`,
      ),
    )
  }

  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

export function checklistFilename(meta: LetterMeta): string {
  const cycle = meta.cycle.trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '') || 'plan'
  return `recommendation-letters-${cycle}-${localIso(meta.preparedAt)}.xlsx`
}

/** Build the checklist and hand it to the browser as a download. */
export async function downloadLetterChecklist(rows: LetterRow[], meta: LetterMeta): Promise<void> {
  const bytes = await buildLetterChecklist(rows, meta)
  const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = checklistFilename(meta)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
