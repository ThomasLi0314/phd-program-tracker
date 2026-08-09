// Faculty enrichment: research summary, recent directions, and — the field this
// whole layer has to get right — recruiting status.
//
// Spec §12: "Absence of recruiting language MUST NOT imply that the professor is
// recruiting." That rule is enforced structurally here, not left to the prompt:
// a status only survives if the model quoted an explicit statement AND that
// quote is actually found in the fetched page. Everything else becomes unknown.

import { mentionsName, readPage } from '../../../lib/pageReader'
import type { PlannerRecruitmentStatus, SourceEvidence } from '../../types'
import { complete, LlmError, parseJson } from './llm'
import { classifyTier, evidenceAppears, makeSource } from './sources'
import type { FacultyProposal, FacultyResearchResult, PageOutcome, ProgressFn } from './types'

const MAX_PAGES = 3
const MAX_CHARS_PER_PAGE = 14_000

const SYSTEM =
  'You extract facts about ONE academic from the text of a web page that has been fetched for you. ' +
  'The page text is your ONLY permitted source; never use anything you remember about this person. ' +
  'Every reported field needs "evidence": a VERBATIM quote copied from the page. Omit fields the page does not state. ' +
  'Be especially strict about recruiting: only report "actively_recruiting" or "not_recruiting" when the page contains an ' +
  'EXPLICIT statement about taking graduate students (e.g. "I am recruiting PhD students for Fall 2027" or "I am not taking ' +
  'new students"). The mere absence of such a statement means unknown — never infer that someone is recruiting from an active ' +
  'lab, recent papers, or an open positions page that does not mention graduate admissions. Respond with ONLY a JSON object.'

interface RawFaculty {
  mismatch?: boolean
  title?: { value?: string; evidence?: string }
  university?: { value?: string; evidence?: string }
  department?: { value?: string; evidence?: string }
  email?: { value?: string; evidence?: string }
  lab?: { value?: string; evidence?: string }
  scholar?: { value?: string; evidence?: string }
  oneLiner?: { value?: string; evidence?: string }
  detailed?: { value?: string; evidence?: string }
  recentResearch?: { value?: string; evidence?: string }
  themes?: string[]
  recruiting?: { status?: string; explicit?: boolean; evidence?: string }
}

function buildPrompt(ctx: { name: string; university: string; cycle: string }, page: { url: string; text: string }): string {
  return (
    `Target professor: ${ctx.name}${ctx.university ? `, expected at ${ctx.university}` : ''}. Target admission cycle: ${ctx.cycle}.\n` +
    `Page URL: ${page.url}\n\n--- PAGE TEXT START ---\n${page.text.slice(0, MAX_CHARS_PER_PAGE)}\n--- PAGE TEXT END ---\n\n` +
    `Return JSON exactly:\n` +
    `{"mismatch": true|false (true only if the page is clearly about a different person),\n` +
    ` "title": {"value":"exact academic title","evidence":"quote"},\n` +
    ` "university": {"value":"...","evidence":"quote"},\n` +
    ` "department": {"value":"...","evidence":"quote"},\n` +
    ` "email": {"value":"only if publicly printed on the page","evidence":"quote"},\n` +
    ` "lab": {"value":"lab/group URL if it appears in the page","evidence":"quote"},\n` +
    ` "scholar": {"value":"Google Scholar URL if it appears in the page","evidence":"quote"},\n` +
    ` "oneLiner": {"value":"one sentence describing their research, specific enough that it could not describe an arbitrary professor","evidence":"quote"},\n` +
    ` "detailed": {"value":"150-300 words: scientific questions, systems studied, methods, modelling vs observational emphasis, current directions","evidence":"quote"},\n` +
    ` "recentResearch": {"value":"what they have worked on most recently, with years if the page gives them","evidence":"quote"},\n` +
    ` "themes": ["3-8 short research themes taken from the page"],\n` +
    ` "recruiting": {"status":"actively_recruiting|not_recruiting|unknown","explicit":true|false,"evidence":"verbatim quote of the recruiting statement, or empty"}}\n\n` +
    `Omit any key the page does not support.`
  )
}

const clean = (v: unknown, cap = 2000): string =>
  typeof v === 'string' ? v.trim().slice(0, cap) : ''

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s)
}

export async function researchFaculty(
  input: { name: string; university: string; cycle: string; urls: string[] },
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<FacultyResearchResult> {
  const pages: PageOutcome[] = []
  const warnings: string[] = []
  const sources: SourceEvidence[] = []
  const proposals: FacultyProposal[] = []

  const seeds = [...new Set(input.urls.map((u) => u.trim()).filter(Boolean))].slice(0, MAX_PAGES)
  if (seeds.length === 0) {
    return {
      status: 'failed',
      proposals: [],
      pages: [],
      sources: [],
      warnings: [],
      error:
        'No page to read. Add this person’s faculty page or lab site first — research reads real pages rather than recalling anything.',
    }
  }

  const read: { url: string; text: string; tier: SourceEvidence['tier'] }[] = []
  for (const url of seeds) {
    const tier = classifyTier(url, input.university, 'faculty')
    onProgress?.(`Reading ${url.replace(/^https?:\/\//, '').slice(0, 40)}…`)
    try {
      const page = await readPage(url, signal)
      // Same guard the tracker's add-advisor flow uses: a 404 or directory index
      // returns thousands of characters of navigation chrome and would sail past
      // any size check straight into a paid model call.
      if (!mentionsName(page.text, input.name)) {
        pages.push({ url, ok: false, chars: page.text.length, tier, error: 'page never mentions this surname' })
        warnings.push(
          `${url} never mentions “${input.name.trim().split(/\s+/).pop()}” — skipped as the wrong page (a 404 or directory index looks like this).`,
        )
        continue
      }
      read.push({ url: page.url, text: page.text, tier })
      pages.push({ url: page.url, ok: true, chars: page.text.length, tier })
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      const msg = e instanceof Error ? e.message : String(e)
      pages.push({ url, ok: false, chars: 0, error: msg, tier })
      warnings.push(`Couldn’t read ${url}: ${msg}`)
    }
  }

  if (read.length === 0) {
    return { status: 'failed', proposals: [], pages, sources, warnings, error: 'No usable page could be read for this person.' }
  }

  let failures = 0
  for (const page of read) {
    onProgress?.(`Extracting from ${new URL(page.url).hostname}…`)
    let parsed: RawFaculty | null = null
    try {
      parsed = parseJson<RawFaculty>(await complete(SYSTEM, buildPrompt(input, page), { maxTokens: 1600, signal }))
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e
      failures++
      warnings.push(`Extraction failed for ${page.url}: ${e instanceof LlmError ? e.message : String(e)}`)
      continue
    }
    if (!parsed) {
      warnings.push(`Unreadable model output for ${page.url}.`)
      continue
    }
    if (parsed.mismatch === true) {
      warnings.push(`${page.url} appears to be about a different person — ignored.`)
      continue
    }

    const src = (evidence: string) => makeSource(page.url, page.url, evidence, page.tier)
    const push = (
      key: FacultyProposal['key'],
      label: string,
      value: string | string[] | PlannerRecruitmentStatus | null,
      evidence: string,
    ) => {
      if (value === null || (typeof value === 'string' && !value) || (Array.isArray(value) && value.length === 0)) return
      const grounded = evidenceAppears(page.text, evidence)
      proposals.push({
        key,
        label,
        value,
        evidence,
        groundedInPage: grounded,
        confidence: grounded ? (page.tier <= 4 ? 'high' : 'medium') : 'low',
        source: src(evidence),
      })
    }

    push('title', 'Title', clean(parsed.title?.value, 160), clean(parsed.title?.evidence))
    push('university', 'University', clean(parsed.university?.value, 160), clean(parsed.university?.evidence))
    push('department', 'Department', clean(parsed.department?.value, 160), clean(parsed.department?.evidence))
    const email = clean(parsed.email?.value, 160)
    if (email.includes('@')) push('email', 'Email', email, clean(parsed.email?.evidence))
    const lab = clean(parsed.lab?.value, 300)
    if (isUrl(lab)) push('lab', 'Lab site', lab, clean(parsed.lab?.evidence))
    const scholar = clean(parsed.scholar?.value, 300)
    if (isUrl(scholar)) push('scholar', 'Google Scholar', scholar, clean(parsed.scholar?.evidence))
    push('oneLiner', 'One-line summary', clean(parsed.oneLiner?.value, 400), clean(parsed.oneLiner?.evidence))
    push('detailed', 'Detailed summary', clean(parsed.detailed?.value, 2500), clean(parsed.detailed?.evidence))
    push('recentResearch', 'Recent research', clean(parsed.recentResearch?.value, 1500), clean(parsed.recentResearch?.evidence))
    if (Array.isArray(parsed.themes)) {
      const themes = parsed.themes.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim().slice(0, 60)).slice(0, 8)
      // Themes are a summary of the page rather than a single quotable claim, so
      // they carry the page as their source without an evidence quote.
      if (themes.length) {
        proposals.push({
          key: 'themes',
          label: 'Research themes',
          value: themes,
          evidence: '',
          groundedInPage: true,
          confidence: page.tier <= 4 ? 'medium' : 'low',
          source: src(''),
        })
      }
    }

    // ---- recruiting: the strict one ----
    const rawStatus = clean(parsed.recruiting?.status, 40)
    const rEvidence = clean(parsed.recruiting?.evidence, 600)
    const explicit = parsed.recruiting?.explicit === true
    if (rawStatus === 'actively_recruiting' || rawStatus === 'not_recruiting') {
      const grounded = evidenceAppears(page.text, rEvidence)
      if (explicit && grounded) {
        proposals.push({
          key: 'recruiting',
          label: 'Recruiting status',
          value: rawStatus as PlannerRecruitmentStatus,
          evidence: rEvidence,
          groundedInPage: true,
          confidence: page.tier <= 4 ? 'high' : 'medium',
          source: src(rEvidence),
        })
      } else {
        // A claimed status whose quote isn't on the page is exactly the failure
        // mode §12 warns about. Downgrade to an explicitly-labelled inference
        // rather than dropping it silently — the user can still see it was
        // considered, and why it isn't trusted.
        proposals.push({
          key: 'recruiting',
          label: 'Recruiting status (inferred — no explicit statement found)',
          value: 'possibly_recruiting',
          evidence: rEvidence,
          groundedInPage: false,
          confidence: 'low',
          source: src(rEvidence),
        })
        warnings.push(
          `Recruiting status on ${page.url} was reported as "${rawStatus}" but no explicit statement was found in the page — recorded as a low-confidence inference, not a fact.`,
        )
      }
    }

    if (proposals.some((p) => p.source.url === page.url)) {
      sources.push(makeSource(page.url, page.url, '', page.tier))
    }
  }

  if (failures === read.length) {
    return { status: 'failed', proposals: [], pages, sources, warnings, error: warnings[warnings.length - 1] ?? 'Extraction failed.' }
  }

  // Best proposal per key: authoritative tier first, then grounded.
  const byKey = new Map<string, FacultyProposal>()
  for (const p of proposals) {
    const cur = byKey.get(p.key)
    if (
      !cur ||
      p.source.tier < cur.source.tier ||
      (p.source.tier === cur.source.tier && Number(p.groundedInPage) > Number(cur.groundedInPage))
    ) {
      byKey.set(p.key, p)
    }
  }

  const status = warnings.length > 0 || pages.some((p) => !p.ok) ? 'partial' : 'complete'
  return { status, proposals: [...byKey.values()], pages, sources, warnings }
}
