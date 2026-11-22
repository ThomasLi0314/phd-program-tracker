// Program enrichment: read the official pages, extract admissions facts, attach
// evidence, and propose them for review.
//
// Nothing here writes to the planner. It returns proposals; reviewQueue decides
// what may be applied and the user makes the call (spec §20).

import { RateLimitError, readPage, type PageContent } from '../../../lib/pageReader'
import type { SourceEvidence } from '../../types'
import { complete, LlmError, parseJson } from './llm'
import { classifyTier, discoverProgramUrls, evidenceAppears, makeSource } from './sources'
import type { FieldProposal, PageOutcome, ProgramResearchResult, ProgramSection, ProgressFn } from './types'

/** Fields we ask for. Kept to the ones that actually change decisions — a
 *  larger list costs tokens and widens the surface for invented values. */
interface FieldSpec {
  key: string
  section: ProgramSection
  label: string
  ask: string
  /** Allowed values; anything else from the model is discarded. */
  enum?: string[]
  numeric?: boolean
  /** The quoted evidence must match this, or the value is dropped: it guards a
   *  field the model is prone to answer with a neighbouring fact. */
  evidenceMust?: RegExp
}

/** A quote that is about recommendation letters says so in one of these words. */
const LETTER_WORDS = /recommend|\bletters?\b|\breferees?\b|\breferences?\b/i

export const FIELD_SPECS: FieldSpec[] = [
  { key: 'deadline', section: 'admissions', label: 'Deadline', ask: 'the application deadline, including the year if stated' },
  { key: 'gre', section: 'admissions', label: 'GRE', ask: 'GRE policy', enum: ['Required', 'Optional', 'Not Accepted'] },
  { key: 'english', section: 'admissions', label: 'English requirement', ask: 'English proficiency requirement (TOEFL/IELTS), with minimum scores if stated' },
  { key: 'applicationFee', section: 'admissions', label: 'Application fee', ask: 'the application fee amount' },
  { key: 'feeWaiver', section: 'admissions', label: 'Fee waiver', ask: 'fee waiver availability' },
  { key: 'letters', section: 'admissions', label: 'Recommendation letters', ask: 'how many recommendation letters are required', numeric: true },
  {
    key: 'letterDeadline',
    section: 'admissions',
    label: 'Letter deadline',
    ask:
      'when recommendation letters must be received — ONLY if the page says so about letters specifically (their own date, ' +
      'a grace period after the application deadline, or that they are due by the same deadline). Start with the date if ' +
      'the page prints one for letters, otherwise give the rule in a few words. The application deadline on its own is NOT an answer',
    // Without this the application deadline comes back relabelled as the letters'.
    evidenceMust: LETTER_WORDS,
  },
  { key: 'sop', section: 'admissions', label: 'Statement of purpose', ask: 'whether a statement of purpose is required' },
  { key: 'writingSample', section: 'admissions', label: 'Writing sample', ask: 'whether a writing sample is required' },
  { key: 'minGpa', section: 'admissions', label: 'Minimum GPA', ask: 'a minimum GPA, only if explicitly stated' },
  { key: 'otherRequirements', section: 'admissions', label: 'Other requirements', ask: 'any unusual additional requirement' },
  {
    key: 'admissionModel',
    section: 'structure',
    label: 'Admission model',
    ask: 'how admission decisions are made',
    enum: ['program_based', 'direct_advisor', 'rotation', 'committee_based', 'coursework_first'],
  },
  { key: 'contactEncouraged', section: 'structure', label: 'Contact faculty first?', ask: 'whether applicants are told to contact faculty before applying' },
  { key: 'duration', section: 'structure', label: 'Typical duration', ask: 'the typical or normative program length' },
  { key: 'qualifyingExams', section: 'structure', label: 'Qualifying exams', ask: 'qualifying or preliminary exam requirements' },
  { key: 'level', section: 'funding', label: 'Funding', ask: 'whether admitted PhD students are fully funded', enum: ['fully_funded', 'partial'] },
  { key: 'years', section: 'funding', label: 'Guaranteed years', ask: 'how many years of funding are guaranteed', numeric: true },
  { key: 'stipend', section: 'funding', label: 'Stipend', ask: 'the stipend amount, only if publicly stated' },
  { key: 'tuitionWaiver', section: 'funding', label: 'Tuition waiver', ask: 'whether tuition is waived/covered' },
  { key: 'healthInsurance', section: 'funding', label: 'Health insurance', ask: 'whether health insurance is included' },
]

const MAX_PAGES = 4
/** Page text sent to the model. readPage already caps at 24k; this caps cost. */
const MAX_CHARS_PER_PAGE = 12_000

const SYSTEM =
  'You extract graduate-admissions facts from the text of ONE official web page that has been fetched for you. ' +
  'The page text is your ONLY permitted source. You must NOT use anything you remember about this university. ' +
  'For every field you report you MUST supply "evidence": a VERBATIM quote copied from the page text that states it. ' +
  'If the page does not state a field, OMIT that field entirely — never guess, never infer, and never restate the question as an answer. ' +
  'Reporting nothing is a correct and expected outcome. Respond with ONLY a JSON object.'

interface RawFields {
  fields?: Record<string, { value?: unknown; evidence?: unknown }>
}

function buildUserPrompt(ctx: { university: string; programName: string; cycle: string }, page: { url: string; text: string }): string {
  const asks = FIELD_SPECS.map((f) => {
    const allowed = f.enum ? ` (one of: ${f.enum.join(' | ')})` : f.numeric ? ' (a number)' : ''
    return `  "${f.key}": ${f.ask}${allowed}`
  }).join('\n')

  return (
    `Program: ${ctx.programName} at ${ctx.university}. Target cycle: ${ctx.cycle}.\n` +
    `Page URL: ${page.url}\n\n--- PAGE TEXT START ---\n${page.text.slice(0, MAX_CHARS_PER_PAGE)}\n--- PAGE TEXT END ---\n\n` +
    `Report ONLY fields this page actually states, from:\n${asks}\n\n` +
    `Return JSON: {"fields": {"<key>": {"value": <value>, "evidence": "<verbatim quote from the page>"}}}\n` +
    `Omit any key the page does not state. Do not include a key with a null, empty, "unknown" or "not stated" value.`
  )
}

function coerce(spec: FieldSpec, raw: unknown): string | number | null {
  if (raw === null || raw === undefined) return null
  if (spec.numeric) {
    const n = typeof raw === 'number' ? raw : Number(String(raw).match(/\d+/)?.[0])
    return Number.isFinite(n) ? n : null
  }
  const s = String(raw).trim()
  if (!s) return null
  // A model told to omit unknowns sometimes still says so — treat that as absent.
  if (/^(unknown|not stated|n\/?a|none|not specified|not mentioned)\b/i.test(s)) return null
  // A bare boolean answers "is there a fee waiver?" with "true", which tells the
  // user nothing they can act on. Observed in a live run; require real prose.
  if (typeof raw === 'boolean' || /^(true|false|yes|no)$/i.test(s)) return null
  if (spec.enum) {
    const hit = spec.enum.find((e) => e.toLowerCase() === s.toLowerCase())
    if (hit) return hit
    // Tolerate near-misses on the enums models most often paraphrase.
    const l = s.toLowerCase()
    if (spec.key === 'gre') {
      if (/not accept|do not accept|will not be reviewed|not consider/.test(l)) return 'Not Accepted'
      if (/optional|not required/.test(l)) return 'Optional'
      if (/required/.test(l)) return 'Required'
    }
    if (spec.key === 'admissionModel' && /committee/.test(l)) return 'committee_based'
    if (spec.key === 'level') {
      if (/full/.test(l)) return 'fully_funded'
      if (/partial/.test(l)) return 'partial'
    }
    return null
  }
  return s.slice(0, 600)
}

/** Extract from one already-fetched page. */
async function extractFromPage(
  ctx: { university: string; programName: string; cycle: string },
  page: { url: string; text: string },
  tier: SourceEvidence['tier'],
  signal?: AbortSignal,
): Promise<FieldProposal[]> {
  const out = await complete(SYSTEM, buildUserPrompt(ctx, page), { signal })
  const parsed = parseJson<RawFields>(out)
  if (!parsed?.fields) return []

  const proposals: FieldProposal[] = []
  for (const spec of FIELD_SPECS) {
    const entry = parsed.fields[spec.key]
    if (!entry) continue
    const value = coerce(spec, entry.value)
    if (value === null) continue

    const evidence = typeof entry.evidence === 'string' ? entry.evidence.trim() : ''
    if (spec.evidenceMust && !spec.evidenceMust.test(evidence)) continue
    proposals.push(proposalFrom(spec, value, evidence, page, tier))
  }
  return proposals
}

function proposalFrom(
  spec: FieldSpec,
  value: string | number,
  evidence: string,
  page: { url: string; text: string },
  tier: SourceEvidence['tier'],
): FieldProposal {
  const grounded = evidenceAppears(page.text, evidence)
  return {
    section: spec.section,
    key: spec.key,
    label: spec.label,
    value,
    evidence,
    groundedInPage: grounded,
    // An ungrounded quote is the fabrication signature — never let it claim
    // high confidence, however plausible the value looks.
    confidence: grounded ? (tier <= 2 ? 'high' : 'medium') : 'low',
    source: makeSource(page.url, titleOf(page.text, page.url), evidence, tier),
  }
}

/** First markdown heading or the "Title:" line r.jina.ai emits. */
function titleOf(text: string, url: string): string {
  const t = text.match(/^Title:\s*(.+)$/m)?.[1] ?? text.match(/^#\s+(.+)$/m)?.[1]
  return (t ?? url).trim().slice(0, 120)
}

/**
 * Merge proposals for the same field across pages. The most authoritative tier
 * wins; a grounded quote beats an ungrounded one at the same tier. Genuine
 * disagreements between two official pages are preserved by the caller so the
 * conflict is visible rather than silently resolved (spec §38).
 */
function pickBest(all: FieldProposal[]): FieldProposal[] {
  const byKey = new Map<string, FieldProposal[]>()
  for (const p of all) {
    const list = byKey.get(p.key)
    if (list) list.push(p)
    else byKey.set(p.key, [p])
  }
  const out: FieldProposal[] = []
  for (const list of byKey.values()) {
    list.sort(
      (a, b) =>
        a.source.tier - b.source.tier ||
        Number(b.groundedInPage) - Number(a.groundedInPage) ||
        b.evidence.length - a.evidence.length,
    )
    out.push(list[0])
  }
  return out
}

interface ReadPage {
  url: string
  text: string
  tier: SourceEvidence['tier']
}

const hostOf = (url: string) => {
  try {
    return new URL(url.startsWith('http') ? url : `https://${url}`).hostname
  } catch {
    return url
  }
}

/** A wait that a cancelled run does not sit through. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Read a page, waiting out the reader's rate limit instead of failing on it.
 * One program rarely reaches the limit; a run over every program in the plan
 * does, and losing a page to it would look the same as the page saying nothing.
 */
async function readPatiently(url: string, onProgress?: ProgressFn, signal?: AbortSignal): Promise<PageContent> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await readPage(url, signal)
    } catch (e) {
      if (!(e instanceof RateLimitError) || attempt >= 2) throw e
      onProgress?.('The page reader asked us to slow down — waiting 20 seconds…')
      await pause(20_000, signal)
    }
  }
}

const NO_URL =
  'No official URL to read. Add the program website (and its how-to-apply page) on this program first — research reads real pages rather than recalling anything.'

/**
 * Read the program's own pages and one hop out from them. `prefer` puts links
 * that look like they hold one particular fact ahead of the other candidates.
 */
async function gatherPages(
  input: { university: string; urls: string[] },
  onProgress?: ProgressFn,
  signal?: AbortSignal,
  prefer?: RegExp,
): Promise<{ read: ReadPage[]; pages: PageOutcome[]; warnings: string[] }> {
  const pages: PageOutcome[] = []
  const warnings: string[] = []
  const read: ReadPage[] = []

  const seeds = input.urls.map((u) => u.trim()).filter(Boolean)
  const queue = [...new Set(seeds)]

  for (let i = 0; i < queue.length && read.length < MAX_PAGES; i++) {
    const url = queue[i]
    const tier = classifyTier(url, input.university, 'program')
    onProgress?.(`Reading ${hostOf(url)}…`)
    try {
      const page = await readPatiently(url, onProgress, signal)
      read.push({ url: page.url, text: page.text, tier })
      pages.push({ url: page.url, ok: true, chars: page.text.length, tier })
      // One hop out: follow admissions/funding links found on the seed pages.
      if (i < seeds.length && queue.length < MAX_PAGES + seeds.length) {
        for (const found of discoverProgramUrls(page.text, input.university, queue, 3, prefer)) queue.push(found)
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      const msg = e instanceof Error ? e.message : String(e)
      pages.push({ url, ok: false, chars: 0, error: msg, tier })
      warnings.push(`Couldn’t read ${url}: ${msg}`)
    }
  }
  return { read, pages, warnings }
}

export async function researchProgram(
  input: { university: string; programName: string; cycle: string; urls: string[] },
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<ProgramResearchResult> {
  const sources: SourceEvidence[] = []
  const all: FieldProposal[] = []

  if (!input.urls.some((u) => u.trim())) {
    return { status: 'failed', proposals: [], pages: [], sources: [], warnings: [], error: NO_URL }
  }

  const { read, pages, warnings } = await gatherPages(input, onProgress, signal)

  if (read.length === 0) {
    return { status: 'failed', proposals: [], pages, sources, warnings, error: 'None of the pages could be read.' }
  }

  let llmFailures = 0
  for (const page of read) {
    onProgress?.(`Extracting from ${new URL(page.url).hostname}…`)
    try {
      const props = await extractFromPage(input, page, page.tier, signal)
      all.push(...props)
      if (props.length > 0) sources.push(makeSource(page.url, titleOf(page.text, page.url), '', page.tier))
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      llmFailures++
      const msg = e instanceof LlmError ? e.message : e instanceof Error ? e.message : String(e)
      warnings.push(`Extraction failed for ${page.url}: ${msg}`)
      // Partial results beat failing the whole run (spec §37).
    }
  }

  if (llmFailures === read.length) {
    return { status: 'failed', proposals: [], pages, sources, warnings, error: warnings[warnings.length - 1] ?? 'Extraction failed.' }
  }

  const proposals = pickBest(all)
  const ungrounded = proposals.filter((p) => !p.groundedInPage).length
  if (ungrounded > 0) {
    warnings.push(
      `${ungrounded} value${ungrounded === 1 ? '' : 's'} came back without a quote that matches the page — marked low confidence, verify before trusting.`,
    )
  }

  const status = warnings.length > 0 || pages.some((p) => !p.ok) ? 'partial' : 'complete'
  return { status, proposals, pages, sources, warnings }
}

// ------------------------------------------------- the letters' own deadline ----
//
// One fact, looked up for many programs at once (the Letter Writers page), so
// it gets a run of its own: the same pages, but only the passages about letters
// go to the model, with the one question. A page that never mentions
// recommendations costs no model call at all.

/** A page with any of these is worth asking about. */
const LETTER_PAGE = /recommend|letters?\s+of\s+(?:reference|support|evaluation)|reference\s+letters?|\breferees?\b/i
/** Passages are cut around these. Wider than LETTER_PAGE: the sentence with the
 *  date often says just "letters". */
const LETTER_PASSAGE = /recommend|\bletters?\b|\breferees?\b|reference\s+letters?/gi
/** Links likelier than most to say when letters are due. */
const LETTER_LINKS = /recommend|letter|deadline|faq|frequently|checklist|how[- ]to[- ]apply|requirement|instruction/i

/**
 * The parts of a page that talk about letters, with room either side for the
 * date they refer to. Admissions FAQs run long, and the sentence wanted is as
 * likely to be at the bottom as the top — a plain cut from the start would miss it.
 */
export function letterPassages(text: string, cap = MAX_CHARS_PER_PAGE): string {
  if (!LETTER_PAGE.test(text)) return ''
  const spans: [number, number][] = []
  for (const m of text.matchAll(LETTER_PASSAGE)) {
    const from = Math.max(0, m.index - 600)
    const to = Math.min(text.length, m.index + 900)
    const last = spans[spans.length - 1]
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else spans.push([from, to])
  }
  let out = ''
  for (const [from, to] of spans) {
    const room = cap - out.length
    if (room <= 0) break
    out += (out ? '\n[…]\n' : '') + text.slice(from, to).slice(0, room)
  }
  return out
}

const LETTER_SPEC = FIELD_SPECS.find((f) => f.key === 'letterDeadline')!

const LETTER_SYSTEM =
  'You answer ONE question from excerpts of ONE official web page that has been fetched for you: by when must recommendation ' +
  'letters for this graduate program be received? The excerpts are your ONLY permitted source. You must NOT use anything you ' +
  'remember about this university. Answer only if the page says something about the timing of LETTERS specifically — the ' +
  'application deadline on its own is not an answer. You MUST supply "evidence": a VERBATIM quote copied from the excerpts ' +
  'that states it. If the page does not say, return {} — never guess, never infer, and never work out a date the page does ' +
  'not print. Returning {} is a correct and expected outcome. Respond with ONLY a JSON object.'

function letterPrompt(ctx: { university: string; programName: string; cycle: string }, url: string, passages: string): string {
  return (
    `Program: ${ctx.programName} at ${ctx.university}. Target cycle: ${ctx.cycle}.\n` +
    `Page URL: ${url}\n\n--- PAGE EXCERPTS START ---\n${passages}\n--- PAGE EXCERPTS END ---\n\n` +
    `Does this page say when recommendation letters (letters of reference) are due? It counts only if it is about letters specifically:\n` +
    `  - a date for letters, or for supporting materials that are said to include letters;\n` +
    `  - a grace period (e.g. "recommenders have one week after the deadline");\n` +
    `  - an explicit statement that letters must arrive by the application deadline.\n\n` +
    `If it does, return JSON: {"letterDeadline": {"value": "...", "evidence": "<verbatim quote from the excerpts>"}}\n` +
    `"value": when the page prints a date for letters, START with that date written like "Dec 15, 2026" (give a year only if ` +
    `the page does), then a few words of context if useful. When the page gives only a rule, state the rule in under 15 words, ` +
    `e.g. "Up to 2 weeks after the application deadline" or "By the application deadline — no grace period".\n` +
    `If the page does not say, return {}.`
  )
}

interface RawLetter {
  letterDeadline?: { value?: unknown; evidence?: unknown }
  fields?: { letterDeadline?: { value?: unknown; evidence?: unknown } }
}

/** Ask one already-read page; null when it has nothing to say about it. */
async function letterDeadlineFromPage(
  ctx: { university: string; programName: string; cycle: string },
  page: ReadPage,
  passages: string,
  signal?: AbortSignal,
): Promise<FieldProposal | null> {
  const out = await complete(LETTER_SYSTEM, letterPrompt(ctx, page.url, passages), { signal, maxTokens: 500 })
  const parsed = parseJson<RawLetter>(out)
  // An unreadable reply is not the page saying nothing.
  if (!parsed) throw new LlmError('The model’s reply wasn’t readable JSON.')
  const entry = parsed.letterDeadline ?? parsed.fields?.letterDeadline
  if (!entry) return null
  const value = coerce(LETTER_SPEC, entry.value)
  if (value === null) return null
  const evidence = typeof entry.evidence === 'string' ? entry.evidence.trim() : ''
  // A quote that never mentions letters is the application deadline, relabelled.
  if (!LETTER_WORDS.test(evidence)) return null
  return proposalFrom(LETTER_SPEC, String(value).slice(0, 300), evidence, page, page.tier)
}

/**
 * Look up when a program's recommendation letters are due. Returns at most one
 * proposal (for admissions.letterDeadline). "The pages say nothing about it"
 * is a normal result — status 'complete' with no proposals — and by far the
 * commonest one, since most programs simply use the application deadline.
 */
export async function researchLetterDeadline(
  input: { university: string; programName: string; cycle: string; urls: string[] },
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<ProgramResearchResult> {
  if (!input.urls.some((u) => u.trim())) {
    return { status: 'failed', proposals: [], pages: [], sources: [], warnings: [], error: NO_URL }
  }

  const { read, pages, warnings } = await gatherPages(input, onProgress, signal, LETTER_LINKS)
  if (read.length === 0) {
    // Say which page and why: in a run over many programs this line is all there is.
    return { status: 'failed', proposals: [], pages, sources: [], warnings, error: warnings[0] ?? 'None of the pages could be read.' }
  }

  const found: FieldProposal[] = []
  let asked = 0
  let llmFailures = 0
  for (const page of read) {
    const passages = letterPassages(page.text)
    if (!passages) continue
    asked++
    onProgress?.(`Checking ${hostOf(page.url)} for a letter deadline…`)
    try {
      const proposal = await letterDeadlineFromPage(input, page, passages, signal)
      if (proposal) found.push(proposal)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      llmFailures++
      const msg = e instanceof LlmError ? e.message : e instanceof Error ? e.message : String(e)
      warnings.push(`Couldn’t check ${page.url}: ${msg}`)
    }
  }

  if (asked > 0 && llmFailures === asked) {
    return { status: 'failed', proposals: [], pages, sources: [], warnings, error: warnings[warnings.length - 1] ?? 'The check failed.' }
  }

  const proposals = pickBest(found)
  const status = warnings.length > 0 || pages.some((p) => !p.ok) ? 'partial' : 'complete'
  return { status, proposals, pages, sources: proposals.map((p) => p.source), warnings }
}
