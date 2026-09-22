// Merge the stipend scan into the dataset as requirements.funding.stipend.
//   input:  pipeline/output/stipend-scan/<institution>.json   (research agents)
//           pipeline/output/stipend-scan/_verify.json         (verify-stipends.mjs)
//           pipeline/output/stipend-scan/_manual.json         (optional; see below)
//   target: frontend/src/data/mock_data.json
//
// A figure ships only when its number was found on its own source page by
// verify-stipends.mjs, or when a person re-read the page and listed the claim
// in _manual.json as { "<program_id>": "confirmed" | "reject" }. Anything else
// is held back and reported — never merged on the agent's word alone.
// Programs checked with no official figure get { amount: null, note }, so the
// app can say "checked, none published" instead of looking unchecked.
//
// Idempotent: re-running replaces each program's stipend with the current scan.
// Run: node tracker/scripts/merge-stipends.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const DIR = join(HERE, '..', 'pipeline', 'output', 'stipend-scan')
const DRY = process.argv.includes('--dry')

const CURRENCIES = new Set(['USD', 'GBP', 'EUR', 'CHF', 'CAD', 'SGD', 'HKD'])
const PERIODS = new Set(['12-month', '9-month', 'monthly', 'other'])
const SCOPES = new Set(['program', 'school-standard', 'university-minimum'])

const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()
const claim = (e) => `${e.source}|${e.amount}|${norm(e.quote ?? '').slice(0, 80)}`
const read = (f, fallback) => (existsSync(join(DIR, f)) ? JSON.parse(readFileSync(join(DIR, f), 'utf8')) : fallback)

const verify = read('_verify.json', {})
const manual = read('_manual.json', {})
const dataset = JSON.parse(readFileSync(DATA, 'utf8'))
const byId = new Map(dataset.programs.map((p) => [p.id, p]))

const problems = []
const held = []
const counts = { figure: 0, none: 0, program: 0, 'school-standard': 0, 'university-minimum': 0 }
const seen = new Set()

for (const f of readdirSync(DIR).sort()) {
  if (!f.endsWith('.json') || f.startsWith('_')) continue
  const scan = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
  for (const e of scan.programs ?? []) {
    const where = `${f}: ${e.program_id}`
    const prog = byId.get(e.program_id)
    if (!prog) {
      problems.push(`${where}: unknown program_id`)
      continue
    }
    if (seen.has(e.program_id)) {
      problems.push(`${where}: listed twice — first entry kept`)
      continue
    }
    seen.add(e.program_id)
    const checked_at = scan.checked_at ?? null

    if (e.amount == null) {
      prog.requirements.funding.stipend = {
        amount: null,
        note: String(e.note || 'Not found on official pages').slice(0, 300),
        checked_at,
      }
      counts.none++
      continue
    }

    const bad = []
    if (typeof e.amount !== 'number' || !(e.amount > 0)) bad.push('amount not a positive number')
    if (!CURRENCIES.has(e.currency)) bad.push(`currency ${e.currency}`)
    if (!PERIODS.has(e.period)) bad.push(`period ${e.period}`)
    if (!SCOPES.has(e.scope)) bad.push(`scope ${e.scope}`)
    if (!/^https?:\/\//.test(e.source ?? '')) bad.push('no source URL')
    if (!String(e.quote ?? '').trim()) bad.push('no quote')
    if (bad.length) {
      problems.push(`${where}: ${bad.join(', ')} — not merged`)
      continue
    }

    const v = verify[claim(e)]
    // _manual.json: "confirmed" | "reject" | { decision, period } for a figure a
    // person re-read on its page (e.g. a site that refuses scripted fetches).
    const decision = manual[e.program_id]
    const verdict = typeof decision === 'object' && decision ? decision.decision : decision
    if (verdict === 'reject') {
      problems.push(`${where}: rejected in _manual.json — not merged`)
      continue
    }
    const confirmed = v?.amount_on_page === true || verdict === 'confirmed'
    if (!confirmed) {
      held.push(`${where}: ${e.currency} ${e.amount} ${e.period} — ${v ? `not found on page [HTTP ${v.code}]` : 'not verified yet'} ${e.source}`)
      continue
    }

    // The scan's "other" is refined from the quote, never multiplied out:
    //  - "$11,000/quarter", "each term is $14,596" → quarterly / semester / term.
    //    Only a unit right next to the number counts: "no less than $5,000 per
    //    quarter for an annual package of $20,000" must not make the $20,000
    //    quarterly.
    //  - a figure the page gives "per year" / "annual" without saying 9 or 12
    //    months → annual (a year's pay, so it can be set against a year's rent).
    // _manual.json may set the period outright.
    const amountRe = Number(e.amount)
      .toLocaleString('en-US', { maximumFractionDigits: 2 })
      .replace(/[.,]/g, '[.,]?')
    const q = e.quote ?? ''
    const near = (unit) =>
      new RegExp(`${amountRe}0*(\\.\\d+)?\\s*(/|per|a|each|every)\\s*${unit}`, 'i').test(q) ||
      new RegExp(`(per|each|every|a)\\s+${unit}\\W{0,3}(is|of|:|=)?\\s*\\S{0,4}${amountRe}(?![0-9])`, 'i').test(q)
    // "for 2026-27, the stipend is $36,500" is a year's figure too.
    const yearly =
      /\b(per year|a year|each year|annual|annually|yearly|per annum|\/\s*yr|academic[- ]year|fiscal year|program year|(9\.5|10|11|12|13|nine|ten|eleven|twelve)[- ]months?|20\d\d\s*[–-]\s*(20)?\d\d)\b/i
    const override = typeof decision === 'object' ? decision.period : undefined
    const period =
      override ??
      (e.period !== 'other'
        ? e.period
        : near('quarter')
          ? 'quarterly'
          : near('semester')
            ? 'semester'
            : near('term')
              ? 'term'
              : yearly.test(`${q} ${e.note ?? ''}`)
                ? 'annual'
                : 'other')
    prog.requirements.funding.stipend = {
      amount: e.amount,
      currency: e.currency,
      period,
      academic_year: e.academic_year ?? null,
      scope: e.scope,
      source: e.source,
      quote: String(e.quote).trim().slice(0, 600),
      note: String(e.note ?? '').trim().slice(0, 400),
      checked_at,
    }
    counts.figure++
    counts[e.scope]++
  }
}

const unscanned = dataset.programs.filter((p) => !seen.has(p.id)).length
console.log(
  `figures merged: ${counts.figure} (program ${counts.program}, school-standard ${counts['school-standard']}, university-minimum ${counts['university-minimum']})`,
)
console.log(`checked, none published: ${counts.none} · held back: ${held.length} · not scanned yet: ${unscanned}`)
if (held.length) {
  console.log('\nHELD (confirm by re-reading the page, then list in _manual.json):')
  for (const h of held) console.log('  - ' + h)
}
if (problems.length) {
  console.log('\nPROBLEMS:')
  for (const p of problems) console.log('  - ' + p)
}
if (!DRY) writeFileSync(DATA, JSON.stringify(dataset, null, 2))
else console.log('\n(--dry: nothing written)')
