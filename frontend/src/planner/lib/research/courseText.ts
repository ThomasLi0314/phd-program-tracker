// Finding a course number in catalog text, and deciding whether some words are
// printed as that course's name. No network and no model in here: this is the
// check that a looked-up name has to pass.
//
// The danger is the neighbour. Numbers come in lists ("SIOG 240, SIOG 260"),
// in prerequisites ("Prerequisite: OCEAN 512. Offered: Sp.") and one digit
// apart (12.80, 12.800, 12.801). So a name counts only when it follows or
// precedes exactly that number with nothing but punctuation between, and only
// whole: "Geophysical Fluid Dynamics" is not the name of "… Dynamics II".

import { escapeRe, readableText } from './curriculum'

/** A code's letters and digits: "EAS6490", "EAS 6490" and "eas-6490" are one course. */
export const codeKey = (code: string) =>
  code
    .replace(/\[J\]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toUpperCase()

/** Specific enough to look up: a department and a number (or MIT's 12.800), not "EAS 8xxx". */
export function isLookupCode(code: string): boolean {
  const s = code.trim()
  if (s.length > 40 || /\d(?:x{1,3}|X{2,3})(?!\p{L})|[xX]{3}|[?#]/u.test(s)) return false
  return /^\p{L}[^\d]*\d/u.test(s) || /^\d{1,2}[.-][\p{L}\d]{2,5}/u.test(s)
}

/** Catalog markdown as plain lines: no link addresses, emphasis or invisible characters. */
export function plainLines(markdown: string): string {
  return readableText(markdown.replace(/\p{Cf}/gu, ''))
    .replace(/\\([_*[\]().#+-])/g, '$1')
    .replace(/\*+/g, '')
    .replace(/(?<![\p{L}\p{N}])_|_(?![\p{L}\p{N}])/gu, '')
    .replace(/[^\S\n\t]/g, ' ')
}

/** Exactly this code: not 12.8001 for 12.800, nor SIOC 221A for SIOC 221. */
function codeRe(code: string): RegExp | null {
  const plain = code.replace(/\[J\]/g, '')
  const found = [...plain.matchAll(/\p{L}+|\p{N}+/gu)]
  if (found.length === 0) return null
  const parts = found.map((m) => m[0])
  let body = parts[0]
  for (let i = 1; i < parts.length; i++) {
    const [fromDigit, toDigit] = [/\p{N}/u.test(parts[i - 1]), /\p{N}/u.test(parts[i])]
    // "12.S501" has a dot there; "221A" has nothing, or "221 A New Look" would pass for it.
    const split = found[i].index > found[i - 1].index + parts[i - 1].length
    const between = !fromDigit ? '[ \\t.:&–-]{0,3}' : toDigit || split ? '[ .–-]' : ''
    body += between + parts[i]
  }
  // A short prefix in any case would find "OR 600" in "or 600 level".
  const flags = parts.some((p) => /^\p{L}{3,}$/u.test(p)) ? 'giu' : 'gu'
  // "-001" is a section number and "[J]" a joint listing: both still this course.
  return new RegExp(`(?<![\\p{L}\\p{N}.])${body}(?:\\[J\\]|-0\\d\\d)?(?![\\p{L}\\p{N}]|[.–-]\\p{N})`, flags)
}

interface Occurrence {
  start: number
  end: number
  lineStart: number
  /** Nothing but a bullet, a heading mark or a list number before it. */
  leads: boolean
}

function occurrences(text: string, code: string): Occurrence[] {
  const re = codeRe(code)
  if (!re) return []
  return [...text.matchAll(re)].map((m) => {
    const lineStart = text.lastIndexOf('\n', m.index - 1) + 1
    const before = text.slice(lineStart, m.index)
    return {
      start: m.index,
      end: m.index + m[0].length,
      lineStart,
      leads: /^[^\p{L}\p{N}]*(?:\d{1,2}[.)][ \t]*)?$/u.test(before),
    }
  })
}

const NAME_FOLLOWS =
  /^[^\p{L}\p{N}\n]{1,12}(?!\p{Lu}{2,}[ .]?\d)(?:\p{Lu}\p{Ll}|\p{Lu}{4,}|\p{Lu}\p{L}?[ -]\p{Lu})/u

const looksNamed = (text: string, o: Occurrence) => o.leads && NAME_FOLLOWS.test(text.slice(o.end, o.end + 60))

/** Probably a listing for this course, so no need to go looking for another. */
export function listsCourse(text: string, code: string): boolean {
  return occurrences(text, code).some((o) => looksNamed(text, o))
}

/** The places worth showing the model, the likeliest listing first. */
export function passagesAbout(text: string, code: string, max: number): string[] {
  const rank = (o: Occurrence) => (looksNamed(text, o) ? 2 : o.leads ? 1 : 0)
  return occurrences(text, code)
    .sort((a, b) => rank(b) - rank(a))
    .slice(0, max)
    .map((o) => text.slice(Math.max(o.lineStart, o.start - 160), o.end + 220).trim())
}

/** Another course is what's being named, not this one. */
const ABOUT_ANOTHER = /\b(?:prereq\w*|coreq\w*|same as|meets with|equivalent|cross-?listed|formerly|jointly|replaces)\b/i
/** Field labels that sit where a name would. */
const NOT_A_NAME =
  /^(?:prereq\w*|coreq\w*|offered|same as|see|credits?|units?|hours?|points?|instructor|staff|tba|required|elective|core|fall|spring|winter|summer|autumn|not stated|unknown|none|or|and)$/i
const ANOTHER_CODE = /^(?:\p{Lu}{2,}[ .]?\d{3}|\d{1,2}\.\d{2,4}\b)/u
/** "Marine Chemistry (SIOG 260)": the name of the number in the brackets. */
const CODE_IN_BRACKETS =
  /^[^\S\n]*[([][^\S\n]*(?!(?:Fall|Spring|Summer|Winter|Autumn)\b)(?:(?:\p{Lu}[\p{L}&]{1,7}[ .-]?){1,2}\d{2,4}|\d{1,2}\.\p{Lu}?\d{2,4})/u
/** A dot after these doesn't end the name. */
const ABBREVIATION = /(?:\p{L}\.\p{L}+|\b(?:St|Dr|Mt|Ph|Jr|vs|Prof))$/u
/** In brackets after a name these are details; anything else is part of the name. */
const DETAIL = /\d|\b(?:units?|credits?|cr|hours?|points?|fall|winter|spring|summer|autumn|variable|same as|formerly|max)\b/i

/** What may come right after a whole name. */
const NAME_ENDS = [
  // A line starting in lower case carries the name on: "Field Geology / and Analysis…".
  /^[^\S\n]*(?:$|\n(?![^\S\n]*\p{Ll})|[;|()[\]!?"”\t]|\.(?![\p{L}\p{N}]|[^\S\n]+\p{Ll}))/u,
  /^[^\S\n]*[,:–—-][^\S\n]*(?:\d|(?:one|two|three|four|five|six|eight|twelve|variable|max|credits?|units?)\b)/i,
  /^[^\S\n]+\d[\d.–-]*(?:[^\S\n]*(?:credits?|units?|cr|hours?|hrs?|points?|sch|sh)\b|[^\S\n]*(?:\n|$))/i,
  /^[^\S\n]+(?:credits?|units?|prerequisites?|prereq|offered)[^\S\n]*:/i,
  /^ {3,}/,
]

function nameAfter(text: string, o: Occurrence, pattern: string): string | null {
  if (!o.leads && ABOUT_ANOTHER.test(text.slice(Math.max(o.lineStart, o.start - 80), o.start))) return null
  const gap = text.slice(o.end, o.end + 16).match(/^[^\p{L}\p{N}]{1,12}/u)?.[0]
  if (!gap) return null
  // "Physical Oceanography (SIOC 210), Marine Chemistry…": what follows is the next one's.
  if (!o.leads && /^[^\S\n]*[)\]]/.test(gap)) return null
  const breaks = gap.split('\n').length - 1
  // Over a line break only a listing counts: not a list that wraps, nor a heading below.
  if (breaks > 0 && (breaks > 2 || !o.leads || /[,;#•]/.test(gap))) return null

  const re = new RegExp(pattern, 'iuy')
  re.lastIndex = o.end + gap.length
  const found = re.exec(text)
  if (!found) return null
  let name = found[0]
  let after = re.lastIndex
  const bracket = text.slice(after, after + 70).match(/^[^\S\n]*\(([^()\n]{3,60})\)/)
  if (bracket && !DETAIL.test(bracket[1])) {
    name += ` (${bracket[1]})`
    after += bracket[0].length
  }
  if (text[after] === '.' && ABBREVIATION.test(name)) {
    name += '.'
    after++
  }
  const rest = text.slice(after, after + 80)
  if (CODE_IN_BRACKETS.test(rest)) return null
  return NAME_ENDS.some((end) => end.test(rest)) ? name : null
}

/** "Physical Oceanography (OCN 620)". */
function nameBefore(text: string, o: Occurrence, pattern: string): string | null {
  if (!/^[^\S\n]*[)\]]/.test(text.slice(o.end, o.end + 8))) return null
  const before = text.slice(Math.max(0, o.start - 260), o.start)
  const re = new RegExp(`(?:^|[\\n.;:|•])[^\\p{L}\\p{N}\\n]*(${pattern})[^\\S\\n]*[(\\[]$`, 'iu')
  return before.match(re)?.[1] ?? null
}

/** The name as the text prints it beside this code, or null if it doesn't. */
export function printedName(text: string, code: string, proposed: string): string | null {
  const name = proposed
    .replace(/[*\s]+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[\s.,;:|]+$/gu, '')
  if (name.length > 160 || !/\p{L}{3}|\p{Lo}{2}/u.test(name) || NOT_A_NAME.test(name)) return null
  if (ANOTHER_CODE.test(name) || codeKey(name) === codeKey(code)) return null
  const pattern = name.split(' ').map(escapeRe).join('\\s+')
  for (const o of occurrences(text, code)) {
    const printed = (nameAfter(text, o, pattern) ?? nameBefore(text, o, pattern))?.replace(/\s+/g, ' ').trim()
    // Names start with a capital; "SIOB 280) or from related…" is prose.
    if (printed && /^[\p{Lu}\p{Lo}\p{N}]/u.test(printed)) return printed
  }
  return null
}
