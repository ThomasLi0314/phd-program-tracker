# PhD Program & Faculty Tracker

**Live site: <https://thomasli0314.github.io/phd-program-tracker/>** — no sign-up, nothing to install.

A searchable database of graduate programs and the professors who advise in
them, plus a private workspace for running your own applications: a shortlist,
an application plan, cold-email tracking, and a separate planner for taught
master's programs abroad.

Everything you save stays in your own browser. The published site is a static
page — there is no server and no account. [Your data](#your-data) explains
exactly what that means, including the optional Google and AI features.

| | |
|---|---|
| Programs | **1,436** PhD/MSc programs at **75** universities (US, UK, Europe, Canada, Asia-Pacific) across 20 fields |
| Faculty | **15,721** advisor profiles on 559 programs |
| Stipends | **1,225** programs with a figure an official page states; 211 checked with nothing published |
| Rent | average monthly rent for all 66 university locations |
| Master's abroad | **215** taught master's programs in 14 countries, with tuition and scholarship rules |
| Cycle | built for **Fall 2027** entry |

---

## What you can do

**Explore** — filter programs by field, sub-field, degree, region, application
fee and GRE policy. Open one for its deadline, fee, GRE and English
requirements, funding, admission model, whether to email faculty first, its
stipend and the local rent, and its advisor roster grouped by research area.
You can also search advisors across every school, or browse school by school.

**Saved** — star programs and advisors (three priority levels) and keep your own
notes on each.

**Plan** (`#/planner`) — your application tracker: interest level and status per
program, deadlines with countdowns, the faculty you saved there, contact state,
a research profile, and **Export Excel** — one sheet with advisors grouped under
each program, including stipend and rent columns.

**Contact** — connect Gmail (optional) and the site reads your *Sent* mail
headers to work out which professors you emailed and who replied, then links
each record straight to that conversation in Gmail. It never sends mail for you.

**Master's abroad** (`#/masters`) — the master's database, with tuition by
citizenship tier, scholarship routes and language requirements, plus **My plan**
(`#/masters/plan`): deadlines, costs, a document checklist and notes per
program, with its own Excel export.

**Notes** — a per-program note button creates a Google Doc in your own Drive and
links to it (optional; needs the Google connection).

---

## Your data

**By default everything you create lives in your browser's `localStorage`, on
the device you used.** It is not uploaded anywhere, and whoever publishes the
site cannot see it. Clearing site data erases it, so use the backup below if it
matters to you.

| What you save | Where it is kept |
|---|---|
| Saved programs, school tiers, saved advisors, advisor notes | your browser |
| Application plan (programs, faculty, notes) | your browser |
| Master's plan (programs, checklists, notes) | your browser |
| Contact records synced from Gmail | your browser |
| Your edits to any program field | your browser |
| Program note documents | **your Google Drive**, as ordinary Google Docs you own |
| Backup snapshots, if you switch Drive backup on | **your Google Drive**, in its hidden per-app folder |

### The optional connections, and what leaves your browser

Each is off until you set it up in **Settings**, with **your own** credentials:

- **Google (Gmail + Drive).** You create your own Google Cloud OAuth client ID
  and paste it in. The access token is held in memory only and never stored.
  Gmail is requested read-only, and the sync asks for **message headers**
  (To/From/Subject/Date) — not message bodies, unless you switch on the AI
  reply-reading feature below. Drive backups go to `appDataFolder`, a private
  folder that only this app, signed in as you, can read: it does not show up
  among your normal Drive files and no one else can open it. The note documents
  use Google's per-file scope, which grants access only to files this app itself
  creates — connecting it does not open the rest of your Drive.
- **DeepSeek AI (optional).** If you add a DeepSeek API key, the features that
  summarise a professor's research or interpret a reply send that text to
  `api.deepseek.com`, and pages read for those summaries are fetched through the
  public reader proxy `r.jina.ai`. Leave the key blank and neither is called.

### What the site owner and GitHub can see

Nothing you save. The published site is static files on GitHub Pages, so there
is nowhere for it to post your data. (GitHub serves the files and logs requests
the way any web host does.) The "request a field" form only works when the site
is run locally with `server.mjs`; on the published site it tells you to send the
request yourself.

### Back up, restore, wipe

- **Settings → Backup** exports one JSON file with everything you have saved
  (API keys are deliberately left out) and imports it on another machine.
- With Google connected, the same snapshot can be written to Drive and restored
  onto a fresh browser.
- To erase everything, clear site data for the page in your browser settings.

---

## What is in the database, and how far to trust it

Every program carries its deadline, application fee, GRE policy, number of
recommendation letters, English requirement, funding status and years, admission
model (program-based, rotation, direct advisor match…), whether to contact
faculty before applying, duration, official links and — where a university
publishes one — a stipend. Each advisor carries a title, sub-field, research
tags, a short summary and links.

**The rule for this dataset: never guess.** A fact is recorded only when an
official page states it; otherwise the field reads **"Unknown / Verify"**, which
means *nobody has confirmed this yet* — not *there is no requirement*.

Worth knowing before you lean on a number:

- **Stipends** say whose figure they are — the program's own, a school-wide
  standard, or a university-wide minimum — with the year, the source link and
  the sentence the page used. Periods stay as published (per year, 12-month,
  9-month, monthly, per term, per semester, per quarter), and a per-term figure
  is never multiplied into a yearly one. Anything older than 2024 is flagged.
- **Rent** is an average of published figures, not a quote for a real flat. In
  the US it is the mean of HUD's FY2026 one-bedroom Fair Market Rent for the
  county, the same measure for the residential ZIP next to campus, and Zillow's
  latest city rent index. Elsewhere it is the mean of published one-bedroom
  rents, official statistics first. Every component is listed on the program
  page with its source.
- **"Rent as a share of stipend"** divides twelve months of that rent by the
  stipend. It is a rough yardstick for one person renting alone; most students
  share, and a 9-month stipend excludes summer pay.
- **Recruiting status** says "Looking for Students" only where a department or
  the professor states it outright.
- **Deadlines** belong to the cycle shown and should be re-checked when
  applications open.

---

## Run or fork it yourself

Prerequisites: **Node 20+** (24 recommended) and npm.

```bash
git clone https://github.com/ThomasLi0314/phd-program-tracker.git
cd phd-program-tracker/frontend
npm install
npm run dev            # http://localhost:5173
```

Build the published site (this is what GitHub Pages serves):

```bash
npm run build:pages    # splits the dataset, type-checks, writes ../docs
```

To publish your own copy: push to GitHub, then under **Settings → Pages** choose
*Deploy from a branch* → branch `main`, folder `/docs`. The site is fully
static, so any static host works.

Other commands: `npm run build` (build into `frontend/dist`), `npm run preview`
(serve a build), `npm run lint`, and `npm run serve` (a small Node server that
also accepts the "request a field" form and appends it to `frontend/reports/`,
which is git-ignored).

The `*.ps1` scripts in the repo root are Windows helpers from before GitHub
Pages: they build the site, serve it from a laptop and expose it through a
Cloudflare tunnel. You do not need them to use or publish the site.

---

## Repository map

| Path | What it is |
|---|---|
| `frontend/src/` | the app: `components/` (Explore, program pages, advisors, contact), `planner/` (application plan), `europe/` (master's database + plan), `lib/` (data loading, storage, Google, backup, Excel) |
| `frontend/src/data/mock_data.json` | **the database** — every program and advisor, the single source of truth |
| `frontend/public/data/` | what the site loads: `index.json`, one file per field, `europe.json` (master's), `housing.json` (rent) |
| `docs/` | the built site GitHub Pages serves — generated, don't edit by hand |
| `scripts/` | Node scripts that build and maintain the database (below) |
| `pipeline/` | the original Python scraping pipeline (`gradintel/`), its schemas, tests and weekly refresh job |

### Scripts that build the data

Run from the repo root with `node scripts/<name>.mjs`.

| Script | Purpose |
|---|---|
| `split-data.mjs` | splits `mock_data.json` into the per-field files the site loads (runs inside `build:pages`) |
| `add-programs.mjs` | adds whole programs from JSON files; idempotent |
| `merge-faculty.mjs` | merges advisor rosters additively, validating and clipping fields |
| `add-requested-advisors.mjs` | promotes advisors added in the browser, refusing any without a source URL |
| `dedupe-faculty.mjs`, `dedupe-programs.mjs` | collapse duplicates |
| `stipend-worklist.mjs`, `stipend-prompt.mjs` | plan a stipend research pass and print the brief for each batch |
| `verify-stipends.mjs` | re-fetches every stipend source and checks the number is really on the page (headless Chrome for sites that block scripts, direct links for Box/Drive files, text extraction for PDFs) |
| `merge-stipends.mjs` | merges only verified figures; anything unconfirmed is held back and reported |
| `housing-us.mjs`, `build-housing.mjs` | build the rent table from HUD and Zillow data plus researched international rents |
| `europe-source.mjs`, `build-europe.mjs`, `check-europe-links.mjs`, `asia-source.mjs` | build and check the master's dataset |

The Python pipeline (`pipeline/`) fetches program pages and proposes changes:
`python weekly_refresh.py` writes a dated report to `pipeline/review/` and
**never edits the dataset itself**, so verified values are only replaced when a
person applies a change.

### If you add data

Keep the rule: a value goes in only when an official page states it, with the
source URL recorded; otherwise leave `Unknown/Verify`. `verify-stipends.mjs` is
the model — it re-reads each source and refuses anything it cannot find there.

---

## Credits and reuse

Program and faculty information belongs to the universities that publish it and
was collected from their official pages. Rent figures come from HUD, Zillow,
national statistics offices and named rent reports, each cited in the app. This
repository has no licence file yet, so default copyright applies — open an issue
if you would like to reuse the code.
