// Verify every URL in europe.json actually resolves.
//
// A programme row whose link 404s is worse than no row at all: it looks like a
// checked fact. University URL schemes are not guessable — TU Delft's own
// obvious-looking programme path returns 404 — so nothing here is inferred from
// a pattern without being fetched.
//
// Run: node tracker/scripts/check-europe-links.mjs [--fix-report]
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA = join(HERE, '..', 'frontend', 'public', 'data', 'europe.json')
const REPORT = join(HERE, '..', 'pipeline', 'output', 'europe-link-report.json')

const data = JSON.parse(readFileSync(DATA, 'utf8'))

/** url -> [{ where }] so one fetch covers every row that cites it. */
const targets = new Map()
const note = (url, where) => {
  if (!url || !/^https?:\/\//.test(url)) return
  if (!targets.has(url)) targets.set(url, [])
  targets.get(url).push(where)
}

for (const c of data.countries) {
  note(c.tuition?.eu?.source, `country ${c.country} · tuition.eu`)
  note(c.tuition?.non_eu?.source, `country ${c.country} · tuition.non_eu`)
  note(c.scholarships?.source, `country ${c.country} · scholarships`)
  note(c.living_cost?.source, `country ${c.country} · living_cost`)
}
for (const p of data.programs) {
  note(p.links?.program, `${p.id} · links.program`)
  note(p.links?.admissions, `${p.id} · links.admissions`)
  note(p.links?.tuition, `${p.id} · links.tuition`)
  for (const key of ['language', 'duration', 'scholarship', 'english', 'deadline', 'phd']) {
    note(p[key]?.source, `${p.id} · ${key}`)
  }
  note(p.phd?.url, `${p.id} · phd.url`)
  note(p.tuition?.eu?.source, `${p.id} · tuition.eu`)
  note(p.tuition?.non_eu?.source, `${p.id} · tuition.non_eu`)
}

const urls = [...targets.keys()]
console.log(`checking ${urls.length} distinct URLs across ${data.programs.length} programmes…`)

// Some university sites reject HEAD outright but serve GET fine, so a failed
// HEAD is retried as a GET before it counts against the URL.
async function check(url) {
  const opts = {
    redirect: 'follow',
    headers: {
      // A bare fetch UA gets 403'd by several .ac.uk and .fr hosts.
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
      accept: 'text/html,application/xhtml+xml',
    },
  }
  for (const method of ['HEAD', 'GET']) {
    try {
      const ctl = AbortSignal.timeout(20_000)
      const res = await fetch(url, { ...opts, method, signal: ctl })
      if (res.ok) return { ok: true, status: res.status, finalUrl: res.url }
      if (method === 'GET') return { ok: false, status: res.status, finalUrl: res.url }
    } catch (err) {
      if (method === 'GET') return { ok: false, status: 0, error: String(err?.message ?? err) }
    }
  }
  return { ok: false, status: 0, error: 'unreachable' }
}

const LIMIT = 8
const results = []
let cursor = 0
await Promise.all(
  Array.from({ length: LIMIT }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++]
      const r = await check(url)
      results.push({ url, ...r, where: targets.get(url) })
      process.stdout.write(r.ok ? '.' : 'X')
    }
  }),
)
process.stdout.write('\n')

// A 403/405/429 is a bot filter, not a dead page — several university sites
// (ox.ac.uk among them) refuse scripted requests but serve the URL fine in a
// browser. Calling those "broken" would push me to replace working links.
const BLOCKED = new Set([401, 403, 405, 406, 429, 503])
const blocked = results.filter((r) => !r.ok && BLOCKED.has(r.status))
const bad = results.filter((r) => !r.ok && !BLOCKED.has(r.status))
const redirected = results.filter((r) => r.ok && r.finalUrl && r.finalUrl !== r.url)

writeFileSync(REPORT, JSON.stringify({ checked: results.length, bad, blocked, redirected }, null, 2))

console.log(`\n${results.length - bad.length - blocked.length}/${results.length} URLs OK`)
if (blocked.length) {
  console.log(`\n${blocked.length} blocked by bot protection — verify by hand, do not replace blindly:`)
  for (const r of blocked) console.log(`  [${r.status}] ${r.url}`)
}
if (redirected.length) {
  console.log(`\n${redirected.length} redirected (consider updating to the final URL):`)
  for (const r of redirected.slice(0, 40)) console.log(`  ${r.url}\n    → ${r.finalUrl}`)
}
if (bad.length) {
  console.log(`\n${bad.length} BROKEN:`)
  for (const r of bad) {
    console.log(`  [${r.status || r.error}] ${r.url}`)
    for (const w of r.where) console.log(`      ${w}`)
  }
  process.exitCode = 1
} else {
  console.log('every link resolves.')
}
console.log(`\nreport: ${REPORT}`)
