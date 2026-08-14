// Expand scripts/europe-source.mjs into frontend/public/data/europe.json.
//
// The source file is written university-first because that is how the facts
// actually arrive: one fees page, one scholarship page and one language
// requirement cover every programme in the building, while the programme page
// only adds a name, a length and a deadline. Repeating the shared facts by hand
// on each row would be both enormous and a good way to let them drift apart.
//
// Run: node tracker/scripts/build-europe.mjs
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COUNTRIES, UNIVERSITIES, META } from './europe-source.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'frontend', 'public', 'data', 'europe.json')

const VALID_FIELDS = new Set([
  'Mathematics',
  'Applied Mathematics',
  'Computational Science',
  'Atmosphere & Ocean',
  'Physics',
  'Applied Physics',
  'Computer Science',
  'Engineering',
])
const VALID_LEVELS = new Set(['full', 'partial', 'none', 'unknown'])

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const problems = []
const programs = []
const ids = new Set()

for (const uni of UNIVERSITIES) {
  if (!COUNTRIES.some((c) => c.country === uni.country)) {
    problems.push(`${uni.name}: country "${uni.country}" has no policy card`)
  }
  for (const p of uni.programs) {
    const id = `${slug(uni.name)}-${slug(p.name)}`
    if (ids.has(id)) problems.push(`duplicate id ${id}`)
    ids.add(id)

    for (const f of p.fields) {
      if (!VALID_FIELDS.has(f)) problems.push(`${id}: unknown field "${f}"`)
    }

    // University-level facts fall through to every programme; a programme may
    // override any of them when its own page says something different.
    const scholarship = p.scholarship ?? uni.scholarship
    if (!VALID_LEVELS.has(scholarship?.level)) {
      problems.push(`${id}: bad scholarship level "${scholarship?.level}"`)
    }
    if (!p.link) problems.push(`${id}: no programme link`)

    programs.push({
      id,
      university: uni.name,
      city: p.city ?? uni.city,
      country: uni.country,
      program_name: p.name,
      degree: p.degree ?? 'MSc',
      fields: p.fields,
      language: p.language ?? uni.language ?? { value: null },
      duration: p.duration ?? { value: null },
      ...(p.tuition ?? uni.tuition ? { tuition: p.tuition ?? uni.tuition } : {}),
      scholarship,
      english: p.english ?? uni.english ?? { value: null },
      deadline: p.deadline ?? uni.deadline ?? { value: null },
      phd: p.phd ?? uni.phd ?? { value: null },
      links: {
        program: p.link,
        ...(p.admissions ?? uni.admissions ? { admissions: p.admissions ?? uni.admissions } : {}),
        ...(p.tuitionLink ?? uni.tuitionLink ? { tuition: p.tuitionLink ?? uni.tuitionLink } : {}),
      },
      checked_at: p.checked_at ?? uni.checked_at,
    })
  }
}

if (problems.length) {
  console.error('Refusing to write — source problems:')
  for (const p of problems) console.error(`  · ${p}`)
  process.exit(1)
}

programs.sort(
  (a, b) =>
    a.country.localeCompare(b.country) ||
    a.university.localeCompare(b.university) ||
    a.program_name.localeCompare(b.program_name),
)

const used = new Set(programs.map((p) => p.country))
const countries = COUNTRIES.filter((c) => used.has(c.country)).sort((a, b) =>
  a.country.localeCompare(b.country),
)
for (const c of COUNTRIES) {
  if (!used.has(c.country)) console.warn(`note: ${c.country} policy card has no programmes yet`)
}

writeFileSync(OUT, JSON.stringify({ meta: META, countries, programs }, null, 2))

const byCountry = new Map()
for (const p of programs) byCountry.set(p.country, (byCountry.get(p.country) ?? 0) + 1)
const byField = new Map()
for (const p of programs) for (const f of p.fields) byField.set(f, (byField.get(f) ?? 0) + 1)

console.log(`europe.json: ${programs.length} programmes · ${countries.length} countries`)
for (const [c, n] of [...byCountry].sort((a, b) => b[1] - a[1])) console.log(`  ${c}: ${n}`)
console.log('fields:')
for (const [f, n] of [...byField].sort((a, b) => b[1] - a[1])) console.log(`  ${f}: ${n}`)
const unknownTuition = programs.filter((p) => !p.tuition?.non_eu?.value).length
console.log(`programmes falling back to the national tuition rule: ${unknownTuition}`)
