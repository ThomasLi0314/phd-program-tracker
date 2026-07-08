# Global STEM Graduate Program & Faculty Intelligence Tracker

Two halves, one schema:

| Piece | Path | Stack |
|---|---|---|
| Scraping pipeline | `pipeline/` | Python · requests/BeautifulSoup · optional Claude structured extraction |
| Interactive frontend | `frontend/` | Vite · React · TypeScript · Tailwind v4 |

The pipeline emits JSON validated against `pipeline/gradintel/schemas.py`; the
frontend renders any file with that shape from `frontend/src/data/mock_data.json`.
Currently **43 programs / 322 faculty** across ten STEM disciplines.

## Develop

```powershell
cd frontend
npm install
npm run dev          # http://localhost:5173 (hot-reload dev server)
```

## Share it as a website (data stays on this laptop)

The site is fully static and stores each visitor's "My List" in their own
browser (localStorage), so no backend or database is needed. To let other people
use it, serve the built site from this laptop and expose it with a free
Cloudflare quick tunnel — **all data stays local; the tunnel only relays traffic.**

```powershell
cd ..            # the tracker/ folder (where tracker.ps1 lives)
.\tracker.ps1    # builds, serves on :8787, prints a public https://<...>.trycloudflare.com link
```

Share the printed `trycloudflare.com` link. The site is live **only while that
window stays open and this laptop is on and online**. A fresh link is issued
each run (quick tunnels are ephemeral; a permanent URL needs a Cloudflare
account + domain and a "named tunnel").

Flags: `.\tracker.ps1 -NoBuild` (skip rebuild) · `-LocalOnly` (Wi-Fi only, no
public link) · `-Port 9000`. cloudflared is already installed; if it ever goes
missing, reinstall with `winget install --id Cloudflare.cloudflared`.

## Permanent address (fixed URL instead of a random one)

The quick tunnel above works but hands out a new random link each run. For a
**stable** address like `https://tracker.yourdomain.com`, use a Cloudflare
*named* tunnel. One-time prerequisites (yours to do — they need your account):

1. Create a free Cloudflare account at https://dash.cloudflare.com
2. Put a domain on that account — either **buy one** via Cloudflare Registrar
   (~$10/yr) or **add an existing domain** and switch its nameservers to
   Cloudflare. (A permanent hostname requires a domain; there is no free
   fixed URL without one.)
3. Authorize cloudflared with your account (opens a browser — pick your domain):
   ```powershell
   cloudflared tunnel login
   ```

Then run the setup once and start serving:

```powershell
.\setup-permanent-tunnel.ps1 -Hostname tracker.yourdomain.com   # one-time
.\serve-permanent.ps1                                            # build + serve + permanent tunnel
```

`serve-permanent.ps1` keeps the site at your fixed URL while the window is open
and the laptop is on/online. To run 24/7 without a window, install cloudflared
as a Windows service: `cloudflared service install` (it uses the config written
to `%USERPROFILE%\.cloudflared\config.yml`); keep `npm run serve` running too.

## Request-a-field feature

Visitors can suggest a research area the database doesn't cover yet (header →
**"+ Request a field"**). Submissions POST to the local server and append to
`frontend/reports/field-requests.jsonl` **on this laptop — nothing off-machine.**
Review them anytime:

```powershell
.\show-requests.ps1            # list all requests
.\show-requests.ps1 -Tail 10   # just the latest
```

When you want to act on one, ask the agent to research that field; it's then
merged into the dataset like any other program/faculty addition. (Push
notification — email/Slack when a request arrives — isn't wired up; ask if you
want it and provide a channel.)

## Weekly automatic refresh (review-based, non-destructive)

A Windows Scheduled Task (**"GradTracker Weekly Refresh"**, Mondays 09:00) runs
`pipeline/run-weekly-refresh.ps1`, which re-fetches each program's official pages
and **writes a change report — it never edits the dataset.** Verified/curated
values are only overwritten if you choose to apply a change.

- Reports land in `pipeline/review/refresh-report-<date>.md` (human-readable)
  and `proposed-<date>.json` (machine-readable); a run log is `review/refresh.log`.
- robots.txt is respected (some sites, e.g. Princeton AOS, block scraping and are
  listed for manual/agent follow-up); unreachable pages are logged, never guessed.
- Only hard metrics are checked: deadline, application fee, GRE, letters, ECTS.
  Faculty summaries are **not** auto-regenerated (that needs a paid Claude API key).

```powershell
# Run it on demand:
cd pipeline
python weekly_refresh.py                 # all programs
python weekly_refresh.py --max 5 -v      # quick test on the first few

# Manage the schedule:
Get-ScheduledTask -TaskName "GradTracker Weekly Refresh"
Start-ScheduledTask   -TaskName "GradTracker Weekly Refresh"   # run now
Unregister-ScheduledTask -TaskName "GradTracker Weekly Refresh" -Confirm:$false  # remove
```

## Grow the dataset

```powershell
cd pipeline
python -m gradintel.pipeline --no-llm                 # heuristics-only scrape (config/targets.yaml)
python merge.py ..\frontend\src\data\mock_data.json new-programs.json     # upsert whole programs
python merge.py --faculty-only ..\frontend\src\data\mock_data.json more-faculty.json  # add faculty only
python -m gradintel.pipeline --validate ..\frontend\src\data\mock_data.json           # schema check
```

Full pipeline docs (config format, politeness, LLM setup): `pipeline/README.md`.
