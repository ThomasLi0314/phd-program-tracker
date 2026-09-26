// Assemble frontend/public/data/rankings.json from the per-field research in
// pipeline/output/rankings/*.json.
//
// One published ranking per field, with its source recorded, and a position for
// each of our universities that the source actually lists. A university the
// source does not list is simply absent — the app then says "unranked", which
// is the honest reading; nothing is interpolated.
//
// Run: node tracker/scripts/build-rankings.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const IN = join(HERE, '..', 'pipeline', 'output', 'rankings')
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const OUT = join(HERE, '..', 'frontend', 'public', 'data', 'rankings.json')

/** Spellings the dataset uses for a university the rankings know by another. */
const ALIASES = {
  Caltech: 'California Institute of Technology',
  'New York University (Courant)': 'New York University',
  'New York University — Courant Institute': 'New York University',
  'MIT–WHOI Joint Program': 'Massachusetts Institute of Technology',
}

if (!existsSync(IN)) {
  console.log(`no ${IN} — nothing to build`)
  process.exit(0)
}

const { programs } = JSON.parse(readFileSync(DATA, 'utf8'))
const ourUniversities = new Set(programs.map((p) => ALIASES[p.university] ?? p.university))
const ourFields = new Set(programs.map((p) => p.discipline.primary))

const fields = {}
const problems = []
let positions = 0

for (const file of readdirSync(IN).sort()) {
  if (!file.endsWith('.json') || file.startsWith('_')) continue
  const j = JSON.parse(readFileSync(join(IN, file), 'utf8'))
  if (!j.field || !j.source) {
    problems.push(`${file}: missing field or source`)
    continue
  }
  if (!ourFields.has(j.field)) problems.push(`${file}: "${j.field}" is not a field in the dataset`)
  const ranks = {}
  for (const r of j.ranks ?? []) {
    const uni = ALIASES[r.university] ?? r.university
    if (!ourUniversities.has(uni)) {
      problems.push(`${file}: "${r.university}" is not one of our universities — skipped`)
      continue
    }
    if (typeof r.rank !== 'number' || !(r.rank > 0)) {
      problems.push(`${file}: ${r.university} has no usable rank — skipped`)
      continue
    }
    if (ranks[uni] && ranks[uni].rank <= r.rank) continue // keep the better of a duplicate
    ranks[uni] = {
      rank: r.rank,
      world_rank: typeof r.world_rank === 'number' ? r.world_rank : null,
      as_printed: String(r.as_printed ?? '').slice(0, 20) || null,
    }
    positions++
  }
  fields[j.field] = {
    source: {
      name: String(j.source.name ?? '').slice(0, 160),
      edition: String(j.source.edition ?? '').slice(0, 20),
      url: j.source.url ?? '',
      scope: String(j.source.scope ?? '').slice(0, 60),
      note: String(j.source.note ?? '').slice(0, 900),
    },
    checked_at: j.checked_at ?? null,
    ranks,
  }
}

const missing = [...ourFields].filter((f) => !fields[f])

writeFileSync(
  OUT,
  JSON.stringify(
    {
      meta: {
        generated_at: new Date().toISOString().slice(0, 10),
        note:
          "One published subject ranking per field, as the source published it. \"rank\" is the position among US institutions in that ranking; a university the ranking does not list is absent here and reads as unranked in the app. Rankings are the rankers' own work — each field names its source, edition and URL.",
      },
      aliases: ALIASES,
      fields,
    },
    null,
    1,
  ),
)

console.log(`${Object.keys(fields).length} fields · ${positions} university positions`)
for (const [name, f] of Object.entries(fields))
  console.log(`  ${String(Object.keys(f.ranks).length).padStart(3)}  ${name} — ${f.source.name} (${f.source.edition})`)
if (missing.length) console.log(`\nno ranking for: ${missing.join(', ')}`)
if (problems.length) {
  console.log(`\n${problems.length} notes:`)
  for (const p of problems.slice(0, 20)) console.log('  - ' + p)
}
