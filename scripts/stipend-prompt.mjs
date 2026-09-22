// Print the research brief for one stipend-scan task (see stipend-worklist.mjs).
// Run: node tracker/scripts/stipend-prompt.mjs <taskNumber>
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, '..', 'pipeline', 'output', 'stipend-scan')
const tasks = JSON.parse(readFileSync(join(OUT, '_worklist.json'), 'utf8'))
const task = tasks.find((t) => t.task === Number(process.argv[2]))
if (!task) throw new Error('no such task')

const lines = []
for (const inst of task.institutions) {
  lines.push(`\n### ${inst.institution} → write ${join(OUT, inst.file).replace(/\\/g, '/')}`)
  for (const p of inst.programs)
    lines.push(
      `- ${p.id} | ${p.name} | ${p.degree}, ${p.country} | ${p.link || 'no link'}${p.funding ? ` | current note: ${p.funding.slice(0, 160)}` : ''}`,
    )
}

console.log(`You are filling in PhD STIPEND AMOUNTS for a graduate-program database whose rule is: never guess — an honest "not found" is always better than a plausible number.

For EVERY program id listed below, find the stipend (the living allowance a funded doctoral student is paid) as published by an OFFICIAL source: the program's or department's own website, its school/college, the graduate school/division, or the university's official assistantship/fellowship rate pages. Prefer the 2026-27 academic year, else 2025-26, else the most recent year stated (record which).

RULES
1. Record an amount only when an official page states a number. Copy the sentence (or table row) that states it, verbatim, into "quote". Never estimate, average, extrapolate, or convert.
2. NOT acceptable as sources: phdstipends.com, Reddit, GradCafe, Glassdoor, news articles, rankings sites, other universities' pages. If only such sources exist, record null.
3. If the program/department gives no figure of its own but a school-wide or university-wide standard/minimum clearly applies to PhD students in this program, record it with scope "school-standard" or "university-minimum" and name the body that sets it in "note". If the department gives its own figure, use scope "program" (a department-wide figure counts as "program").
4. Rates that vary (TA vs RA, year 1 vs later, pre/post-candidacy, fellowship years): put the entry-level / first-year full figure in "amount" and summarise the variation in "note".
5. "period" is exactly as published: "12-month", "9-month" (academic year), "monthly" (amount is per month), or "other" (explain in note). Do NOT annualise monthly or 9-month figures yourself.
6. "currency": ISO code (USD, GBP, EUR, CHF, CAD, SGD, HKD).
7. Master's programs (MSc/MPhil/MRes) that are self-funded taught degrees: amount null, note "taught master's — no stipend" only if the page or the program structure makes that clear; otherwise treat like any other program.
8. If a program is a joint/umbrella program and its funding is set by the home department the student joins, use the umbrella program's own figure if it states one; otherwise the university-level figure (scope as in rule 3).
9. Nothing official found → amount null, scope null, note "not found on official pages", and list the URLs you checked in "checked".
10. If two official pages disagree (e.g. a catalog says "currently $36,000" and a newer announcement sets $37,000 from Fall 2026), use the more recent and more specific one and name the other, with its figure, in "note". Keep "note" under ~200 characters and "checked" to at most 3 URLs.
11. Many programs of one university share one rate — find the university/school-level rate once, then check each department's own funding page for a department-specific figure. Be economical: use web search to locate the official page, then fetch it to confirm the number and copy the quote. If a plain fetch of a page fails, you may use curl via Bash (e.g. curl -sL -A "Mozilla/5.0" URL).

OUTPUT — one JSON file per institution, at the path given in each heading below, written with the Write tool as soon as that institution is finished (so progress survives interruption). Exactly this shape:
{
  "institution": "<as in the heading>",
  "checked_at": "2026-09-22",
  "university_rates": [
    { "label": "e.g. Graduate School minimum 50% RA/TA stipend", "amount": 0, "currency": "USD", "period": "12-month", "academic_year": "2025-26", "source": "https://...", "quote": "verbatim sentence" }
  ],
  "programs": [
    { "program_id": "<id exactly as listed>", "amount": 0, "currency": "USD", "period": "12-month", "academic_year": "2025-26", "scope": "program", "source": "https://...", "quote": "verbatim sentence", "note": "", "checked": [] }
  ]
}
- Every listed program_id must appear exactly once in "programs" (use null amount/scope/source/quote/academic_year when not found). Use the ids exactly as given — never invent or alter one.
- "amount" is a plain number (no symbols or commas) or null.

When done, reply with ONE line per institution: "<institution>: <N> of <M> programs with an official figure (<K> program-specific)". No other commentary.

PROGRAMS (id | name | degree, country | program page | current funding note in the database):${lines.join('\n')}`)
