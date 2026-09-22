// Assemble frontend/public/data/housing.json from the two research outputs:
//   pipeline/output/housing/us.json             (scripts/housing-us.mjs — HUD + Zillow)
//   pipeline/output/housing/international.json  (researched city by city)
// plus the map from every university name in the dataset to its place. A
// university with no place is reported, never silently given someone else's.
//
// Run: node tracker/scripts/build-housing.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const IN = join(HERE, '..', 'pipeline', 'output', 'housing')
const DATA = join(HERE, '..', 'frontend', 'src', 'data', 'mock_data.json')
const OUT = join(HERE, '..', 'frontend', 'public', 'data', 'housing.json')

const us = JSON.parse(readFileSync(join(IN, 'us.json'), 'utf8'))
const intlPath = join(IN, 'international.json')
const intl = existsSync(intlPath) ? JSON.parse(readFileSync(intlPath, 'utf8')) : { cities: [] }

// Spellings the dataset uses for an institution housing.us.json knows by
// another name, and the non-US universities' cities.
const ALIAS = {
  Caltech: 'California Institute of Technology',
  'New York University (Courant)': 'New York University',
  'New York University — Courant Institute': 'New York University',
  // Joint Program students start at MIT; many later live in Woods Hole.
  'MIT–WHOI Joint Program': 'Massachusetts Institute of Technology',
}
const INTL = {
  'National University of Singapore': 'singapore-sg',
  'Nanyang Technological University': 'singapore-sg',
  'The Chinese University of Hong Kong': 'hong-kong-hk',
  'The University of Hong Kong': 'hong-kong-hk',
  'HKUST (Hong Kong University of Science and Technology)': 'hong-kong-hk',
  'ETH Zürich': 'zurich-ch',
  'ETH Zürich (Swiss Federal Institute of Technology Zurich)': 'zurich-ch',
  'École polytechnique fédérale de Lausanne': 'lausanne-ch',
  'University of Oxford': 'oxford-uk',
  'University of Cambridge': 'cambridge-uk',
  'Imperial College London': 'london-uk',
  'University College London': 'london-uk',
  'University of Toronto': 'toronto-ca',
  'University of British Columbia': 'vancouver-ca',
  'Utrecht University': 'utrecht-nl',
  'University of Tübingen': 'tubingen-de',
  'University of Bonn': 'bonn-de',
}

const places = []
const institutions = {}
const byInst = new Map(us.cities.map((c) => [c.institution, c]))
for (const c of us.cities) {
  places.push({
    id: c.id,
    city: c.city,
    country: c.country,
    currency: c.currency,
    average: c.average,
    measure: 'Monthly rent — mean of HUD 1-bedroom Fair Market Rents (county and campus ZIP) and the Zillow city rent index',
    sources: c.sources,
  })
}
for (const c of intl.cities ?? []) {
  places.push({
    id: c.id,
    city: c.city,
    country: c.country,
    currency: c.currency,
    average: c.average ?? null,
    measure: 'Monthly rent of a one-bedroom apartment — mean of the published figures listed',
    sources: (c.sources ?? []).map((s) => ({
      label: s.label,
      value: s.value,
      period: s.period,
      url: s.url,
      note: [s.note, s.quote ? `“${s.quote}”` : ''].filter(Boolean).join(' '),
    })),
    note: c.note || undefined,
  })
}
const placeIds = new Set(places.map((p) => p.id))

const { programs } = JSON.parse(readFileSync(DATA, 'utf8'))
const missing = new Map()
for (const p of programs) {
  const u = p.university
  if (institutions[u]) continue
  const usHit = byInst.get(ALIAS[u] ?? u)
  const id = usHit ? usHit.id : INTL[u]
  if (id && placeIds.has(id)) institutions[u] = id
  else missing.set(u, (missing.get(u) ?? 0) + 1)
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      meta: {
        generated_at: new Date().toISOString().slice(0, 10),
        note:
          'Average monthly rent near each university. US: mean of HUD FY2026 1-bedroom Fair Market Rents (county, and the residential ZIP next to campus) and the Zillow Observed Rent Index for the city. Elsewhere: mean of published one-bedroom rents (official statistics first). Each figure links to its source.',
      },
      places,
      institutions,
    },
    null,
    1,
  ),
)
console.log(`${places.length} places · ${Object.keys(institutions).length} universities mapped`)
if (missing.size) {
  console.log('NO PLACE for:')
  for (const [u, n] of missing) console.log(`  - ${u} (${n} programs)`)
}
