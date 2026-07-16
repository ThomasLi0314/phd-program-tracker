// Merge advisors a user added in the browser into the shared dataset.
//   input:  a request bundle from the app (⚠️ Backup → "Copy request"), saved to
//           pipeline/output/advisor-requests/*.json
//   target: frontend/src/data/mock_data.json
//
// The bundle is a REQUEST, not a source of truth: every card was extracted by a
// model from one page. This script therefore only does the mechanical part —
// validation, slugging, additive merge. It deliberately does NOT accept a
// recruitment_status (the dataset sets that only from an explicit official
// statement) and it refuses any entry without a source_url, so a human/agent can
// re-open the source and check the claim before it ships.
//
// Verify the sources FIRST, then run. Idempotent; never overwrites a dataset
// entry (an existing id is left alone and reported).
//
// Run: node tracker/scripts/add-requested-advisors.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const SRC = join(HERE, '..', 'pipeline', 'output', 'advisor-requests')
const DRY = process.argv.includes('--dry')
const UNKNOWN = 'Unknown/Verify'

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

if (!existsSync(SRC)) {
  console.log(`no ${SRC} directory — nothing to do`)
  process.exit(0)
}

const dataset = JSON.parse(readFileSync(DATA, 'utf8'))
const byId = new Map(dataset.programs.map((p) => [p.id, p]))
const problems = []
let added = 0
let skipped = 0

for (const file of readdirSync(SRC).sort()) {
  if (!file.endsWith('.json') || file.startsWith('_')) continue
  let bundle
  try {
    bundle = JSON.parse(readFileSync(join(SRC, file), 'utf8').replace(/^﻿/, ''))
  } catch (e) {
    problems.push(`${file}: unparseable (${e.message})`)
    continue
  }
  if (bundle.kind !== 'advisor-requests' || !Array.isArray(bundle.requests)) {
    problems.push(`${file}: not an advisor-requests bundle`)
    continue
  }

  for (const r of bundle.requests) {
    const where = `${file}: ${r.name ?? '(no name)'}`
    if (!r.name || !r.programId) {
      problems.push(`${where}: missing name/programId`)
      continue
    }
    // A card with no source can't be checked, so it can't ship.
    if (!/^https?:\/\//i.test(r.source_url ?? '')) {
      problems.push(`${where}: no source_url — refusing (add it via "Fetch & fill")`)
      continue
    }
    const prog = byId.get(r.programId)
    if (!prog) {
      problems.push(`${where}: unknown program_id ${r.programId}`)
      continue
    }

    const id = slug(r.name)
    if (!id) {
      problems.push(`${where}: name does not slug`)
      continue
    }
    if ((prog.faculty ?? []).some((f) => f.id === id)) {
      skipped++
      problems.push(`${where}: already on ${prog.id} — left untouched`)
      continue
    }

    const entry = {
      id,
      name: String(r.name).trim(),
      title: String(r.title ?? '').trim() || UNKNOWN,
      sub_field: String(r.sub_field ?? '').trim() || UNKNOWN,
      tags: (Array.isArray(r.tags) ? r.tags : [])
        .filter((t) => typeof t === 'string' && t.trim())
        .map((t) => t.trim().slice(0, 60))
        .slice(0, 6),
      summary: String(r.summary ?? '').trim().slice(0, 500),
      // Never taken from the request — see the header.
      recruitment_status: UNKNOWN,
      links: {
        homepage: /^https?:\/\//i.test(r.homepage ?? '') ? r.homepage : r.source_url,
        scholar: /^https?:\/\//i.test(r.scholar ?? '') ? r.scholar : null,
      },
    }

    prog.faculty = [...(prog.faculty ?? []), entry]
    added++
    console.log(`  + ${prog.university} / ${prog.program_name}: ${entry.name}`)
    console.log(`      source: ${r.source_url}${r.fetched_at ? ` (read ${r.fetched_at})` : ''}`)
  }

  if (Array.isArray(bundle.unsourced) && bundle.unsourced.length) {
    for (const u of bundle.unsourced) problems.push(`${file}: ${u.name} has no source page — not merged`)
  }
}

const withFaculty = dataset.programs.filter((p) => (p.faculty ?? []).length > 0).length
const facultyTotal = dataset.programs.reduce((n, p) => n + (p.faculty ?? []).length, 0)

console.log(`\nadded ${added}, skipped ${skipped} (already present)`)
if (problems.length) {
  console.log(`\n${problems.length} notes:`)
  for (const p of problems) console.log('  - ' + p)
}
if (!added) {
  console.log('\nnothing merged')
  process.exit(0)
}
if (DRY) {
  console.log('\n(--dry: no changes written)')
  process.exit(0)
}

dataset.meta.note = `${dataset.programs.length} STEM PhD/MSc programs; faculty rosters on ${withFaculty} programs (${facultyTotal} faculty). Unknown/Verify = not yet confirmed on an official page.`
writeFileSync(DATA, JSON.stringify(dataset, null, 2))
console.log(
  `dataset now: ${withFaculty}/${dataset.programs.length} programs with faculty, ${facultyTotal} faculty total`,
)
