// US rents per university, averaged from three published figures:
//   1. HUD FY2026 Fair Market Rent, 1-bedroom, for the campus county (or New
//      England town)               — FY26_FMRs_revised.xlsx
//   2. HUD FY2026 Small Area FMR, 1-bedroom, for the ZIP next to campus
//                                  — fy2026_safmrs_revised.xlsx
//   3. Zillow Observed Rent Index for the city, latest month (all homes,
//      smoothed)                   — City_zori_uc_sfrcondomfr_sm_month.csv
// "average" is the plain mean of whichever of the three exist. Nothing is
// filled in when a source has no row for the place — the component is simply
// absent and the gap is reported.
//
// Inputs are downloaded to DIR first (see the commit that added this script).
// Run: node tracker/scripts/housing-us.mjs <dir-with-downloads>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const HERE = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(HERE, '..', 'frontend', 'package.json'))
const ExcelJS = require('exceljs')
const DIR = process.argv[2] ?? 'D:/tmp-claude/housing'
const OUT = join(HERE, '..', 'pipeline', 'output', 'housing')

// institution → where its students rent. zips: the residential ZIP next to
// campus (first one HUD has a Small Area FMR for is used). Campus-only ZIPs
// are deliberately NOT used: their rents are mostly university-owned housing,
// which put e.g. Ohio State's 43210 at $870 against $1,194 for the county. hud: county name, or `town` for New England,
// where HUD sets FMRs by town. zillow: city name as Zillow lists it.
const PLACES = [
  ['University of Wisconsin-Madison', 'Madison, WI', 'WI', ['53715', '53703'], { county: 'Dane County' }, 'Madison'],
  ['University of Georgia', 'Athens, GA', 'GA', ['30605', '30606'], { county: 'Clarke County' }, 'Athens'],
  ['The Ohio State University', 'Columbus, OH', 'OH', ['43201'], { county: 'Franklin County' }, 'Columbus'],
  ['University of Washington', 'Seattle, WA', 'WA', ['98105'], { county: 'King County' }, 'Seattle'],
  ['University of California, Davis', 'Davis, CA', 'CA', ['95616'], { county: 'Yolo County' }, 'Davis'],
  ['University of Michigan, Ann Arbor', 'Ann Arbor, MI', 'MI', ['48104'], { county: 'Washtenaw County' }, 'Ann Arbor'],
  ['University of Illinois Urbana-Champaign', 'Champaign–Urbana, IL', 'IL', ['61820', '61801'], { county: 'Champaign County' }, 'Champaign'],
  ['Stanford University', 'Stanford / Palo Alto, CA', 'CA', ['94306', '94301'], { county: 'Santa Clara County' }, 'Palo Alto'],
  ['Johns Hopkins University', 'Baltimore, MD', 'MD', ['21218'], { county: 'Baltimore city' }, 'Baltimore'],
  ['University of California, Los Angeles', 'Los Angeles (Westwood), CA', 'CA', ['90024'], { county: 'Los Angeles County' }, 'Los Angeles'],
  ['University of California, Berkeley', 'Berkeley, CA', 'CA', ['94704'], { county: 'Alameda County' }, 'Berkeley'],
  ['Cornell University', 'Ithaca, NY', 'NY', ['14850'], { county: 'Tompkins County' }, 'Ithaca'],
  ['University of Florida', 'Gainesville, FL', 'FL', ['32603', '32601'], { county: 'Alachua County' }, 'Gainesville'],
  ['Duke University', 'Durham, NC', 'NC', ['27705'], { county: 'Durham County' }, 'Durham'],
  ['California Institute of Technology', 'Pasadena, CA', 'CA', ['91106'], { county: 'Los Angeles County' }, 'Pasadena'],
  ['Harvard University', 'Cambridge, MA', 'MA', ['02138'], { town: 'Cambridge' }, 'Cambridge'],
  ['University of Maryland, College Park', 'College Park, MD', 'MD', ['20740'], { county: "Prince George's County" }, 'College Park'],
  ['Georgia Institute of Technology', 'Atlanta (Midtown), GA', 'GA', ['30318', '30313'], { county: 'Fulton County' }, 'Atlanta'],
  ['Purdue University', 'West Lafayette, IN', 'IN', ['47906'], { county: 'Tippecanoe County' }, 'West Lafayette'],
  ['Vanderbilt University', 'Nashville, TN', 'TN', ['37212'], { county: 'Davidson County' }, 'Nashville'],
  ['University of Chicago', 'Chicago (Hyde Park), IL', 'IL', ['60637'], { county: 'Cook County' }, 'Chicago'],
  ['University of Southern California', 'Los Angeles (University Park), CA', 'CA', ['90007'], { county: 'Los Angeles County' }, 'Los Angeles'],
  ['Yale University', 'New Haven, CT', 'CT', ['06511'], { town: 'New Haven' }, 'New Haven'],
  ['Rutgers University-New Brunswick', 'New Brunswick, NJ', 'NJ', ['08901'], { county: 'Middlesex County' }, 'New Brunswick'],
  ['University of Texas at Austin', 'Austin, TX', 'TX', ['78705'], { county: 'Travis County' }, 'Austin'],
  ['Carnegie Mellon University', 'Pittsburgh, PA', 'PA', ['15213'], { county: 'Allegheny County' }, 'Pittsburgh'],
  ['Boston University', 'Boston, MA', 'MA', ['02215'], { town: 'Boston' }, 'Boston'],
  ['Columbia University', 'New York (Morningside Heights), NY', 'NY', ['10027'], { county: 'New York County' }, 'New York'],
  ['University of North Carolina at Chapel Hill', 'Chapel Hill, NC', 'NC', ['27514', '27516'], { county: 'Orange County' }, 'Chapel Hill'],
  ['University of Virginia', 'Charlottesville, VA', 'VA', ['22903'], { county: 'Charlottesville city' }, 'Charlottesville'],
  ['Washington University in St. Louis', 'St. Louis, MO', 'MO', ['63130'], { county: 'St. Louis County' }, 'Saint Louis'],
  ['University of Rochester', 'Rochester, NY', 'NY', ['14620'], { county: 'Monroe County' }, 'Rochester'],
  ['Northwestern University', 'Evanston, IL', 'IL', ['60201'], { county: 'Cook County' }, 'Evanston'],
  ['Tufts University', 'Medford / Somerville, MA', 'MA', ['02155', '02144'], { town: 'Medford' }, 'Medford'],
  ['University of California, Irvine', 'Irvine, CA', 'CA', ['92612', '92617'], { county: 'Orange County' }, 'Irvine'],
  ['University of California, San Diego', 'San Diego (La Jolla), CA', 'CA', ['92122', '92037'], { county: 'San Diego County' }, 'San Diego'],
  ['Princeton University', 'Princeton, NJ', 'NJ', ['08540'], { county: 'Mercer County' }, 'Princeton'],
  ['Massachusetts Institute of Technology', 'Cambridge, MA', 'MA', ['02139'], { town: 'Cambridge' }, 'Cambridge'],
  ['Northeastern University', 'Boston, MA', 'MA', ['02115'], { town: 'Boston' }, 'Boston'],
  ['University of Pennsylvania', 'Philadelphia, PA', 'PA', ['19104'], { county: 'Philadelphia County' }, 'Philadelphia'],
  ['University of California, Santa Barbara', 'Santa Barbara / Goleta, CA', 'CA', ['93117'], { county: 'Santa Barbara County' }, 'Goleta'],
  ['Rice University', 'Houston, TX', 'TX', ['77005'], { county: 'Harris County' }, 'Houston'],
  ['Emory University', 'Atlanta (Druid Hills), GA', 'GA', ['30307'], { county: 'DeKalb County' }, 'Atlanta'],
  ['Lehigh University', 'Bethlehem, PA', 'PA', ['18015'], { county: 'Northampton County' }, 'Bethlehem'],
  ['New York University', 'New York (Greenwich Village), NY', 'NY', ['10012', '10003'], { county: 'New York County' }, 'New York'],
  ['Brown University', 'Providence, RI', 'RI', ['02906'], { town: 'Providence' }, 'Providence'],
  ['University of Notre Dame', 'Notre Dame / South Bend, IN', 'IN', ['46617'], { county: 'St. Joseph County' }, 'South Bend'],
  ['Dartmouth College', 'Hanover, NH', 'NH', ['03755'], { town: 'Hanover' }, 'Hanover'],
  ['Georgetown University', 'Washington, DC', 'DC', ['20007'], { county: 'District of Columbia' }, 'Washington'],
  ['Boston College', 'Chestnut Hill / Newton, MA', 'MA', ['02467'], { town: 'Newton' }, 'Newton'],
  ['University of Colorado Boulder', 'Boulder, CO', 'CO', ['80302', '80303'], { county: 'Boulder County' }, 'Boulder'],
  ['Oregon State University', 'Corvallis, OR', 'OR', ['97330', '97333'], { county: 'Benton County' }, 'Corvallis'],
  ['University of Minnesota', 'Minneapolis, MN', 'MN', ['55414'], { county: 'Hennepin County' }, 'Minneapolis'],
  ['Pennsylvania State University', 'State College, PA', 'PA', ['16801'], { county: 'Centre County' }, 'State College'],
]

const HUD_FMR_URL = 'https://www.huduser.gov/portal/datasets/fmr/fmr2026/FY26_FMRs_revised.xlsx'
const HUD_SAFMR_URL = 'https://www.huduser.gov/portal/datasets/fmr/fmr2026/fy2026_safmrs_revised.xlsx'
const ZILLOW_URL = 'https://www.zillow.com/research/data/'

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
const cellText = (v) => (v && typeof v === 'object' && 'result' in v ? v.result : v)

async function sheetRows(file) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(join(DIR, file))
  const ws = wb.worksheets[0]
  const rows = []
  ws.eachRow((r, i) => {
    if (i > 1) rows.push(r.values.slice(1).map(cellText))
  })
  return rows
}

// --- HUD county/town FMR ---
// cols: stusps state hud_area_code countyname county_town_name metro hud_area_name fips pop2023 fmr_0 fmr_1 …
const fmr = await sheetRows('FY26_FMRs_revised.xlsx')
function hudFmr(state, hud) {
  const rows = fmr.filter((r) => r[0] === state)
  const hit = hud.town
    ? rows.find((r) => String(r[4] ?? '').toLowerCase().startsWith(hud.town.toLowerCase()))
    : rows.find((r) => String(r[3] ?? '').toLowerCase() === hud.county.toLowerCase())
  if (!hit) return null
  return { value: Number(hit[10]), area: hit[6], place: hud.town ? `${hit[4]}` : hit[3] }
}

// --- HUD Small Area FMR (ZIP) ---
// cols: ZIP, HUD Area Code, HUD FMR Area Name, 0BR, 0BR90, 0BR110, 1BR, …
const safmr = new Map((await sheetRows('fy2026_safmrs_revised.xlsx')).map((r) => [String(r[0]).padStart(5, '0'), r]))

// --- Zillow ZORI city ---
const zLines = readFileSync(join(DIR, 'zori_city.csv'), 'utf8').trim().split(/\r?\n/)
const parseCsv = (line) => {
  const out = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}
const zHead = parseCsv(zLines[0])
const zRows = zLines.slice(1).map(parseCsv)
const iName = zHead.indexOf('RegionName')
const iState = zHead.indexOf('State')
function zillow(city, state) {
  const row = zRows.find((r) => r[iName] === city && r[iState] === state)
  if (!row) return null
  // latest month with a value
  for (let i = zHead.length - 1; i > iState; i--) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(zHead[i]) && row[i]) return { value: Math.round(Number(row[i])), month: zHead[i].slice(0, 7) }
  }
  return null
}

const cities = []
const gaps = []
for (const [inst, label, state, zips, hud, zCity] of PLACES) {
  const sources = []
  const f = hudFmr(state, hud)
  if (f)
    sources.push({
      label: `HUD FY2026 Fair Market Rent, 1-bedroom — ${f.place} (${f.area})`,
      value: f.value,
      period: 'FY2026 (Oct 2025 – Sep 2026)',
      url: HUD_FMR_URL,
      note: 'Gross rent (rent + utilities) at the 40th percentile of recent movers; set for the whole HUD area.',
    })
  else gaps.push(`${inst}: no HUD FMR row for ${JSON.stringify(hud)} ${state}`)

  const zip = zips.find((z) => safmr.has(z))
  if (zip) {
    const r = safmr.get(zip)
    sources.push({
      label: `HUD FY2026 Small Area FMR, 1-bedroom — ZIP ${zip}`,
      value: Number(r[6]),
      period: 'FY2026 (Oct 2025 – Sep 2026)',
      url: HUD_SAFMR_URL,
      note: 'ZIP-level version of the same HUD measure, for the residential ZIP next to campus.',
    })
  } else gaps.push(`${inst}: no Small Area FMR for ${zips.join('/')}`)

  const z = zillow(zCity, state)
  if (z)
    sources.push({
      label: `Zillow Observed Rent Index — ${zCity}, ${state}`,
      value: z.value,
      period: z.month,
      url: ZILLOW_URL,
      note: 'Typical asking rent across all rental homes (35th–65th percentile), smoothed; not bedroom-specific.',
    })
  else gaps.push(`${inst}: no Zillow city row for ${zCity}, ${state}`)

  const average = sources.length ? Math.round(sources.reduce((n, s) => n + s.value, 0) / sources.length) : null
  cities.push({ id: slug(inst), institution: inst, city: label, country: 'United States', currency: 'USD', average, sources })
}

mkdirSync(OUT, { recursive: true })
writeFileSync(
  join(OUT, 'us.json'),
  JSON.stringify({ checked_at: '2026-09-22', measure: 'Monthly rent', cities }, null, 1),
)
for (const c of cities)
  console.log(`${String(c.average).padStart(5)}  ${c.city.padEnd(36)} ${c.sources.map((s) => s.value).join(' / ')}`)
console.log(`\n${gaps.length} gaps:`)
for (const g of gaps) console.log('  - ' + g)
