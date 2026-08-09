// Source ranking and candidate-URL discovery.
//
// WHY THERE IS NO SEARCH ENGINE HERE: s.jina.ai (the only CORS-reachable search
// from this static origin) returns 401 without a paid key, and university sites
// send no CORS header so we cannot crawl them directly. But we don't actually
// need search — the reference dataset already stores each program's official
// program and admissions URLs, and r.jina.ai returns markdown whose links let us
// walk from there to the pages that matter. Verified working with no API key.

import type { SourceEvidence } from '../../types'
import { UNIVERSITY_DOMAINS } from '../../../lib/universityDomains'
import { normalizeUrl } from '../../../lib/pageReader'

/** Path fragments that mark a page as being about applying. */
const ADMISSIONS_HINTS = [
  'admission',
  'apply',
  'applying',
  'application',
  'prospective',
  'how-to-apply',
  'requirements',
  'deadline',
  'graduate-program',
  'phd-program',
  'grad',
]

const FUNDING_HINTS = ['funding', 'financial', 'fellowship', 'support', 'tuition', 'stipend', 'assistantship']

/** Pages that are about a person rather than a program. */
const FACULTY_HINTS = ['people', 'faculty', 'profile', 'directory', 'staff', '~', 'research', 'lab', 'group', 'publications']

function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

function pathOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).pathname.toLowerCase()
  } catch {
    return ''
  }
}

/** Domains we know belong to this university, from the shared seed map. */
function domainsFor(university: string): string[] {
  const exact = UNIVERSITY_DOMAINS[university]
  if (exact) return exact
  const key = Object.keys(UNIVERSITY_DOMAINS).find(
    (k) => k.toLowerCase() === university.toLowerCase(),
  )
  return key ? UNIVERSITY_DOMAINS[key] : []
}

export function isOfficialHost(url: string, university: string): boolean {
  const host = hostOf(url)
  if (!host) return false
  const known = domainsFor(university)
  if (known.some((d) => host === d || host.endsWith(`.${d}`))) return true
  // Fall back to academic TLDs — a .edu page about the program is official even
  // when our seed map has never heard of the school.
  return /\.edu$/.test(host) || /\.ac\.[a-z]{2}$/.test(host)
}

/**
 * Rank a source (spec §4). Official program admissions pages outrank everything;
 * anything we cannot tie to the university lands at the bottom, where a
 * conflicting value will lose to an official one.
 */
export function classifyTier(url: string, university: string, kind: 'program' | 'faculty' = 'program'): SourceEvidence['tier'] {
  const official = isOfficialHost(url, university)
  const path = pathOf(url)
  const host = hostOf(url)

  if (!official) {
    // Recognisable scholarly indexes still beat an anonymous blog.
    if (/scholar\.google|semanticscholar|orcid|doi\.org|crossref|openalex|arxiv/.test(host)) return 5
    return 6
  }
  if (kind === 'faculty') {
    if (FACULTY_HINTS.some((h) => path.includes(h))) return 4
    return 4
  }
  const isAdmissions = ADMISSIONS_HINTS.some((h) => path.includes(h))
  const isGradPortal = /^(grad|gradschool|graduate|admissions|apply)\./.test(host)
  if (isAdmissions && !isGradPortal) return 1
  if (isGradPortal) return 2
  return 3
}

export function makeSource(url: string, title: string, snippet: string, tier: SourceEvidence['tier']): SourceEvidence {
  return { url, title, snippet: snippet.slice(0, 400), fetchedAt: new Date().toISOString().slice(0, 10), tier }
}

/** Markdown link extraction — r.jina.ai returns markdown, so links are [text](url). */
function linksIn(markdown: string): { text: string; url: string }[] {
  const out: { text: string; url: string }[] = []
  const re = /\[([^\]]{1,120})\]\((https?:\/\/[^)\s]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown))) out.push({ text: m[1].trim(), url: m[2] })
  return out
}

/**
 * Follow-on pages worth reading, discovered inside a page we already fetched.
 * Restricted to the same institution and to admissions/funding-looking paths —
 * this is a two-hop walk from a known-good URL, not a crawler.
 */
export function discoverProgramUrls(
  markdown: string,
  university: string,
  alreadyHave: string[],
  cap = 3,
): string[] {
  const seen = new Set(alreadyHave.map((u) => u.replace(/[#?].*$/, '').replace(/\/$/, '')))
  const scored: { url: string; score: number }[] = []

  for (const { text, url } of linksIn(markdown)) {
    const clean = url.replace(/[#?].*$/, '').replace(/\/$/, '')
    if (seen.has(clean)) continue
    if (!isOfficialHost(clean, university)) continue
    if (/\.(pdf|jpg|png|gif|zip|docx?)$/i.test(clean)) continue

    const hay = `${text} ${pathOf(clean)}`.toLowerCase()
    let score = 0
    if (ADMISSIONS_HINTS.some((h) => hay.includes(h))) score += 3
    if (FUNDING_HINTS.some((h) => hay.includes(h))) score += 2
    if (/deadline|requirement|gre|toefl/.test(hay)) score += 2
    if (score === 0) continue

    seen.add(clean)
    scored.push({ url: clean, score })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, cap)
    .map((s) => s.url)
}

/** Collapse whitespace so a quote can be matched against page text reliably. */
export function flatten(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Did the model's quoted evidence actually appear in the page?
 *
 * This is the anti-fabrication check. A model asked for a verbatim quote will
 * usually give one, and when it cannot, the "quote" is invented — which is
 * precisely the case where the value must not be presented as sourced fact. We
 * accept a slightly loose match (whitespace-insensitive, and a long quote may be
 * checked by its first clause) because real pages contain soft hyphens and
 * markdown artifacts, but an unmatched quote demotes the proposal.
 */
export function evidenceAppears(pageText: string, evidence: string): boolean {
  if (!evidence || evidence.length < 8) return false
  const hay = flatten(pageText)
  const needle = flatten(evidence)
  if (hay.includes(needle)) return true
  // Long quotes often span reformatted whitespace/ellipses — test the opening clause.
  const head = needle.slice(0, 60)
  return head.length >= 20 && hay.includes(head)
}
