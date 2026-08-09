// Collapse duplicate PROGRAM entries — the same program added twice under
// different ids (e.g. "Applied and Computational Mathematics" vs
// "Applied and Computational Mathematics (PhD)").
//
// This happens when a new-programs scan invents an id that doesn't match the id
// an earlier sweep already used. A name-substring check does NOT catch it:
// searching for "applied math" misses "Applied AND COMPUTATIONAL Mathematics",
// which is how three duplicates got in.
//
// MERGE RULES (deliberately field-level, not "newest wins"):
//   - The SURVIVING id is the older/pre-existing one, because the user's stars,
//     notes, My List and outreach records are all keyed by program id and would
//     be orphaned if it disappeared.
//   - Each requirement field: a KNOWN value beats "Unknown/Verify"; when both
//     are known the more recently scanned entry wins. Neither of these is safe
//     alone — the newer scan of UT Austin lost the application fee, while the
//     older scan of Caltech still had a prior-cycle deadline and a stale GRE.
//   - Faculty are UNIONED by id, keeping the richer record per person.
//   - data_currency records both scans so the provenance isn't quietly dropped.
//
// Run: node tracker/scripts/dedupe-programs.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const DRY = process.argv.includes('--dry')
const UNKNOWN = 'Unknown/Verify'

/** Explicit pairs: [survivingId, mergedAwayId]. Kept explicit rather than
 *  fuzzy-matched, so this script can never silently fuse two real programs. */
const PAIRS = [
  ['princeton-pacm-phd', 'princeton-university-applied-and-computational-mathematics'],
  [
    'california-institute-of-technology-applied-and-computational-mathematics',
    'caltech-applied-and-computational-mathematics',
  ],
  [
    'university-of-texas-at-austin-computational-science-engineering-and-mathematics-',
    'ut-austin-computational-science-engineering-and-mathematics',
  ],
]

/**
 * Is this a real value?
 *
 * A field is often written as "Unknown/Verify (fee not published on the
 * department page)" — the explanation makes it a long string, but it still
 * means UNKNOWN. Testing only for equality with the bare marker let one of
 * those beat a real "$65 (US) / $90 (international)" from the other entry, so
 * anything STARTING with the marker counts as unknown. A mid-string mention
 * ("no IELTS minimum is published (Unknown/Verify)") is genuinely informative
 * and is kept.
 */
const known = (v) =>
  v !== null && v !== undefined && v !== '' && !(typeof v === 'string' && v.trimStart().startsWith(UNKNOWN))

/** Scan date from data_currency, for deciding which known value is fresher. */
function scanDate(p) {
  const m = (p.data_currency || '').match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : '0000-00-00'
}

/** Known beats unknown; when both known the fresher scan wins. */
function pick(survivor, other, get) {
  const a = get(survivor)
  const b = get(other)
  if (known(a) && known(b)) return scanDate(other) > scanDate(survivor) ? b : a
  if (known(b)) return b
  return a
}

/** Richer faculty record wins, then fill any gap the winner has. */
function betterFaculty(a, b) {
  const win = (b.summary?.length ?? 0) > (a.summary?.length ?? 0) ? b : a
  const lose = win === a ? b : a
  const tags = [...new Set([...(win.tags ?? []), ...(lose.tags ?? [])])].slice(0, 10)
  return {
    ...win,
    title: win.title || lose.title || '',
    sub_field: win.sub_field && win.sub_field !== 'Unspecified' ? win.sub_field : lose.sub_field,
    tags,
    links: {
      homepage: win.links?.homepage || lose.links?.homepage || null,
      scholar: win.links?.scholar || lose.links?.scholar || null,
    },
    // A definite status beats Unknown/Verify; conflicting definite statuses keep
    // the winner's rather than inventing a resolution.
    recruitment_status: known(win.recruitment_status) ? win.recruitment_status : lose.recruitment_status,
  }
}

const dataset = JSON.parse(readFileSync(DATA, 'utf8'))
const byId = new Map(dataset.programs.map((p) => [p.id, p]))
const dropped = new Set()
let merged = 0

for (const [keepId, dropId] of PAIRS) {
  const keep = byId.get(keepId)
  const drop = byId.get(dropId)
  if (!keep || !drop) {
    console.log(`  skip ${keepId} ← ${dropId} (${!keep ? 'survivor' : 'duplicate'} not found — already merged?)`)
    continue
  }

  const r = keep.requirements
  const o = drop.requirements
  const nextReq = { ...r }
  for (const k of [
    'deadline',
    'deadline_display',
    'application_fee_usd',
    'fee_display',
    'gre',
    'letters',
    'english',
    'admission_model',
    'admission_model_note',
    'pre_application_contact',
    'contact_note',
    'ects',
    'duration',
  ]) {
    nextReq[k] = pick(keep, drop, (p) => (p === keep ? r : o)[k])
  }
  nextReq.funding = {
    status: pick(keep, drop, (p) => (p === keep ? r : o).funding.status),
    years: pick(keep, drop, (p) => (p === keep ? r : o).funding.years),
    note: pick(keep, drop, (p) => (p === keep ? r : o).funding.note),
  }

  const facultyById = new Map(keep.faculty.map((f) => [f.id, f]))
  for (const f of drop.faculty) {
    const existing = facultyById.get(f.id)
    facultyById.set(f.id, existing ? betterFaculty(existing, f) : f)
  }

  const before = keep.faculty.length
  keep.requirements = nextReq
  keep.faculty = [...facultyById.values()]
  keep.links = {
    program: keep.links.program || drop.links.program || '',
    ...(keep.links.admissions || drop.links.admissions
      ? { admissions: keep.links.admissions || drop.links.admissions }
      : {}),
  }
  keep.data_currency = `${keep.data_currency} | Merged with duplicate entry "${drop.program_name}" (${dropId}): ${drop.data_currency}`

  dropped.add(dropId)
  merged++
  console.log(`  merged ${dropId}`)
  console.log(`      → ${keepId}: ${before} + ${drop.faculty.length} → ${keep.faculty.length} faculty`)
  console.log(`        deadline: ${String(nextReq.deadline_display).slice(0, 50)}`)
  console.log(`        gre: ${nextReq.gre} | fee: ${String(nextReq.fee_display).slice(0, 30)} | funding: ${nextReq.funding.status}`)
}

if (merged && !DRY) {
  dataset.programs = dataset.programs.filter((p) => !dropped.has(p.id))
  dataset.meta.generated_at = new Date().toISOString().slice(0, 10)
  writeFileSync(DATA, JSON.stringify(dataset, null, 2))
}

const remaining = dataset.programs.filter((p) => !dropped.has(p.id))
const withFaculty = remaining.filter((p) => (p.faculty || []).length > 0).length
const facultyTotal = remaining.reduce((n, p) => n + (p.faculty || []).length, 0)
console.log(
  `\n${DRY ? '[dry] ' : ''}merged ${merged} duplicate program${merged === 1 ? '' : 's'}; ` +
    `dataset now: ${remaining.length} programs, ${withFaculty} with faculty, ${facultyTotal} faculty total`,
)
