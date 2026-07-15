// Collapse duplicate faculty entries WITHIN a single program.
//   target: frontend/src/data/mock_data.json
//
// These are one person stored twice because merge-faculty.mjs used to slug names
// without folding diacritics: "Éva Tardos" → `va-tardos`, but a later scan that
// spelled her "Eva Tardos" → `eva-tardos`, and the additive union kept both.
// The slug is fixed now; this cleans up what the old one produced.
//
// The surviving entry is the RICHEST one (longest summary), so hand-written bios
// win over scanner one-liners. Tags are unioned and links filled in from the
// dropped twin — no facts are invented or lost.
//
// The survivor's id is RE-SLUGGED with the fixed slugger. That is not cosmetic:
// leaving a mangled id like `b-o-ch-u-ng` in place would let the next scan of
// "Bảo Châu Ngô" produce `bao-chau-ngo` and re-split the person all over again.
// Cost: a star/note keyed to a dropped id is orphaned — acceptable for 38 people
// on a dataset whose ids were already broken.
//
// Idempotent. Run: node tracker/scripts/dedupe-faculty.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const DRY = process.argv.includes('--dry')

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Must stay identical to slug() in merge-faculty.mjs. */
const slug = (s) => norm(s).replace(/ /g, '-')

const dataset = JSON.parse(readFileSync(DATA, 'utf8'))
let collapsed = 0
const report = []

for (const prog of dataset.programs) {
  if (!Array.isArray(prog.faculty) || prog.faculty.length < 2) continue

  const groups = new Map()
  for (const f of prog.faculty) {
    const k = norm(f.name)
    if (!k) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(f)
  }
  if ([...groups.values()].every((g) => g.length === 1)) continue

  const out = []
  for (const [, group] of groups) {
    if (group.length === 1) {
      out.push(group[0])
      continue
    }
    // Richest summary wins; ties break on title length, then id, deterministically.
    const ranked = [...group].sort(
      (a, b) =>
        (b.summary?.length ?? 0) - (a.summary?.length ?? 0) ||
        (b.title?.length ?? 0) - (a.title?.length ?? 0) ||
        String(a.id).localeCompare(String(b.id)),
    )
    const keep = { ...ranked[0] }
    const dropped = ranked.slice(1)

    // Prefer the properly-accented spelling for display.
    for (const d of ranked) if (d.name !== norm(d.name) && /[^\x00-\x7F]/.test(d.name)) keep.name = d.name

    // Union tags (keep's first), fill in links the survivor lacks.
    const seen = new Set()
    const tags = []
    for (const f of ranked)
      for (const t of f.tags ?? []) {
        const k = norm(t)
        if (!k || seen.has(k)) continue
        seen.add(k)
        tags.push(t)
      }
    keep.tags = tags.slice(0, 8)
    keep.links = { ...keep.links }
    for (const f of ranked) {
      if (!keep.links.homepage && f.links?.homepage) keep.links.homepage = f.links.homepage
      if (!keep.links.scholar && f.links?.scholar) keep.links.scholar = f.links.scholar
    }
    // A definite recruitment status beats Unknown/Verify; conflicts keep the survivor's.
    if (keep.recruitment_status === 'Unknown/Verify') {
      const definite = ranked
        .map((f) => f.recruitment_status)
        .filter((s) => s && s !== 'Unknown/Verify')
      if (new Set(definite).size === 1) keep.recruitment_status = definite[0]
    }

    // Re-slug so the next scan matches this entry instead of re-splitting it.
    const wanted = slug(keep.name)
    const takenByOther = prog.faculty.some((f) => f.id === wanted && norm(f.name) !== norm(keep.name))
    if (wanted && !takenByOther) keep.id = wanted
    else if (takenByOther) report.push(`${prog.id}: !! ${keep.name} — id ${wanted} taken, left as ${keep.id}`)

    out.push(keep)
    collapsed += dropped.length
    report.push(
      `${prog.id}: ${keep.name} → ${keep.id} (${keep.summary?.length ?? 0} chars), dropped ${dropped
        .map((d) => d.id)
        .join(', ')}`,
    )
  }
  // Preserve the original ordering of the survivors.
  const rank = new Map(prog.faculty.map((f, i) => [f.id, i]))
  out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
  if (!DRY) prog.faculty = out
}

const total = dataset.programs.reduce((n, p) => n + p.faculty.length, 0)
const withFaculty = dataset.programs.filter((p) => p.faculty.length > 0).length

for (const r of report) console.log('  ' + r)
console.log(`\ncollapsed ${collapsed} duplicate faculty entries across ${report.length} people`)

if (!collapsed) {
  console.log('nothing to do — dataset already clean')
  process.exit(0)
}
if (DRY) {
  console.log('(--dry: no changes written)')
  process.exit(0)
}

dataset.meta.note = `${dataset.programs.length} STEM PhD/MSc programs; faculty rosters on ${withFaculty} programs (${total} faculty). Unknown/Verify = not yet confirmed on an official page.`
writeFileSync(DATA, JSON.stringify(dataset, null, 2))
console.log(`dataset now: ${withFaculty}/${dataset.programs.length} programs with faculty, ${total} faculty total`)
