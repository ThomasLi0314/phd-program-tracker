// Add brand-new program entries to the tracker dataset.
//   source: pipeline/output/new-programs/*.json  (one full Program object each)
//   target: frontend/src/data/mock_data.json
// Idempotent: a program whose id already exists is updated in place (its faculty
// are unioned by id, never dropped), otherwise it is appended.
// Run: node tracker/scripts/add-programs.mjs
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const SRC = join(HERE, '..', 'pipeline', 'output', 'new-programs')

const DEGREES = new Set(['PhD', 'MSc', 'MRes'])
const REGIONS = new Set(['US', 'UK', 'Europe', 'Canada', 'Asia-Pacific'])
const UNKNOWN = 'Unknown/Verify'
const RECRUIT = new Set(['Looking for Students', 'Not Advising', UNKNOWN])

if (!existsSync(SRC)) {
  console.log('no new-programs directory — nothing to do')
  process.exit(0)
}

const dataset = JSON.parse(readFileSync(DATA, 'utf8'))
const byId = new Map(dataset.programs.map((p) => [p.id, p]))
const problems = []
let added = 0
let updated = 0

for (const file of readdirSync(SRC).sort()) {
  if (!file.endsWith('.json') || file.startsWith('_')) continue
  let p
  try {
    p = JSON.parse(readFileSync(join(SRC, file), 'utf8').replace(/^﻿/, ''))
  } catch (e) {
    problems.push(`${file}: unparseable (${e.message})`)
    continue
  }

  // Validate the shape the app relies on.
  const bad = []
  if (!p.id || typeof p.id !== 'string') bad.push('id')
  if (!p.university || !p.program_name) bad.push('university/program_name')
  if (!DEGREES.has(p.degree_type)) bad.push(`degree_type=${p.degree_type}`)
  if (!REGIONS.has(p.region)) bad.push(`region=${p.region}`)
  if (!p.discipline?.primary || !Array.isArray(p.discipline?.subs)) bad.push('discipline')
  if (!p.requirements || !p.requirements.funding) bad.push('requirements')
  if (!p.links?.program) bad.push('links.program')
  if (!Array.isArray(p.faculty)) bad.push('faculty')
  if (bad.length) {
    problems.push(`${file}: invalid → ${bad.join(', ')}`)
    continue
  }

  // Normalize faculty.
  const seen = new Set()
  p.faculty = p.faculty
    .filter((f) => f && typeof f.name === 'string' && f.name.trim())
    .map((f) => {
      let id =
        f.id ||
        f.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
      while (seen.has(id)) id = `${id}-2`
      seen.add(id)
      return {
        id,
        name: f.name.trim(),
        title: typeof f.title === 'string' ? f.title.trim() : '',
        sub_field: (typeof f.sub_field === 'string' && f.sub_field.trim()) || 'Unspecified',
        tags: Array.isArray(f.tags) ? f.tags.filter((t) => typeof t === 'string').slice(0, 10) : [],
        summary: typeof f.summary === 'string' ? f.summary.trim() : '',
        recruitment_status: RECRUIT.has(f.recruitment_status) ? f.recruitment_status : UNKNOWN,
        links: {
          homepage: f.links?.homepage || null,
          scholar: f.links?.scholar || null,
        },
      }
    })

  const existing = byId.get(p.id)
  if (existing) {
    // Additive: union faculty by id, keep the incoming metadata.
    const map = new Map((existing.faculty || []).map((f) => [f.id, f]))
    for (const f of p.faculty) map.set(f.id, f)
    Object.assign(existing, p, { faculty: [...map.values()] })
    updated++
    console.log(`  updated ${p.id} → ${existing.faculty.length} faculty`)
  } else {
    dataset.programs.push(p)
    byId.set(p.id, p)
    added++
    console.log(`  added   ${p.id} → ${p.faculty.length} faculty (${p.university})`)
  }
}

if (added || updated) {
  dataset.meta.generated_at = new Date().toISOString().slice(0, 10)
  writeFileSync(DATA, JSON.stringify(dataset, null, 2))
}

const withFaculty = dataset.programs.filter((p) => (p.faculty || []).length > 0).length
const facultyTotal = dataset.programs.reduce((n, p) => n + (p.faculty || []).length, 0)
console.log(
  `\nadded ${added}, updated ${updated}; dataset now: ${dataset.programs.length} programs, ` +
    `${withFaculty} with faculty, ${facultyTotal} faculty total`,
)
if (problems.length) {
  console.log('\nproblems:')
  for (const p of problems) console.log('  - ' + p)
}
