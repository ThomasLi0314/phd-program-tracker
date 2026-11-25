// Read my mailbox for news of my recommendation letters, and bring it into the
// plan.
//
// Application portals email the applicant at each step of a letter: the
// request went out to the writer, a reminder went out, the writer declined,
// the letter came in. Those emails are the most reliable record there is of
// where a letter stands, so this reads them — in the browser; nothing is sent
// anywhere — and works out, for each one, which writer and which program it is
// about and what it says happened.
//
// An email moves a letter on its own only when all three are beyond doubt: it
// names one of my writers, it is plainly from (or about) one university where
// that writer has exactly one of my programs, and it says in so many words
// what happened. Anything less — no writer named, two programs at that school,
// or an email the writer wrote me themselves — is listed for me to decide.
// A letter is never moved backwards: an old "request sent" email does not undo
// a "Letter received" I set by hand.
//
// This file is pure matching; the Gmail calls live in lib/gmail and the panel
// in components/LetterMailSync.

import type { Program } from '../../types'
import type { MessageText } from '../../lib/gmail'
import { UNIVERSITY_DOMAINS } from '../../lib/universityDomains'
import type { LetterStatus, PlannerState, Recommender } from '../types'
import { lettersOf } from './letters'
import { programIdentity, resolveProgram } from './referenceBridge'

// ---- the search ----

/** How far back to read: the June before the cycle's entry year, when application season starts. */
export function mailSince(cycle: string, now = new Date()): Date {
  const y = Number(cycle.match(/\b(20\d\d)\b/)?.[1])
  const since = y ? new Date(y - 1, 5, 1) : new Date(now.getTime() - 300 * 86_400_000)
  return since > now ? new Date(now.getTime() - 300 * 86_400_000) : since
}

/**
 * The Gmail search: mail about recommendations or references since `since`,
 * plus anything my writers sent me — never what I sent.
 */
export function letterMailQuery(since: Date, writerEmails: string[]): string {
  const d = `${since.getFullYear()}/${String(since.getMonth() + 1).padStart(2, '0')}/${String(since.getDate()).padStart(2, '0')}`
  const words = [
    'recommendation',
    'recommendations',
    'recommender',
    'recommenders',
    'referee',
    'referees',
    '"letter of reference"',
    '"letters of reference"',
    '"reference letter"',
    '"reference request"',
    '"reference submitted"',
    '"reference received"',
  ]
  const emails = [...new Set(writerEmails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+$/.test(e)))]
  const from = emails.length ? ` OR from:(${emails.join(' OR ')})` : ''
  return `after:${d} -from:me -in:chats (${words.join(' OR ')}${from})`
}

// ---- text helpers ----

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const HAN = /\p{Script=Han}/u
const B = '(?<![\\p{L}\\p{N}])'
const E = '(?![\\p{L}\\p{N}])'

/**
 * Lower-case, accents off, everything but letters and digits turned to a
 * space — one character for one, so a match in this string sits at the same
 * place in the original.
 */
export function normalize(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 128) {
      const c = text[i]
      out += (code >= 48 && code <= 57) || (code >= 97 && code <= 122) ? c : code >= 65 && code <= 90 ? c.toLowerCase() : ' '
      continue
    }
    const c = (text[i].normalize('NFD')[0] ?? ' ').toLowerCase()[0] ?? ' '
    out += /[\p{L}\p{N}]/u.test(c) ? c : ' '
  }
  return out
}

/** A regex over normalize()d text for a name or phrase, matching whole words. */
function phraseRe(phrase: string): RegExp | null {
  const tokens = normalize(phrase).split(' ').filter(Boolean)
  if (tokens.length === 0) return null
  const body = tokens.map(escapeRe).join(' +')
  // Chinese is written without spaces: a name is a run of characters inside others.
  return HAN.test(phrase) ? new RegExp(body, 'gu') : new RegExp(`${B}${body}${E}`, 'gu')
}

/** A regex over the original text for one capitalised word, e.g. "Stanford" or "MIT". */
function wordRe(word: string): RegExp {
  return new RegExp(`${B}${escapeRe(word)}${E}`, 'gu')
}

interface Span {
  start: number
  end: number
}

function spans(re: RegExp, text: string): Span[] {
  const out: Span[] = []
  re.lastIndex = 0
  for (let m = re.exec(text); m; m = re.exec(text)) {
    out.push({ start: m.index, end: m.index + m[0].length })
    if (m[0].length === 0) re.lastIndex++
  }
  return out
}

interface Segment extends Span {
  text: string
}

/** Lines, and sentences within them — with where each sits in the text. */
export function segmentsOf(text: string): Segment[] {
  const out: Segment[] = []
  const line = /[^\n]+/g
  for (let m = line.exec(text); m; m = line.exec(text)) {
    const base = m.index
    const sentence = /(?<=[.!?])\s+(?=[A-Z0-9"“(])/g
    let from = 0
    const push = (to: number) => {
      const t = m![0].slice(from, to)
      if (t.trim()) out.push({ start: base + from, end: base + to, text: t })
    }
    for (let s = sentence.exec(m[0]); s; s = sentence.exec(m[0])) {
      push(s.index)
      from = s.index + s[0].length
    }
    push(m[0].length)
  }
  return out
}

/** What the writer wrote, without the message they were replying to. */
export function ownWords(text: string): string {
  const cut = text.search(
    /^\s*>|^On [\s\S]{0,200}?wrote:|^-{2,}\s*Original Message|^_{10,}|^From: .*\n(?:Sent|Date): |^在[\s\S]{0,80}?写道[:：]/m,
  )
  return cut >= 0 ? text.slice(0, cut) : text
}

// ---- what an email says happened ----

type Said = 'invitation_sent' | 'reminded' | 'received' | 'declined' | 'agreed'

const NOUN = '(?:recommendations?|references?|letters?(?: of (?:recommendation|reference|support))?|evaluations?|lors?)'
const DET = '(?:(?:a|an|the|his|her|their|your|my|its|one|this|that)\\s+)?(?:[a-z-]+\\s+){0,2}?'

const RECEIVED = [
  // "Your recommendation from John Smith has been received", "Recommendation Received"
  new RegExp(`\\b${NOUN}(?:\\s+(?:from|by|for)\\s+[^!?\\n]{1,80}?)?\\s+(?:(?:has|have) been|was|were|is|are|is now|now)?\\s*(?:successfully\\s+)?(?:submitted|received|completed|uploaded)\\b`, 'g'),
  // "John Smith has submitted a letter of recommendation", "completed their recommendation"
  new RegExp(`\\b(?:submitted|completed|uploaded)\\s+${DET}${NOUN}\\b(?!\\s+(?:request|invitation|form link))`, 'g'),
  // "We have received a recommendation from"
  new RegExp(`\\b(?:we|we've|office|committee|program|department|school|university)\\s+(?:have\\s+|has\\s+)?(?:now\\s+)?received\\s+${DET}${NOUN}\\b`, 'g'),
]
const DECLINED = [
  /\b(?:has|have)?\s*declined\s+(?:to\s+(?:write|provide|submit|complete|serve)|(?:your|the|this|our)\s+(?:request|invitation))/g,
  /\b(?:is|are|was|were)\s+unable\s+to\s+(?:write|provide|submit|complete)\b/g,
  /\brecommendation\s+(?:request\s+)?declined\b/g,
]
const REMINDED = [
  /\breminder(?:\s+e-?mail)?\s+(?:has been|have been|was|were)\s+(?:successfully\s+)?(?:sent|e-?mailed|delivered)\b/g,
  /\b(?:has|have|we've|we)\s+(?:just\s+)?(?:sent|e-?mailed)\s+(?:a|an|another)?\s*(?:\w+\s+)?reminder\b/g,
  /\b(?:has|have)\s+been\s+reminded\b/g,
  /\breminder\s+sent\b/g,
]
const INVITED = [
  // "An email has been sent to your recommender", "Your request to Jane Doe (jdoe@nyu.edu) was sent"
  // — the names and addresses in between may hold dots, so only ! ? and line ends stop them.
  /\b(?:request|invitation|e-?mail|notification|instructions|link)s?\s+(?:to\s+[^!?\n]{1,80}?\s+|for\s+[^!?\n]{1,60}?\s+)?(?:has been|have been|was|were)\s+(?:successfully\s+)?(?:sent|e-?mailed|delivered)\b/g,
  // "Your recommender has been notified"
  /\b(?:has|have)\s+been\s+(?:notified|contacted|invited|e-?mailed|sent\s+(?:an?\s+)?(?:e-?mail|invitation|request|link))\b/g,
  // "We have sent an email to"
  /\b(?:we|we've|system)\s+(?:has\s+|have\s+)?(?:sent|e-?mailed)\s+(?:an?\s+)?(?:e-?mail|request|invitation|instructions|link)\b/g,
  /\b(?:recommendation|reference)\s+request\s+(?:sent|submitted|confirmation)\b/g,
  /\brecommenders?\s+(?:registered|added|invited)\b/g,
  /\byou(?:'ve| have)\s+(?:registered|added|invited)\s+[^!?\n]{0,80}?\s+as\s+(?:an?\s+|your\s+)?(?:recommender|referee)\b/g,
]
// The writer's own words.
const W_RECEIVED = [
  ...RECEIVED,
  /\b(?:i'?ve|i have|i just|just|i've now|i have now|i've just)\s+(?:now\s+)?(?:submitted|uploaded|sent (?:in|off)|completed|finished|done)\b/g,
  /\b(?:all|both|everything|letters?)\s+(?:are|is|have been|has been)\s+(?:now\s+)?(?:submitted|uploaded|done|in)\b/g,
]
const W_AGREED = [
  /\b(?:happy|glad|delighted|pleased|honou?red|willing)\s+to\s+(?:write|support|provide|do|serve|recommend)\b/g,
  /\b(?:i'?d|i would|i will|i'll)\s+be\s+(?:happy|glad|delighted|pleased|honou?red)\b/g,
  /\bof course\b/g,
  /\b(?:i will|i'll|i can)\s+(?:write|provide|submit|do)\s+(?:a|the|your|it|this|these|them|one|letters?)\b/g,
]
const W_DECLINED = [
  ...DECLINED,
  /\b(?:not\s+(?:be\s+)?able|unable)\s+to\s+(?:write|provide|support|recommend)\b/g,
  /\b(?:won'?t|will not|cannot|can'?t)\s+(?:be able to\s+)?(?:write|provide|support)\s+(?:a|the|you|your|this|letters?)\b/g,
  /\bnot the (?:right|best) person\b/g,
]

/** Words that make a sentence about a letter conditional or negative. */
const HEDGE =
  /\b(?:when|whenever|once|after|until|till|if|unless|before|whether|as soon as|will|shall|should|must|might|need|needs|to be|not|never|no longer|yet|awaiting|pending|outstanding|missing)\b|n't\b/
/** Words that turn a writer's "happy to write" around. */
const NEGATED = /\b(?:not|never|unable|unfortunately|afraid|regret|sorry)\b|n't\b/

/** Whether one of `patterns` matches `seg` (lower-cased) in a clause `guard` doesn't. */
function plainly(seg: string, patterns: RegExp[], guard: RegExp | null): boolean {
  for (const re of patterns) {
    re.lastIndex = 0
    for (let m = re.exec(seg); m; m = re.exec(seg)) {
      if (!guard) return true
      // The clause up to and including the match: "You will be notified when
      // the letter has been submitted" is a promise, not news.
      const head = seg.slice(Math.max(0, m.index - 60), m.index + m[0].length)
      const clause = head.slice(Math.max(head.lastIndexOf(';'), head.lastIndexOf(':')) + 1)
      if (!guard.test(clause)) return true
    }
  }
  return false
}

/** A status alone in a table cell, after the writer's name. */
const STATUS_CELL = /^\s*(?:status\s*[:\-–]?\s*)?(?:received|submitted|complete|completed)\s*\.?\s*$/i

/** What one sentence of a portal email says happened, if it says so plainly. */
export function portalSays(seg: string): Said | null {
  const s = seg.toLowerCase()
  if (plainly(s, RECEIVED, HEDGE)) return 'received'
  if (plainly(s, DECLINED, HEDGE)) return 'declined'
  if (plainly(s, REMINDED, HEDGE)) return 'reminded'
  if (plainly(s, INVITED, HEDGE)) return 'invitation_sent'
  return null
}

/** What one sentence a writer wrote me suggests. */
export function writerSays(seg: string): Said | null {
  const s = seg.toLowerCase()
  if (plainly(s, W_RECEIVED, HEDGE)) return 'received'
  if (plainly(s, W_AGREED, NEGATED)) return 'agreed'
  // The negative patterns carry their own "not", so nothing to guard against.
  if (plainly(s, W_DECLINED, null)) return 'declined'
  return null
}

const SAID_RANK: Record<Said, number> = { received: 4, declined: 3, reminded: 2, invitation_sent: 1, agreed: 0 }

interface Heard {
  said: Said
  seg: string
  /** read from a sentence naming this writer and no other — the only kind that may apply itself */
  alone?: boolean
}
/** The stronger of two readings: a letter in beats a decline beats a reminder beats a request. */
const stronger = (a: Heard | null, b: Heard | null): Heard | null =>
  !a ? b : !b ? a : SAID_RANK[b.said] > SAID_RANK[a.said] ? b : a

/** Sentences that are about letters at all. */
const ABOUT_LETTERS = /recommend|referee|reference|letter/i

// ---- universities ----

/** Short names emails use, beyond the full name. */
const ALIASES: Record<string, string[]> = {
  'Massachusetts Institute of Technology': ['MIT'],
  'MIT–WHOI Joint Program': ['MIT-WHOI', 'MIT/WHOI', 'MIT WHOI', 'Woods Hole'],
  'California Institute of Technology': ['Caltech'],
  'Georgia Institute of Technology': ['Georgia Tech'],
  'Carnegie Mellon University': ['CMU'],
  'Johns Hopkins University': ['Johns Hopkins', 'JHU'],
  'University of Pennsylvania': ['UPenn'],
  'University of California, Berkeley': ['Berkeley'],
  'University of California, Los Angeles': ['UCLA'],
  'University of California, San Diego': ['UCSD'],
  'University of California, Santa Barbara': ['UCSB'],
  'University of California, Irvine': ['UCI'],
  'University of Michigan, Ann Arbor': ['University of Michigan', 'UMich'],
  'University of Illinois Urbana-Champaign': ['UIUC', 'University of Illinois'],
  'University of Texas at Austin': ['UT Austin'],
  'University of Wisconsin-Madison': ['UW-Madison', 'University of Wisconsin'],
  'University of Washington': ['UW Seattle'],
  'Washington University in St. Louis': ['WashU', 'WUSTL'],
  'University of Maryland, College Park': ['University of Maryland', 'UMD'],
  'The Ohio State University': ['Ohio State'],
  'Rutgers University-New Brunswick': ['Rutgers'],
  'New York University': ['NYU'],
  'New York University (Courant)': ['NYU', 'Courant'],
  'New York University — Courant Institute': ['NYU', 'Courant'],
  'University of North Carolina at Chapel Hill': ['UNC Chapel Hill', 'UNC'],
  'University of Colorado Boulder': ['CU Boulder'],
  'University of Southern California': ['USC'],
  'University of British Columbia': ['UBC'],
  'University College London': ['UCL'],
  'École polytechnique fédérale de Lausanne': ['EPFL'],
  'ETH Zürich': ['ETH Zurich', 'ETH'],
  'ETH Zürich (Swiss Federal Institute of Technology Zurich)': ['ETH Zurich', 'ETH'],
  'Imperial College London': ['Imperial College'],
}

interface UniAlias {
  university: string
  re: RegExp
  /** true: runs on the original text (an acronym or one capitalised word); false: on normalize()d text */
  exact: boolean
}

function aliasesFor(university: string): UniAlias[] {
  const out: UniAlias[] = []
  const add = (s: string) => {
    const t = s.trim()
    if (!t) return
    if (/^[A-Z][A-Za-z]*$/.test(t) && !t.includes(' ')) out.push({ university, re: wordRe(t), exact: true })
    else {
      const re = phraseRe(t)
      if (re) out.push({ university, re, exact: false })
    }
  }
  add(university)
  add(university.replace(/\s*\(.*?\)\s*/g, ' '))
  add(university.split(/\s+[—–-]\s+/)[0])
  for (const a of ALIASES[university] ?? []) add(a)
  // "University of California, Berkeley" → "UC Berkeley"
  const uc = university.match(/^University of California,\s*(.+)$/)
  if (uc) add(`UC ${uc[1]}`)
  // "Stanford University" → "Stanford" (one capitalised word only)
  const one = university.match(/^([A-Z][a-z]+) University$/)
  if (one) add(one[1])
  return out
}

/** Hosts many universities send through: their domain says nothing about which. */
const SHARED_HOSTS = new Set([
  'applyweb.com',
  'collegenet.com',
  'embark.com',
  'technolutions.net',
  'slate.org',
  'applyyourself.com',
  'hobsons.com',
  'liaisoncas.com',
  'liaisonedu.com',
  'ucas.com',
  'force.com',
  'site.com',
  'salesforce.com',
  'smapply.io',
  'submittable.com',
  'interfolio.com',
  'qualtrics.com',
  'google.com',
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'office.com',
  'microsoft.com',
  'sendgrid.net',
  'amazonses.com',
  'mailchimp.com',
  'mcsv.net',
  'mktomail.com',
  'github.io',
])

/** "gradapply.mit.edu" → "mit.edu"; "www.ox.ac.uk" → "ox.ac.uk". */
export function rootDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.')
  const second = parts[parts.length - 2]
  const tld = parts[parts.length - 1]
  const keep = tld.length === 2 && /^(?:ac|edu|co|gov|org|com|net|uni)$/.test(second) ? 3 : 2
  return parts.slice(-keep).join('.')
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

/** "Graduate Admissions <gradapp@mit.edu>" → "gradapp@mit.edu" */
export function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

// ---- writers ----

interface WriterMatcher {
  rec: Recommender
  /** over normalize()d text */
  names: RegExp[]
  /** surname alone, capitalised, over the original text — null when it could be someone else's */
  surname: RegExp | null
  email: string
}

const TITLES = /^(?:prof(?:essor)?|dr|mr|mrs|ms|miss|mx|sir|dame)\.?\s+/i
const SUFFIXES = /,?\s+(?:ph\.?\s?d\.?|jr\.?|sr\.?|ii|iii|md|m\.d\.)$/i

function nameParts(name: string): string[] {
  let n = name.trim()
  while (TITLES.test(n)) n = n.replace(TITLES, '')
  n = n.replace(SUFFIXES, '').trim()
  // "Smith, John" → "John Smith"
  const comma = n.split(',')
  if (comma.length === 2 && comma[0].trim() && comma[1].trim()) n = `${comma[1].trim()} ${comma[0].trim()}`
  return n.split(/\s+/).filter(Boolean)
}

function writerMatchers(writers: Recommender[]): WriterMatcher[] {
  const surnames = writers.map((w) => nameParts(w.name).at(-1)?.toLowerCase() ?? '')
  return writers.map((rec, i) => {
    const parts = nameParts(rec.name)
    const names: RegExp[] = []
    const add = (s: string) => {
      const re = phraseRe(s)
      if (re) names.push(re)
    }
    if (parts.length) {
      add(parts.join(' '))
      if (parts.length >= 2) {
        add(`${parts[0]} ${parts.at(-1)}`)
        add(`${parts.at(-1)} ${parts[0]}`)
      }
    }
    const last = parts.at(-1) ?? ''
    const unique = surnames.filter((s) => s === last.toLowerCase()).length === 1 && surnames[i] !== ''
    const surname =
      parts.length >= 2 && unique && (last.length >= 3 || HAN.test(last))
        ? HAN.test(last)
          ? new RegExp(escapeRe(last), 'gu')
          : wordRe(last[0].toUpperCase() + last.slice(1))
        : null
    return { rec, names, surname, email: rec.email.trim().toLowerCase() }
  })
}

function writerSpans(w: WriterMatcher, text: string, norm: string): Span[] {
  const out = w.names.flatMap((re) => spans(re, norm))
  if (w.surname) out.push(...spans(w.surname, text))
  if (w.email.includes('@')) out.push(...spans(new RegExp(escapeRe(w.email), 'gi'), text))
  return out
}

// ---- the plan, as the matcher needs it ----

interface ProgramRef {
  id: string
  university: string
  /** writers with a letter on this program */
  writers: Set<string>
  /** the program's own name and department, for telling two at one school apart */
  names: RegExp[]
}

export interface MailContext {
  programs: ProgramRef[]
  writers: WriterMatcher[]
  aliases: UniAlias[]
  /** root domain → the plan's universities it belongs to */
  domains: Map<string, Set<string>>
  /** writer address → writer id */
  writerByEmail: Map<string, string>
}

function cleanProgramName(name: string): string {
  return name
    .replace(/\((?:ph\.?\s?d|m\.?s|ms|meng|m\.?eng|mphil|dphil|phd)\.?\)/gi, ' ')
    .replace(/^\s*(?:ph\.?\s?d\.?|doctoral|doctorate|m\.?s\.?|master'?s?|m\.?eng\.?|graduate)\s+(?:program(?:me)?\s+|degree\s+)?(?:in|of)\s+/i, '')
    .replace(/^\s*(?:department|dept\.?|school|division|program(?:me)?)\s+(?:of|in)\s+/i, '')
    .replace(/\s+(?:ph\.?\s?d\.?|program(?:me)?|graduate program)\s*$/i, '')
    .trim()
}

export function mailContext(state: PlannerState, byId: Map<string, Program>): MailContext {
  const identities = state.programs.map((p) => ({ p, id: programIdentity(p, resolveProgram(p, byId)) }))
  const programs: ProgramRef[] = identities.map(({ p, id }) => ({
    id: p.id,
    university: id.university,
    writers: new Set(lettersOf(p).map((l) => l.recommenderId)),
    names: [id.programName, id.department]
      .map(cleanProgramName)
      .filter((n) => n.replace(/\s/g, '').length >= 4)
      .map(phraseRe)
      .filter((r): r is RegExp => !!r),
  }))

  // Every known school competes for a mention, so "British Columbia" is not read as "Columbia".
  const universities = new Set([...programs.map((p) => p.university), ...Object.keys(UNIVERSITY_DOMAINS)])
  const aliases = [...universities].flatMap(aliasesFor)

  // A sender's domain names the school. A university's own domain may stand
  // for more than one entry (MIT and the MIT–WHOI program); a domain that came
  // only from a program's link, and is shared with another school's, says
  // nothing — that is some application service, not a university.
  const claims = new Map<string, { universities: Set<string>; fromLinks: Set<string> }>()
  const claim = (domain: string, university: string, fromLink: boolean) => {
    const d = rootDomain(domain)
    if (!d || SHARED_HOSTS.has(d)) return
    const c = claims.get(d) ?? { universities: new Set<string>(), fromLinks: new Set<string>() }
    c.universities.add(university)
    if (fromLink) c.fromLinks.add(university)
    claims.set(d, c)
  }
  for (const { id } of identities) {
    for (const d of UNIVERSITY_DOMAINS[id.university] ?? []) claim(d, id.university, false)
    for (const url of [id.website, id.portal]) {
      const h = url && hostOf(url)
      if (h) claim(h, id.university, true)
    }
  }
  const domains = new Map<string, Set<string>>()
  for (const [d, c] of claims) {
    const institutional = [...c.universities].every((u) => !c.fromLinks.has(u) || (UNIVERSITY_DOMAINS[u] ?? []).includes(d))
    if (c.universities.size === 1 || institutional) domains.set(d, c.universities)
  }

  const writerByEmail = new Map<string, string>()
  for (const r of state.recommenders) {
    const e = r.email.trim().toLowerCase()
    if (e.includes('@')) writerByEmail.set(e, r.id)
  }

  return { programs, writers: writerMatchers(state.recommenders), aliases, domains, writerByEmail }
}

interface UniHit extends Span {
  /** every university this name could be — "NYU" is each of the NYU entries */
  universities: Set<string>
}

/** The universities a text names, the longest name winning where two overlap. */
function universityHits(text: string, norm: string, ctx: MailContext): UniHit[] {
  const raw: (Span & { university: string })[] = []
  for (const a of ctx.aliases) for (const s of spans(a.re, a.exact ? text : norm)) raw.push({ ...s, university: a.university })
  raw.sort((x, y) => y.end - y.start - (x.end - x.start) || x.start - y.start)
  const out: UniHit[] = []
  for (const h of raw) {
    const same = out.find((t) => t.start === h.start && t.end === h.end)
    if (same) same.universities.add(h.university)
    else if (!out.some((t) => h.start < t.end && t.start < h.end))
      out.push({ start: h.start, end: h.end, universities: new Set([h.university]) })
  }
  return out
}

function universitiesIn(text: string, ctx: MailContext): Set<string> {
  return new Set(universityHits(text, normalize(text), ctx).flatMap((h) => [...h.universities]))
}

/** The plan's universities a sender's address belongs to, if any. */
function universitiesOfSender(address: string, ctx: MailContext): Set<string> | null {
  const host = address.split('@')[1]
  return host ? (ctx.domains.get(rootDomain(host)) ?? null) : null
}

// ---- reading one email ----

export interface LetterFinding {
  messageId: string
  threadId: string
  sentAt: number
  from: string
  subject: string
  /** a portal or school's notice, or a note from the writer themselves */
  source: 'portal' | 'writer'
  /** the sentence the status was read from */
  evidence: string
  status: LetterStatus
  /** null when the email names none of my writers */
  recId: string | null
  /** the plan's programs it may be about */
  programIds: string[]
  /** of those, the ones it most likely is about — pre-ticked for review */
  likely: string[]
  /** programs above where the writer has no letter yet, so applying would add them */
  unassigned: string[]
  /** safe to apply without asking: one writer, one program, said plainly by the portal */
  certain: boolean
}

const MAX_TEXT = 30_000
const LETTERISH = /recommend|reference|referee|letter|application|apply|portal|submit|support/i

function trimEvidence(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > 220 ? `${t.slice(0, 217)}…` : t
}

/** Which of the candidate programs the text names by program or department, when that narrows it. */
function namedIn(candidates: ProgramRef[], norm: string): ProgramRef[] {
  if (candidates.length <= 1) return candidates
  const named = candidates.filter((p) => p.names.some((re) => spans(re, norm).length > 0))
  return named.length >= 1 && named.length < candidates.length ? named : candidates
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end

/** Everything one email says about my letters. */
export function readLetterMail(mail: MessageText, ctx: MailContext, selfEmail = ''): LetterFinding[] {
  const address = addressOf(mail.from)
  if (selfEmail && address === selfEmail.toLowerCase()) return []
  const base = {
    messageId: mail.id,
    threadId: mail.threadId,
    sentAt: mail.sentAt,
    from: mail.from,
    subject: mail.subject,
  }

  // ---- from a writer: a suggestion, never applied on its own ----
  const writerId = ctx.writerByEmail.get(address)
  if (writerId) {
    const own = ownWords(mail.text).slice(0, MAX_TEXT)
    if (!LETTERISH.test(own) && !LETTERISH.test(mail.subject)) return []
    let best: Heard | null = null
    for (const seg of segmentsOf(own)) {
      const said = writerSays(seg.text)
      if (said) best = stronger(best, { said, seg: seg.text })
    }
    if (!best) return []
    const mine = ctx.programs.filter((p) => p.writers.has(writerId))
    const schools = universitiesIn(`${mail.subject}\n${own}`, ctx)
    const at = mine.filter((p) => schools.has(p.university))
    const programIds = (at.length ? at : mine).map((p) => p.id)
    return [
      {
        ...base,
        source: 'writer',
        evidence: trimEvidence(best.seg),
        status: best.said,
        recId: writerId,
        programIds,
        // Naming no school, "happy to write" covers them all; "I've submitted
        // my letter" could be any one, so nothing is ticked for me.
        likely: at.length ? namedIn(at, normalize(own)).map((p) => p.id) : best.said === 'agreed' ? programIds : [],
        unassigned: [],
        certain: false,
      },
    ]
  }

  // ---- from a portal or a school ----
  const text = `${mail.subject}\n${mail.text.slice(0, MAX_TEXT)}`
  const norm = normalize(text)
  const segs = segmentsOf(text)
  const subjectEnd = mail.subject.length

  const mentions = new Map<string, Span[]>()
  for (const w of ctx.writers) {
    const s = writerSpans(w, text, norm)
    if (s.length) mentions.set(w.rec.id, s)
  }
  const mentionSpans = [...mentions.values()].flat()
  const names = (seg: Span, ss: Span[]) => ss.some((s) => s.start >= seg.start && s.start < seg.end)

  // Which school: the sender's domain, else the schools the subject names,
  // else the body's — leaving out a writer's surname that is also a school's
  // ("Brown") and a writer's own institution ("John Smith, New York University").
  const sender = universitiesOfSender(address, ctx)
  let schools: Set<string>
  let oneSchool: boolean
  if (sender) {
    schools = sender
    oneSchool = true
  } else {
    const theirs = new Set(
      [...mentions.keys()].flatMap((id) => [...universitiesIn(ctx.writers.find((w) => w.rec.id === id)?.rec.institution ?? '', ctx)]),
    )
    const hits = universityHits(text, norm, ctx).filter((h) => !mentionSpans.some((m) => overlaps(h, m)))
    const choose = (hs: UniHit[]) => {
      const rest = hs.filter((h) => ![...h.universities].every((u) => theirs.has(u)))
      return rest.length ? rest : hs
    }
    const inSubject = hits.filter((h) => h.start < subjectEnd)
    const chosen = choose(inSubject.length ? inSubject : hits)
    schools = new Set(chosen.flatMap((h) => [...h.universities]))
    const key = (h: UniHit) => [...h.universities].sort().join('|')
    oneSchool = chosen.length > 0 && chosen.every((h) => key(h) === key(chosen[0]))
  }
  const atSchool = ctx.programs.filter((p) => schools.has(p.university))
  if (atSchool.length === 0) return []

  // What the email says without naming anyone — "The following recommender
  // has submitted a letter:" above a line with the name. Used only when the
  // email names one writer, so it can't be pinned on the wrong one.
  let overall: Heard | null = null
  for (const seg of segs) {
    if (names(seg, mentionSpans) || !ABOUT_LETTERS.test(seg.text)) continue
    const said = portalSays(seg.text)
    if (said) overall = stronger(overall, { said, seg: seg.text })
  }

  const out: LetterFinding[] = []
  for (const [recId, ss] of mentions) {
    const others = [...mentions].filter(([id]) => id !== recId).flatMap(([, s]) => s)
    let best: Heard | null = null
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]
      if (!names(seg, ss)) continue
      // "Smith has submitted; Lee has not" says nothing certain about either.
      const alone = !names(seg, others)
      const said = portalSays(seg.text)
      if (said) best = stronger(best, { said, seg: seg.text, alone })
      // "The following recommender has submitted a letter:" on the line
      // above the name is about this writer, if the line names no one else.
      const prev = segs[i - 1]
      if (prev && /:\s*$/.test(prev.text) && !names(prev, mentionSpans)) {
        const heading = portalSays(prev.text)
        if (heading) best = stronger(best, { said: heading, seg: `${prev.text.trim()} ${seg.text.trim()}`, alone })
      }
      // "John Smith" | "Received" — the status in the next cell of a table.
      const next = segs[i + 1]
      if (next && STATUS_CELL.test(next.text))
        best = stronger(best, { said: 'received', seg: `${seg.text.trim()} — ${next.text.trim()}`, alone })
    }
    if (!best && mentions.size === 1 && overall) best = { ...overall, alone: false }
    if (!best || best.said === 'agreed') continue

    const theirs = atSchool.filter((p) => p.writers.has(recId))
    const pool = theirs.length ? theirs : atSchool
    out.push({
      ...base,
      source: 'portal',
      evidence: trimEvidence(best.seg),
      status: best.said,
      recId,
      programIds: pool.map((p) => p.id),
      likely: namedIn(pool, norm).map((p) => p.id),
      unassigned: theirs.length ? [] : pool.map((p) => p.id),
      // The writer's only program at this school — never one picked out by
      // name, which a writer's own title ("Professor of Mechanical
      // Engineering") could have supplied.
      certain: theirs.length === 1 && oneSchool && !!best.alone,
    })
  }

  // A notice that names none of my writers ("A recommendation has been
  // submitted") goes to review, for programs that have letters — when it is
  // about recommendations, not some other letter ("your decision letter has
  // been uploaded").
  if (mentions.size === 0 && overall && overall.said !== 'agreed' && /recommend|referee|reference/i.test(overall.seg)) {
    const withLetters = atSchool.filter((p) => p.writers.size > 0)
    if (withLetters.length) {
      out.push({
        ...base,
        source: 'portal',
        evidence: trimEvidence(overall.seg),
        status: overall.said,
        recId: null,
        programIds: withLetters.map((p) => p.id),
        likely: namedIn(withLetters, norm).map((p) => p.id),
        unassigned: [],
        certain: false,
      })
    }
  }
  return out
}

// ---- deciding what changes ----

const RANK: Record<LetterStatus, number> = {
  not_requested: 0,
  requested: 1,
  agreed: 2,
  invitation_sent: 3,
  reminded: 4,
  received: 5,
  declined: -1,
}

/** Would `next` be news for a letter now at `current`? Never a step back. */
export function movesForward(current: LetterStatus, next: LetterStatus): boolean {
  if (current === next) return false
  if (current === 'declined') return next === 'received'
  if (next === 'declined') return current !== 'received'
  return RANK[next] > RANK[current]
}

export interface LetterUpdate {
  programId: string
  recId: string
  from: LetterStatus
  to: LetterStatus
  finding: LetterFinding
}

export interface MailPlan {
  /** certain, and news: applied straight away */
  updates: LetterUpdate[]
  /** for me to decide */
  review: LetterFinding[]
  /** emails that agree with what the plan already shows */
  upToDate: number
}

/** The key an undone or dismissed match is remembered by. */
export const ignoreKey = (messageId: string, programId?: string, recId?: string | null) =>
  programId ? `${messageId}:${programId}:${recId ?? ''}` : messageId

/** Where one writer's letter for one program stands now; undefined if they have none there. */
export function letterStatusOf(state: PlannerState, programId: string, recId: string): LetterStatus | undefined {
  const p = state.programs.find((x) => x.id === programId)
  return p ? lettersOf(p).find((l) => l.recommenderId === recId)?.status : undefined
}

/** Whether applying a finding to this program would change anything. */
export function actionable(f: LetterFinding, programId: string, state: PlannerState, ignored: Set<string>): boolean {
  if (!f.recId) return true
  if (ignored.has(ignoreKey(f.messageId, programId, f.recId))) return false
  const cur = letterStatusOf(state, programId, f.recId)
  return cur === undefined ? f.unassigned.includes(programId) : movesForward(cur, f.status)
}

export function planLetterUpdates(findings: LetterFinding[], state: PlannerState, ignored: Set<string>): MailPlan {
  const live = findings.filter((f) => !ignored.has(ignoreKey(f.messageId)))

  // Certain findings, one letter at a time: the furthest any email got —
  // unless the latest word is a decline and no letter ever came.
  const byLetter = new Map<string, LetterFinding[]>()
  for (const f of live) {
    if (!f.certain || !f.recId) continue
    if (ignored.has(ignoreKey(f.messageId, f.programIds[0], f.recId))) continue
    const k = `${f.programIds[0]}|${f.recId}`
    byLetter.set(k, [...(byLetter.get(k) ?? []), f])
  }
  const updates: LetterUpdate[] = []
  let upToDate = 0
  for (const fs of byLetter.values()) {
    fs.sort((a, b) => a.sentAt - b.sentAt)
    const latest = fs[fs.length - 1]
    const furthest = fs
      .filter((f) => f.status !== 'declined')
      .sort((a, b) => RANK[b.status] - RANK[a.status] || b.sentAt - a.sentAt)[0]
    const pick = latest.status === 'declined' && furthest?.status !== 'received' ? latest : (furthest ?? latest)
    const programId = pick.programIds[0]
    const recId = pick.recId!
    const current = letterStatusOf(state, programId, recId)
    if (!current) continue
    if (movesForward(current, pick.status)) updates.push({ programId, recId, from: current, to: pick.status, finding: pick })
    else upToDate += fs.length
  }

  // The rest, while some program in them could still move.
  const uncertain = live.filter((f) => !f.certain)
  const review = uncertain
    .filter((f) => f.programIds.some((pid) => actionable(f, pid, state, ignored)))
    .sort((a, b) => b.sentAt - a.sentAt)
  upToDate += uncertain.length - review.length

  updates.sort((a, b) => b.finding.sentAt - a.finding.sentAt)
  return { updates, review, upToDate }
}
