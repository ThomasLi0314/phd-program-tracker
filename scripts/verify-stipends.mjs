// Check every stipend the scan recorded against its own source page: fetch the
// page (curl; PDFs through pdftotext), and look for the amount — in the
// spellings pages actually use — and for the quoted sentence.
//
// Results are cached per claim (URL + amount + quote) in
// pipeline/output/stipend-scan/_verify.json, so a re-run only fetches sources
// for new or changed claims. merge-stipends.mjs reads that file.
//
// Run: node tracker/scripts/verify-stipends.mjs [--refetch]
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = join(HERE, '..', 'pipeline', 'output', 'stipend-scan')
const CACHE = join(DIR, '_verify.json')
const REFETCH = process.argv.includes('--refetch')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const cache = existsSync(CACHE) && !REFETCH ? JSON.parse(readFileSync(CACHE, 'utf8')) : {}
const tmp = mkdtempSync(join(tmpdir(), 'stipend-'))

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const HEADERS = [
  ['Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'],
  ['Accept-Language', 'en-US,en;q=0.9'],
  ['Sec-Fetch-Dest', 'document'],
  ['Sec-Fetch-Mode', 'navigate'],
  ['Sec-Fetch-Site', 'none'],
  ['Upgrade-Insecure-Requests', '1'],
].flatMap(([k, v]) => ['-H', `${k}: ${v}`])

const htmlToText = (html) =>
  html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')

/**
 * Some university sites (UC Davis, Michigan's Rackham and LSA) refuse every
 * scripted fetch with a 403. A headless Chrome in its own throwaway profile
 * reads them the way a visitor's browser does.
 */
async function chromeText(url) {
  try {
    const { stdout } = await run(
      CHROME,
      // A profile directory per call: Chrome locks its profile, so parallel
      // runs sharing one silently returned nothing.
      ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${join(tmp, `chrome-${Math.random().toString(36).slice(2)}`)}`, `--user-agent=${UA}`, '--virtual-time-budget=10000', '--dump-dom', url],
      { maxBuffer: 64 << 20, timeout: 90000 },
    )
    return htmlToText(stdout).replace(/\s+/g, ' ')
  } catch {
    return ''
  }
}

/** Page text, whitespace-collapsed, or an error string. */
async function pageText(url) {
  const t = await curlText(url)
  if (t.code >= 400 || t.code === 0) {
    const text = await chromeText(url)
    if (text.length > 500) return { code: 200, via: 'chrome', text }
  }
  return t
}

async function curlText(url) {
  const file = join(tmp, `p${Math.random().toString(36).slice(2)}`)
  try {
    const { stdout } = await run(
      'curl',
      ['-sL', '--compressed', '-m', '40', '-A', UA, ...HEADERS, '-o', file, '-w', '%{http_code} %{content_type}', url],
      { maxBuffer: 1 << 20 },
    )
    const [code, type = ''] = stdout.trim().split(' ')
    const buf = readFileSync(file)
    let text
    if (/pdf/i.test(type) || buf.subarray(0, 4).toString() === '%PDF') {
      const { stdout: t } = await run('pdftotext', ['-layout', file, '-'], { maxBuffer: 64 << 20 })
      text = t
    } else {
      text = htmlToText(buf.toString('utf8'))
    }
    return { code: Number(code), text: text.replace(/\s+/g, ' ') }
  } catch (e) {
    return { code: 0, text: '', error: String(e.message ?? e).slice(0, 200) }
  } finally {
    try {
      rmSync(file, { force: true })
    } catch {}
  }
}

/** The ways a page may print an amount: 45000 · 45,000 · 45 000 · 45'000 · 45.000 · $45K. */
function spellings(n) {
  const [int, dec] = String(n).split('.')
  const group = (sep) => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep)
  const tail = dec ? `.${dec}` : ''
  const out = new Set([int + tail, group(',') + tail, group(' ') + tail, group("'") + tail, group('’') + tail, group('.') + (dec ? `,${dec}` : '')])
  if (dec && /^0+$/.test(dec)) out.add(group(','))
  if (dec && dec.length === 1) for (const x of [...out]) if (x.endsWith(dec)) out.add(`${x}0`) // 14,615.4 → 14,615.40
  if (!dec && Number(int) % 1000 === 0 && Number(int) >= 1000) {
    out.add(`${Number(int) / 1000}K`)
    out.add(`${Number(int) / 1000}k`)
  }
  return [...out]
}

function hasAmount(text, n) {
  return spellings(n).some((s) => {
    const re = new RegExp(`(^|[^0-9.,])${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9])`)
    return re.test(text)
  })
}

const norm = (s) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim()

const entries = []
for (const f of readdirSync(DIR)) {
  if (!f.endsWith('.json') || f.startsWith('_')) continue
  const j = JSON.parse(readFileSync(join(DIR, f), 'utf8'))
  for (const p of j.programs ?? []) if (p.amount != null && p.source) entries.push({ file: f, ...p })
  for (const r of j.university_rates ?? []) if (r.amount != null && r.source) entries.push({ file: f, program_id: `(rate) ${r.label}`, ...r })
}
// Cache key = what was claimed; a changed amount, quote or URL is re-checked.
const claim = (e) => `${e.source}|${e.amount}|${norm(e.quote ?? '').slice(0, 80)}`
// Blocked or failed fetches are retried on every run; settled claims are not.
const todo = entries.filter((e) => {
  const c = cache[claim(e)]
  return !c || c.code >= 400 || c.code === 0
})
const urls = [...new Set(todo.map((e) => e.source))]
console.log(`${entries.length} figures · ${todo.length} unchecked · ${urls.length} source pages to fetch`)

const texts = new Map()
for (let i = 0; i < urls.length; i += 8) {
  await Promise.all(urls.slice(i, i + 8).map(async (u) => texts.set(u, await pageText(u))))
  process.stdout.write(`
  fetched ${Math.min(i + 8, urls.length)}/${urls.length}`)
}
if (urls.length) console.log('')
// A page that loads but lacks the number may build it with JavaScript (U of T
// Statistics renders its funding table client-side): read it again in Chrome.
const rendered = new Map()
for (const e of todo) {
  const page = texts.get(e.source)
  if (page.via === 'chrome' || hasAmount(page.text, e.amount)) continue
  if (!rendered.has(e.source)) rendered.set(e.source, await chromeText(e.source))
  const text = rendered.get(e.source)
  if (hasAmount(text, e.amount)) texts.set(e.source, { code: 200, via: 'chrome', text })
}
for (const e of todo) {
  const page = texts.get(e.source)
  const q = norm(e.quote ?? '')
  cache[claim(e)] = {
    code: page.code,
    error: page.error,
    amount_on_page: hasAmount(page.text, e.amount),
    quote_on_page: q.length > 0 && norm(page.text).includes(q.slice(0, Math.min(q.length, 80))),
    checked: new Date().toISOString().slice(0, 10),
  }
}
writeFileSync(CACHE, JSON.stringify(cache, null, 1))
rmSync(tmp, { recursive: true, force: true })

const results = {}
for (const e of entries) results[`${e.file}::${e.program_id}`] = { url: e.source, ...cache[claim(e)] }
writeFileSync(join(DIR, '_verify-results.json'), JSON.stringify(results, null, 1))
const bad = Object.entries(results).filter(([, r]) => !r.amount_on_page)
console.log(`${entries.length - bad.length}/${entries.length} figures found on their source page`)
for (const [k, r] of bad) console.log(`  x ${k}  [${r.code}] ${r.url}${r.quote_on_page ? '  (quote found; number spelled differently)' : ''}`)
