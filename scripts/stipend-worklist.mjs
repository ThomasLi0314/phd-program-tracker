// Build the stipend-scan worklist: programs grouped by institution, then packed
// into agent-sized tasks. Progress is derived from staging files (one per
// institution in pipeline/output/stipend-scan/), never from a status field.
//
// Run: node tracker/scripts/stipend-worklist.mjs [maxProgramsPerTask=40]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const OUT = join(HERE, '..', 'pipeline', 'output', 'stipend-scan')
const MAX = Number(process.argv[2] ?? 40)

// Spellings of one institution that the dataset carries separately.
const ALIAS = {
  Caltech: 'California Institute of Technology',
  'ETH Zürich': 'ETH Zürich (Swiss Federal Institute of Technology Zurich)',
  'New York University (Courant)': 'New York University',
  'New York University — Courant Institute': 'New York University',
  'MIT–WHOI Joint Program': 'Massachusetts Institute of Technology',
}
export const institution = (u) => ALIAS[u] ?? u
export const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const { programs } = JSON.parse(readFileSync(DATA, 'utf8'))
const byInst = new Map()
for (const p of programs) {
  const key = institution(p.university)
  if (!byInst.has(key)) byInst.set(key, [])
  byInst.get(key).push({
    id: p.id,
    name: p.program_name,
    degree: p.degree_type,
    country: p.country,
    link: p.links?.program ?? '',
    funding: p.requirements?.funding?.note ?? '',
  })
}

// Largest first; small institutions are packed together up to MAX programs.
const insts = [...byInst.entries()].sort((a, b) => b[1].length - a[1].length)
const tasks = []
for (const [name, list] of insts) {
  const open = tasks.find((t) => t.count + list.length <= MAX)
  const entry = { institution: name, file: `${slug(name)}.json`, programs: list }
  if (open) {
    open.institutions.push(entry)
    open.count += list.length
  } else tasks.push({ institutions: [entry], count: list.length })
}
tasks.forEach((t, i) => (t.task = i + 1))

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, '_worklist.json'), JSON.stringify(tasks, null, 1))
const done = (t) => t.institutions.every((i) => existsSync(join(OUT, i.file)))
console.log(`${programs.length} programs · ${byInst.size} institutions · ${tasks.length} tasks (max ${MAX})`)
for (const t of tasks)
  console.log(
    `${String(t.task).padStart(2)} ${done(t) ? 'DONE' : '    '} ${String(t.count).padStart(3)}  ${t.institutions.map((i) => `${i.institution} (${i.programs.length})`).join('; ')}`,
  )
