// Sub-field labels arrive from twenty scans that never agreed on a house style:
// "Applied Math", "Applied Mathematics" and "Applied mathematics" are three
// checkboxes for one idea, and "Atmospheric Science" / "Atmospheric Sciences"
// sit next to each other in the sidebar as if they were different fields.
//
// This module folds those into one group each. The canonical KEY is what
// filters store and compare; the LABEL shown is the fullest spelling among the
// variants. The dataset itself is never rewritten — a program keeps whatever
// string its scan produced, and matching happens on the key.

const ABBREVIATIONS: Record<string, string> = {
  math: 'mathematics',
  maths: 'mathematics',
  stat: 'statistics',
  stats: 'statistics',
  cs: 'computer science',
  ml: 'machine learning',
  ai: 'artificial intelligence',
  gfd: 'geophysical fluid dynamics',
  pde: 'partial differential equations',
  pdes: 'partial differential equations',
  ode: 'ordinary differential equations',
  odes: 'ordinary differential equations',
  hpc: 'high performance computing',
  eng: 'engineering',
  engr: 'engineering',
  comp: 'computational',
  env: 'environmental',
  sci: 'science',
  ee: 'electrical engineering',
  ece: 'electrical and computer engineering',
  mech: 'mechanical',
  bio: 'biology',
  geo: 'geoscience',
  nlp: 'natural language processing',
  cv: 'computer vision',
  hci: 'human computer interaction',
  or: 'operations research',
  cfd: 'computational fluid dynamics',
  fem: 'finite element methods',
  mri: 'magnetic resonance imaging',
}

const STOPWORDS = new Set(['of', 'the', 'and', 'in', 'for', 'on', 'with', 'to', 'a', 'an', 'its', 'via'])

function singular(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('ss') || word.endsWith('us') || word.endsWith('is')) return word
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

const cache = new Map<string, string>()

/**
 * Canonical key for a sub-field label. Lower-cased, abbreviations expanded,
 * stopwords dropped, words singularised and SORTED — so "Computational
 * Applied Mathematics" and "Applied and Computational Mathematics" meet in the
 * middle, as do "Applied Math" and "Applied Mathematics".
 */
export function canonicalSub(label: string): string {
  const hit = cache.get(label)
  if (hit !== undefined) return hit
  const words = label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((w) => (ABBREVIATIONS[w] ?? w).split(' '))
    .filter((w) => !STOPWORDS.has(w))
    .map(singular)
    .sort()
  const key = words.join(' ')
  cache.set(label, key)
  return key
}

export interface SubGroup {
  /** canonical key — what a filter stores */
  key: string
  /** the spelling shown to the user */
  label: string
  /** every raw spelling that folds into this group */
  variants: string[]
}

/**
 * The fullest spelling wins the label: more characters, then more capitals,
 * so "Applied Mathematics" beats both "Applied Math" and "Applied mathematics".
 */
export function pickLabel(variants: string[]): string {
  const score = (s: string) => s.length * 2 + (s.match(/[A-Z]/g)?.length ?? 0) * 3
  return [...variants].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0] ?? ''
}

/** Fold a list of raw labels into groups, sorted by display label. */
export function groupSubs(labels: Iterable<string>): SubGroup[] {
  const byKey = new Map<string, string[]>()
  for (const raw of labels) {
    const key = canonicalSub(raw)
    if (!key) continue
    const list = byKey.get(key)
    if (list) {
      if (!list.includes(raw)) list.push(raw)
    } else byKey.set(key, [raw])
  }
  return [...byKey.entries()]
    .map(([key, variants]) => ({ key, label: pickLabel(variants), variants }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Group arbitrary items by the canonical key of a label they carry. Used for
 * the faculty roster (grouped by sub-field) and for tag counts, where the same
 * case-drift would otherwise split one topic into three headings.
 */
export function groupByCanonical<T>(
  items: T[],
  labelOf: (item: T) => string,
): { key: string; label: string; items: T[] }[] {
  const groups = new Map<string, { variants: string[]; items: T[] }>()
  for (const item of items) {
    const raw = labelOf(item)
    const key = canonicalSub(raw) || raw
    const g = groups.get(key)
    if (g) {
      g.items.push(item)
      if (!g.variants.includes(raw)) g.variants.push(raw)
    } else groups.set(key, { variants: [raw], items: [item] })
  }
  return [...groups.entries()].map(([key, g]) => ({ key, label: pickLabel(g.variants), items: g.items }))
}
