// Program enrichment: read the official pages, extract admissions facts, attach
// evidence, and propose them for review.
//
// Nothing here writes to the planner. It returns proposals; reviewQueue decides
// what may be applied and the user makes the call (spec §20).

import { readPage } from '../../../lib/pageReader'
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
}

export const FIELD_SPECS: FieldSpec[] = [
  { key: 'deadline', section: 'admissions', label: 'Deadline', ask: 'the application deadline, including the year if stated' },
  { key: 'gre', section: 'admissions', label: 'GRE', ask: 'GRE policy', enum: ['Required', 'Optional', 'Not Accepted'] },
  { key: 'english', section: 'admissions', label: 'English requirement', ask: 'English proficiency requirement (TOEFL/IELTS), with minimum scores if stated' },
  { key: 'applicationFee', section: 'admissions', label: 'Application fee', ask: 'the application fee amount' },
  { key: 'feeWaiver', section: 'admissions', label: 'Fee waiver', ask: 'fee waiver availability' },
  { key: 'letters', section: 'admissions', label: 'Recommendation letters', ask: 'how many recommendation letters are required', numeric: true },
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
    const grounded = evidenceAppears(page.text, evidence)

    proposals.push({
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
    })
  }
  return proposals
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

export async function researchProgram(
  input: { university: string; programName: string; cycle: string; urls: string[] },
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<ProgramResearchResult> {
  const pages: PageOutcome[] = []
  const warnings: string[] = []
  const sources: SourceEvidence[] = []
  const all: FieldProposal[] = []

  const seeds = input.urls.map((u) => u.trim()).filter(Boolean)
  if (seeds.length === 0) {
    return {
      status: 'failed',
      proposals: [],
      pages: [],
      sources: [],
      warnings: [],
      error:
        'No official URL to read. Add the program website (and its how-to-apply page) on this program first — research reads real pages rather than recalling anything.',
    }
  }

  const queue = [...new Set(seeds)]
  const read: { url: string; text: string; tier: SourceEvidence['tier'] }[] = []

  for (let i = 0; i < queue.length && read.length < MAX_PAGES; i++) {
    const url = queue[i]
    const tier = classifyTier(url, input.university, 'program')
    onProgress?.(`Reading ${new URL(url.startsWith('http') ? url : `https://${url}`).hostname}…`)
    try {
      const page = await readPage(url, signal)
      read.push({ url: page.url, text: page.text, tier })
      pages.push({ url: page.url, ok: true, chars: page.text.length, tier })
      // One hop out: follow admissions/funding links found on the seed pages.
      if (i < seeds.length && queue.length < MAX_PAGES + seeds.length) {
        for (const found of discoverProgramUrls(page.text, input.university, queue)) queue.push(found)
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      const msg = e instanceof Error ? e.message : String(e)
      pages.push({ url, ok: false, chars: 0, error: msg, tier })
      warnings.push(`Couldn’t read ${url}: ${msg}`)
    }
  }

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
