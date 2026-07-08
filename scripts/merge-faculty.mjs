// Merge faculty-scan staging files into the tracker dataset.
//   staging: pipeline/output/faculty-scan/<program-id>.json
//   target:  frontend/src/data/mock_data.json
// Idempotent: re-running re-applies staging files. Curated programs that
// already had faculty BEFORE the scan are protected via the worklist's
// has_faculty flag. Run: node tracker/scripts/merge-faculty.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const STAGING = join(HERE, '..', 'pipeline', 'output', 'faculty-scan')

const UNKNOWN = 'Unknown/Verify'
const RECRUIT = new Set(['Looking for Students', 'Not Advising', UNKNOWN])
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const dataset = JSON.parse(readFileSync(DATA, 'utf8'))
const byId = new Map(dataset.programs.map((p) => [p.id, p]))
const worklist = JSON.parse(readFileSync(join(STAGING, '_worklist.json'), 'utf8'))
const curated = new Set(
  worklist.tasks.flatMap((t) => t.programs.filter((p) => p.has_faculty).map((p) => p.id)),
)

const clip = (v, n, fallback = '') => (typeof v === 'string' ? v.slice(0, n).trim() : fallback)

let merged = 0
let facultyTotal = 0
const problems = []

for (const file of readdirSync(STAGING).sort()) {
  if (!file.endsWith('.json') || file.startsWith('_')) continue
  let doc
  try {
    doc = JSON.parse(readFileSync(join(STAGING, file), 'utf8').replace(/^﻿/, ''))
  } catch (e) {
    problems.push(`${file}: unparseable (${e.message})`)
    continue
  }
  const prog = byId.get(doc.program_id)
  if (!prog) {
    problems.push(`${file}: unknown program_id ${doc.program_id}`)
    continue
  }
  if (curated.has(prog.id)) {
    problems.push(`${file}: skipped — curated program, faculty protected`)
    continue
  }
  if (!Array.isArray(doc.faculty)) {
    problems.push(`${file}: no faculty array`)
    continue
  }

  const seen = new Set()
  const faculty = []
  for (const f of doc.faculty) {
    const name = clip(f.name, 120)
    if (!name) continue
    const id = slug(name)
    if (seen.has(id)) continue
    seen.add(id)
    faculty.push({
      id,
      name,
      title: clip(f.title, 160, UNKNOWN) || UNKNOWN,
      sub_field: clip(f.sub_field, 120, UNKNOWN) || UNKNOWN,
      tags: (Array.isArray(f.tags) ? f.tags : []).map((t) => clip(t, 60)).filter(Boolean).slice(0, 6),
      summary: clip(f.summary, 500),
      recruitment_status: RECRUIT.has(f.recruitment_status) ? f.recruitment_status : UNKNOWN,
      links: {
        homepage: typeof f.links?.homepage === 'string' ? f.links.homepage : null,
        scholar: typeof f.links?.scholar === 'string' ? f.links.scholar : null,
      },
    })
  }
  prog.faculty = faculty
  if (typeof doc.scanned_at === 'string' && doc.scanned_at) {
    prog.data_currency = `${prog.data_currency.split(' · faculty ')[0]} · faculty ${doc.scanned_at}`
  }
  merged++
  facultyTotal += faculty.length
}

const totalWithFaculty = dataset.programs.filter((p) => p.faculty.length > 0).length
const totalFaculty = dataset.programs.reduce((n, p) => n + p.faculty.length, 0)
dataset.meta.note = `${dataset.programs.length} STEM PhD/MSc programs; faculty rosters on ${totalWithFaculty} programs (${totalFaculty} faculty). Unknown/Verify = not yet confirmed on an official page.`
writeFileSync(DATA, JSON.stringify(dataset, null, 2))

console.log(`merged ${merged} staging files → ${facultyTotal} faculty`)
console.log(`dataset now: ${totalWithFaculty}/${dataset.programs.length} programs with faculty, ${totalFaculty} faculty total`)
if (problems.length) {
  console.log(`\n${problems.length} problems:`)
  for (const p of problems) console.log('  - ' + p)
}
