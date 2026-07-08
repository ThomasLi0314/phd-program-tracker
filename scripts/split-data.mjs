// Split frontend/src/data/mock_data.json into per-field chunks for the
// published (lazy-loading) site:
//   frontend/public/data/index.json          — meta + field list (small, loaded on start)
//   frontend/public/data/fields/<slug>.json  — programs of one discipline primary
// Run from anywhere: node tracker/scripts/split-data.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const OUT_DIR = join(HERE, '..', 'frontend', 'public', 'data')
const FIELDS_DIR = join(OUT_DIR, 'fields')

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const dataset = JSON.parse(readFileSync(SRC, 'utf8'))
const byPrimary = new Map()
for (const p of dataset.programs) {
  const key = p.discipline.primary
  if (!byPrimary.has(key)) byPrimary.set(key, [])
  byPrimary.get(key).push(p)
}

rmSync(FIELDS_DIR, { recursive: true, force: true })
mkdirSync(FIELDS_DIR, { recursive: true })

const slugs = new Set()
const fields = []
for (const [primary, programs] of byPrimary) {
  let slug = slugify(primary)
  while (slugs.has(slug)) slug += '-2'
  slugs.add(slug)

  const subs = [...new Set(programs.flatMap((p) => p.discipline.subs))].sort()
  fields.push({ primary, slug, count: programs.length, subs })
  writeFileSync(join(FIELDS_DIR, `${slug}.json`), JSON.stringify({ primary, programs }, null, 2))
}
fields.sort((a, b) => b.count - a.count || a.primary.localeCompare(b.primary))

const DEGREE_ORDER = ['PhD', 'MSc', 'MRes']
const REGION_ORDER = ['US', 'UK', 'Europe', 'Canada', 'Asia-Pacific']
const degreesPresent = new Set(dataset.programs.map((p) => p.degree_type))
const regionsPresent = new Set(dataset.programs.map((p) => p.region))
const fees = dataset.programs
  .map((p) => p.requirements.application_fee_usd)
  .filter((f) => f !== null)
const maxFee = fees.length ? Math.max(...fees) : 0

const index = {
  meta: dataset.meta,
  total: dataset.programs.length,
  fields,
  degrees: DEGREE_ORDER.filter((d) => degreesPresent.has(d)),
  regions: REGION_ORDER.filter((r) => regionsPresent.has(r)),
  feeCap: Math.max(25, Math.ceil(maxFee / 25) * 25),
}
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2))

console.log(`index.json: ${dataset.programs.length} programs across ${fields.length} fields`)
for (const f of fields) console.log(`  ${f.slug}.json — ${f.primary} (${f.count})`)
