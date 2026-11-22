// The recommendation-letter checklist: an Excel file to send to the people
// writing letters, listing each program with its deadline and a box to tick
// once the letter for it is in.
//
// Some programs want letters on a day of their own — a week's grace after the
// application deadline, or a date before it. When any program on the list has
// such a rule, the sheet gains a "Letter due" column beside the application
// deadline, and the colours follow that date where there is one. A list with
// no such rule looks exactly as it did before the column existed.
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
  /** YYYY-MM-DD, when the program gives letters a date of their own */
  letterDueIso?: string | null
  /** the program's rule for letters when it gives no date: "Up to 2 weeks after the deadline" */
  letterDueNote?: string
  /** start with the box ticked — the letter is already in */
  submitted?: boolean
  /**
   * A stable id for the row (the plan's program id), written to a hidden
   * column so a live Google copy can tell which program a tick belongs to.
   */
  ref?: string
}

export interface LetterMeta {
  cycle: string
  preparedAt: Date
  /** the writer this copy is for; omitted for a list that covers everyone */
  recommender?: string
  /** a Google Sheet that keeps itself up to date, rather than a one-off file */
  live?: boolean
}

/** Where things are, for code that reads or decorates the sheet afterwards. */
export const CHECKLIST_LAYOUT = {
  /** 1-based row of the table header; programs start on the row below */
  headerRow: 5,
  headers: { box: 'Letter submitted', ref: 'ref' },
} as const

/** Does any program say when its letters are due? Only then is there a column for it. */
const hasLetterDue = (rows: LetterRow[]) => rows.some((r) => r.letterDueIso || r.letterDueNote)

/** 0-based column of the boxes — one further right when "Letter due" sits before it. */
export function boxColumnOf(rows: LetterRow[]): number {
  return hasLetterDue(rows) ? 5 : 4
}

/** The day to have a letter in by: its own date where the program gives one. */
const dueIso = (r: LetterRow) => r.letterDueIso || r.deadlineIso

type ExcelNS = typeof import('exceljs')

async function loadExcelJS(): Promise<ExcelNS> {
  const mod = (await import('exceljs')) as unknown as ExcelNS & { default?: ExcelNS }
  return mod.default ?? mod
}

/** Dated rows first, the letter due soonest at the top; then the rest by university. */
export function sortLetterRows(rows: LetterRow[]): LetterRow[] {
  return [...rows].sort((a, b) => {
    const da = dueIso(a)
    const db = dueIso(b)
    if (da && db) return da.localeCompare(db) || a.university.localeCompare(b.university)
    if (da) return -1
    if (db) return 1
    return a.university.localeCompare(b.university)
  })
}

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Layout. The table header sits on HEADER_ROW; programs follow it. */
const HEADER_ROW = CHECKLIST_LAYOUT.headerRow
const FIRST = HEADER_ROW + 1
/** A 1-based column number as its letter. The sheet never gets past G. */
const colLetter = (n: number) => String.fromCharCode(64 + n)

/** Named on every font: without one, Excel picks the system's default UI font,
 *  which on a Chinese-locale Windows is a CJK monospace face. */
const FONT = 'Calibri'
const font = (f: Partial<import('exceljs').Font>): Partial<import('exceljs').Font> => ({ name: FONT, ...f })

/** Column widths, in characters; university, program and "Letter due" wrap within these. */
const UNI_WIDTH = 38
const PROGRAM_WIDTH = 52
const DUE_WIDTH = 24

const wrappedLines = (text: string, width: number) => Math.max(1, Math.ceil(text.length / (width * 0.9)))

/**
 * Rows are given a height rather than left to autofit: Excel autofits wrapped
 * text only when a cell is edited, so a long program name would otherwise sit
 * clipped behind its row until someone touched it.
 */
function rowHeight(r: LetterRow): number {
  const tallest = Math.max(
    wrappedLines(r.university, UNI_WIDTH),
    wrappedLines(r.program, PROGRAM_WIDTH),
    r.letterDueIso ? 1 : wrappedLines(r.letterDueNote ?? '', DUE_WIDTH),
  )
  return Math.max(22, 15 * tallest + 7)
}

const SLATE_900 = 'FF0F172A'
const SLATE_500 = 'FF64748B'
const LINE = { style: 'thin' as const, color: { argb: 'FFCBD5E1' } }
const BOXED = { top: LINE, left: LINE, bottom: LINE, right: LINE }

/**
 * The workbook as .xlsx bytes. `excelCheckboxes` adds Excel's in-cell
 * checkbox format; the Google copy leaves it out, since Google Sheets gets its
 * checkboxes another way (letterSheets.ts).
 */
export async function buildLetterChecklist(
  input: LetterRow[],
  meta: LetterMeta,
  { excelCheckboxes = true }: { excelCheckboxes?: boolean } = {},
): Promise<ArrayBuffer> {
  // A live Sheet exists before its writer has programs; a one-off file doesn't.
  if (input.length === 0 && !meta.live) throw new Error('No programs to list')
  const rows = sortLetterRows(input)
  const withRefs = rows.some((r) => r.ref)
  const withDue = hasLetterDue(rows)
  // 1-based columns. "Letter due" is there only when some program has one.
  const C = { deadline: 4, due: withDue ? 5 : 0, box: withDue ? 6 : 5, ref: withDue ? 7 : 6 }
  const BOX_COL = colLetter(C.box)
  const DEADLINE_WIDTH = withDue ? 21 : 15
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
    { key: 'deadline', width: DEADLINE_WIDTH },
    ...(withDue ? [{ key: 'due', width: DUE_WIDTH }] : []),
    { key: 'box', width: 18 },
    { key: 'ref', width: 16 },
  ]
  // Bookkeeping for the live copy, out of sight.
  ws.getColumn(C.ref).hidden = true

  ws.mergeCells(`A1:${BOX_COL}1`)
  ws.getCell('A1').value = meta.recommender
    ? `Recommendation letter checklist — ${meta.recommender}`
    : 'Recommendation letter checklist'
  ws.getCell('A1').font = font({ bold: true, size: 16, color: { argb: SLATE_900 } })
  ws.getRow(1).height = 26

  ws.mergeCells(`A2:${BOX_COL}2`)
  ws.getCell('A2').value =
    `${meta.cycle} applications · ${rows.length} program${rows.length === 1 ? '' : 's'}, ` +
    `by deadline · ${meta.live ? 'kept up to date' : 'list prepared'} ${localIso(meta.preparedAt)}`
  ws.getCell('A2').font = font({ size: 10.5, color: { argb: SLATE_500 } })

  ws.mergeCells(`A3:${BOX_COL}3`)
  const ask =
    (meta.live
      ? 'Please tick the box next to each program once your letter for it has been submitted — this list updates itself as programs are added or deadlines change. Thank you!'
      : 'Please tick the box next to each program once your letter for it has been submitted. Thank you!') +
    (withDue
      ? ' “Letter due” is filled in where a program has its own deadline for letters; for the others, go by the application deadline.'
      : '')
  ws.getCell('A3').value = ask
  ws.getCell('A3').font = font({ size: 11, color: { argb: SLATE_900 } })
  ws.getCell('A3').alignment = { wrapText: true, vertical: 'middle' }
  // Given a height for the same reason the rows are (see rowHeight).
  const across = 5 + UNI_WIDTH + PROGRAM_WIDTH + DEADLINE_WIDTH + (withDue ? DUE_WIDTH : 0) + 18
  ws.getRow(3).height = Math.max(20, 15 * wrappedLines(ask, across) + 2)

  // How many are in, counted from the boxes themselves.
  const countLabel = `${colLetter(C.box - 1)}4`
  const count = `${BOX_COL}4`
  ws.getCell(countLabel).value = 'Submitted'
  ws.getCell(countLabel).font = font({ bold: true, size: 11, color: { argb: SLATE_500 } })
  ws.getCell(countLabel).alignment = { horizontal: 'right', vertical: 'middle' }
  ws.getCell(count).value =
    rows.length > 0
      ? {
          formula: `COUNTIF(${BOX_COL}${FIRST}:${BOX_COL}${last},TRUE)&" of ${rows.length}"`,
          result: `${rows.filter((r) => r.submitted).length} of ${rows.length}`,
        }
      : '0 of 0'
  ws.getCell(count).font = font({ bold: true, size: 11, color: { argb: SLATE_900 } })
  ws.getCell(count).alignment = { horizontal: 'center', vertical: 'middle' }

  const head = ws.getRow(HEADER_ROW)
  head.values = [
    '#',
    'University',
    'Program',
    ...(withDue ? ['Application deadline', 'Letter due'] : ['Deadline']),
    CHECKLIST_LAYOUT.headers.box,
  ]
  if (withRefs) head.getCell(C.ref).value = CHECKLIST_LAYOUT.headers.ref
  head.height = 20
  head.eachCell((c, col) => {
    if (col > C.box) return
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

    // A real date, so the sheet can sort on it and the overdue rule can compare it.
    const asDate = (iso: string) => {
      const [y, m, day] = iso.split('-').map(Number)
      return new Date(Date.UTC(y, m - 1, day))
    }

    const d = row.getCell(C.deadline)
    if (r.deadlineIso) {
      d.value = asDate(r.deadlineIso)
      d.numFmt = 'yyyy-mm-dd'
      d.font = font({ size: 11 })
    } else {
      d.value = r.deadlineNote
      d.font = font({ italic: true, size: 10.5, color: { argb: 'FFB45309' } })
    }
    d.alignment = { horizontal: 'center', vertical: 'middle' }

    // The letters' own deadline: a date where the program gives one, else its
    // rule in words. Left empty for a program with no rule of its own.
    if (C.due) {
      const due = row.getCell(C.due)
      if (r.letterDueIso) {
        due.value = asDate(r.letterDueIso)
        due.numFmt = 'yyyy-mm-dd'
        // Bold when it is not the application deadline — the reason the column exists.
        due.font = font({ size: 11, bold: r.letterDueIso !== r.deadlineIso })
      } else if (r.letterDueNote) {
        due.value = r.letterDueNote
        due.font = font({ size: 10 })
      }
      due.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    }

    // The box. Size 14 makes it easy to hit, and keeps this cell's style unique
    // in the file, which is how addCellCheckboxes finds it.
    const box = row.getCell(C.box)
    box.value = !!r.submitted
    box.font = font({ size: 14 })
    box.alignment = { horizontal: 'center', vertical: 'middle' }

    if (r.ref) row.getCell(C.ref).value = r.ref

    for (let c = 1; c <= C.box; c++) row.getCell(c).border = BOXED
    row.height = rowHeight(r)
  })

  if (rows.length === 0) {
    ws.getCell(`B${FIRST}`).value = 'No programs yet — they appear here as they are added.'
    ws.getCell(`B${FIRST}`).font = font({ italic: true, size: 11, color: { argb: SLATE_500 } })
    const bytes = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    return bytes
  }

  const rowsRef = `A${FIRST}:${BOX_COL}${last}`
  const r1 = `$${BOX_COL}${FIRST}`
  // The date the colours go by: the letter's own where that cell holds a date
  // (not a rule in words, not nothing), else the application deadline.
  const appDate = `$${colLetter(C.deadline)}${FIRST}`
  const dueDate = `$${colLetter(C.due)}${FIRST}`
  const dl = withDue ? `IF(ISNUMBER(${dueDate}),${dueDate},${appDate})` : appDate
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
  return excelCheckboxes ? addCellCheckboxes(bytes, 'xl/worksheets/sheet1.xml', `${BOX_COL}${FIRST}`) : bytes
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
  const slug = (t: string) => t.trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
  const cycle = slug(meta.cycle) || 'plan'
  // A name in another script slugs to nothing; leave it out rather than write "--".
  const who = meta.recommender && slug(meta.recommender) ? `-${slug(meta.recommender)}` : ''
  return `recommendation-letters${who}-${cycle}-${localIso(meta.preparedAt)}.xlsx`
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
