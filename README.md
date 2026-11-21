# JobPilot

A private, local-first job-hunting assistant with a separate profile for each person. It parses your resumes, ingests job
postings, scores how well you match, generates tailored ATS-friendly resume PDFs and cover letters,
searches twelve job sources — two of which need no API key at all — and tracks every application on
a kanban board.

Everything runs on your machine. The dev server binds to `127.0.0.1` only, all data lives in this
project folder, and the only outbound requests are to APIs you explicitly configure.

> To install it as a desktop program, run this once:
>
> ```
> powershell -ExecutionPolicy Bypass -File launcher\install-shortcuts.ps1
> ```
>
> That puts a JobPilot icon on the desktop and in the Start menu. Launching it
> starts the server with no console window, opens a borderless app window, and
> stops the server when the window is closed. See
> [launcher/README.md](launcher/README.md).

---

## Installation

Requires **Node.js 20.9+** (developed on Node 24) and npm.

```bash
npm install
```

The install downloads a pinned Chrome build for Puppeteer (~170 MB, used for PDF generation). To
keep it inside the project instead of your user cache, set `PUPPETEER_CACHE_DIR=./.cache/puppeteer`
in `.env.local` before installing.

> If `better-sqlite3` ever tries to compile from source, install the
> [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the
> "Desktop development with C++" workload. The pinned version (12.4.1) ships a prebuilt binary for
> Node 24 on Windows, so this should not happen.

## Running the app

```bash
npm run dev
```

Open **http://127.0.0.1:3000**. On first run you land on the Profiles page — create a profile for
each person, and the rest of the app unlocks.

```bash
npm run build
```

```bash
npm start
```

Both the dev and production servers bind to localhost only.

### Checking everything still works

A verification suite exercises the real pipeline — PDF and DOCX parsing, job
extraction, match scoring, tailoring with its anti-fabrication validator, all
three PDF templates, every search adapter, cross-source dedup, and the database
flow — against sample resumes in `scripts/fixtures/`:

```bash
npm run verify
```

It runs offline and needs no API keys: the search adapters are exercised against
recorded API payloads with `fetch` intercepted, so request construction and
response mapping are checked without spending quota. Individual suites are
`verify:pipeline`, `verify:ingest`, `verify:search` and `verify:flow`.

These suites run against a **sandboxed** database and storage tree under your OS
temp directory, never the real ones — `scripts/test-env.mjs` redirects both
before anything loads. That isolation matters: the search suite clears every
saved API key to test source gating, and the flow suite creates and deletes
profiles (which cascades to resumes, jobs and applications). Both refuse to start
if the sandbox is missing, so running a suite directly with `node` instead of
through npm aborts rather than touching your data.

One check the offline suite cannot make is whether each job API is actually
reachable — a retired endpoint or a wrong scheme looks fine against a recorded
payload. This calls every adapter against its real endpoint with a deliberately
invalid key, so a rejection is the pass condition:

```bash
npm run verify:live
```

It uses no real credentials, saves nothing, and spends no quota beyond one free
call each to the keyless sources. Expect
`6 reachable · 1 blocked by bot protection · 0 broken` — the blocked one is
Jooble, explained below.

`npm run typecheck` and `npm run lint` cover the rest.

## `.env` setup

**Every key is optional.** With no keys at all, every feature still works: AI features fall back to
deterministic keyword logic, and job sources without a key show a "key missing" badge instead of
disappearing. You can enter keys either in `.env.local` or on the **Settings** page (stored in the
local SQLite database, which takes precedence over `.env.local`).

```bash
cp .env.local.example .env.local
```

| Variable | Enables | Where to get it |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | AI resume parsing, match analysis, resume tailoring, cover letters, interview prep | platform.claude.com → API keys. **Prepaid** — a key does nothing until you add credits |
| `GEMINI_API_KEY` | The same five features, on Google's **free tier** | aistudio.google.com/apikey — no card required. **Read the privacy note below** |
| `AI_MODEL` | Override the model | Ignored unless it names a model of the active provider. Defaults: `claude-opus-5`, `gemini-3.5-flash` |
| `RAPIDAPI_KEY` | JSearch job search, bought via RapidAPI | rapidapi.com → search "JSearch" (OpenWeb Ninja) → subscribe to the free Basic plan → copy `X-RapidAPI-Key` |
| `OPENWEBNINJA_API_KEY` | JSearch job search, bought direct | app.openwebninja.com/api/jsearch → subscribe → copy the API key. Set **either** this or `RAPIDAPI_KEY`, not both |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | Adzuna job search | developer.adzuna.com → Register → the dashboard shows both values |
| `JOOBLE_API_KEY` | Jooble job search — **see the caveat below** | jooble.org/api/about → request form → key arrives by email |
| `CAREERJET_API_KEY` | Careerjet job search | careerjet.com/partners/api → Publisher account → v4 API key (**not** the old affiliate ID). Also register your calling IP under the account's **Server IP addresses** tab — v4 answers `403 Unauthorized access from IP …` without it. The adapter sends a matching `Referer` header hardcoded to the site declared at signup; if that site ever changes, update `REFERER` in `src/lib/sources/careerjet.ts` |

### Choosing an AI provider

Two are supported and they are interchangeable — every feature behaves the same on
either, because both go through one `generateStructured()` entry point that
constrains generation against the same Zod schemas. Set whichever key you have;
if both are set, Anthropic is used. The Settings page shows which one is active,
since a stale Anthropic key would otherwise silently shadow a working Gemini one.

```bash
npm run verify:ai
```

Sends one small structured request through the configured provider and reports
what happened — a valid key, an empty balance, an exhausted quota or a rejected
model each get a different, named answer. Model IDs and free quotas change, and
without this a wrong one just looks like the AI features quietly not working.

> **Privacy, if you use the Gemini free tier.** Google's API terms state that
> content sent to the *unpaid* tier is used to "improve and develop Google
> products", that "human reviewers may read, annotate, and process your API input
> and output", and advise: "Do not submit sensitive, confidential, or personal
> information to the Unpaid Services." JobPilot's AI features send your **full
> resume** — name, phone, address, employment history. Both providers' *paid*
> tiers exclude your content from product improvement. Leaving both keys blank
> keeps every resume on this PC, and costs you only the difference between
> rewritten and reordered output. See
> [the terms](https://ai.google.dev/gemini-api/terms).

### What happens without any AI key

| Feature | With a key | Without a key |
| --- | --- | --- |
| Resume parsing | AI reads the document and structures every section | Regex/heuristic section splitter; you correct it in the editor |
| Job extraction | AI structures the posting | schema.org JSON-LD when present, otherwise heuristics |
| Match analysis | AI scores fit and writes gap analysis | Weighted keyword overlap against a ~300-term skill dictionary |
| Resume tailoring | Summary rewritten, bullets reworded to mirror the posting | Bullets and skills **reordered and trimmed** by relevance, template summary — nothing rewritten |
| Cover letter | Written from your resume facts | Four-paragraph letter assembled from your highest-scoring bullets |
| Interview prep | 10–14 tailored questions with resume-grounded outlines | Questions generated from matched/missing keywords plus STAR scaffolds |

---

## How each job source works

Most job boards block automated access, so JobPilot uses two honest approaches instead of pretending
to scrape everything.

### API-backed sources (results appear in the app)

| Source | Notes |
| --- | --- |
| **JSearch** | Aggregates LinkedIn, Indeed, Glassdoor, Jobstreet, Foundit and the rest of Google for Jobs — the only API here with real Philippines-local coverage. Each result is badged with its original publisher. Sold two ways, through the RapidAPI marketplace or direct from its publisher OpenWeb Ninja; set whichever key you have and the adapter picks the matching origin and auth header. As of **v5 both use the `/search-v2` endpoint** (the older `/search` now answers 404) and paginate by cursor, not page number. **Quota:** one request credit per page of up to 10 results, so one search costs one credit — 200/month on RapidAPI's free Basic plan. The 6-hour cache makes a repeated search free. It queries Google live and averages ~9s, so it gets a 30s timeout where other sources get 10s. |
| **Adzuna** | Has **no Philippines endpoint** — set the country in Settings (default Singapore) and treat it as your remote/overseas feed. Predicted salaries are marked "(est.)". |
| **Jooble** | Real Philippines coverage, but **their API currently blocks automated requests** — see below. No native remote filter, so "remote" is appended to your keywords when that box is ticked. |
| **Careerjet** | Search API **v4** (`search.api.careerjet.net/v4/query`), authenticated with HTTP Basic where your API key is the username. Queries the `en_PH` locale. The older affiliate-ID endpoint is closed to new accounts, so a v4 Publisher key is what you need. v4 also enforces the calling IP and a matching `Referer` header declared on the Publisher account — see the `.env` setup table above. |
| **Jobicy** | **No key needed — always on.** Remote jobs only. When your search location is in the Philippines it asks Jobicy for PH-eligible listings. Their terms ask for visible credit and links to the original posting; the source badge and job links satisfy both. |
| **Remotive** | **No key needed — always on.** Remote jobs only, curated, delayed 24h by design. Their terms cap polling at a few calls/day — the 6-hour cache keeps one unique query to 4/day — and require linking back to Remotive as the source, which the job links do. |

#### The Jooble caveat

Jooble serves its whole domain — API included — behind a Cloudflare managed
challenge that answers server-side requests with `HTTP 403` and an interstitial
page instead of JSON. This is not a JobPilot bug and no API key fixes it:
getting past it would mean defeating bot protection, which this app does not do.

JobPilot detects the challenge and reports Jooble as **blocked** (distinct from
*failed*, because no retry or key will help), and a **Jooble PH** search link is
included under smart links — a real browser clears the challenge, so that path
works. If Jooble stops challenging your network, a saved key starts working with
no further changes.

Results from all enabled sources are merged and deduplicated (exact match on normalized
title/company/city, then fuzzy matching on title token overlap and company edit distance). Anything
you have already ingested is badged "Already saved".

### Suggest from my resume

The Keywords box is the one place the app asks the user to already know the
answer — the titles their own experience is advertised under. **Suggest from my
resume** derives 5–6 short queries from the master resume and offers them as
chips; clicking one fills Keywords.

Nothing is searched automatically. JSearch's free tier is roughly 200 requests a
month, and running six suggestions off one click would spend a fortnight's budget
unasked, so the user picks.

With an AI key this finds adjacent roles a keyword pass cannot infer — on a
.NET/MCP resume it proposed *AI Integration Engineer* and *Full Stack Developer*
alongside the held title. Without one, the heuristic path uses the titles already
on the resume, which is the strongest signal anyway since it is the wording
recruiters posted. It cleans them up first: a graded title yields the discipline
(`Analyst II, Software Engineering` → `Software Engineering`, because nobody
advertises an "Analyst II" vacancy), trainee wording is dropped
(`IT Support Intern` → `IT Support`), seniority is offered as an extra broader
query rather than instead of the title, and a technology is paired with the role
noun only when it is genuinely advertised that way — there are no "HTML
Developer" postings.

### PH-focused (on by default)

The remote boards are worldwide and their keyword matching is loose, so raw results
are full of jobs a Manila-based engineer cannot use. With **PH-focused** ticked:

- **Jobs restricted to other regions are dropped.** Remotive states eligibility as a
  region list, so `Worldwide`, `Anywhere` and anything naming Asia/APAC/Philippines is
  kept while `USA`, `Brazil`, `LATAM, Europe` are not. An *unstated* location is kept —
  silence is not a restriction.
- **Off-topic roles are dropped** when your keywords are technical. Searching
  "software engineer" on these boards otherwise returns graphic designers and support
  agents whose postings mention technology. This uses a denylist of clearly
  non-technical categories, so an unfamiliar category never silently hides a job. A
  non-technical search (say "virtual assistant") disables this filter entirely.
- **Your proven boards rank first.** JSearch reports the originating board, so
  Jobstreet, LinkedIn, OnlineJobs.ph and Foundit postings sort above generic
  aggregator mirrors of the same job. The smart-link panel is ordered the same way.

Both filters report what they removed ("19 hidden (not open to PH) · 9 hidden
(off-topic role)") rather than quietly shrinking the list, and untick the box to see
everything. Filtering happens *after* the source cache, so toggling it costs no quota.

On a real search this took 57 merged results down to 29, all of them engineering roles
open to PH.

**On currency:** Philippines-local postings from JSearch carry PHP natively.
Remote-worldwide roles genuinely pay USD or EUR — JobPilot shows what the board
published and does not convert, since a made-up exchange rate on a salary range would
be worse than no number.

### Smart-link sources (open a pre-filled search in a new tab)

These sites either have no public API or actively block automated fetching, so JobPilot builds the
search URL from your keywords, location and filters and lets you open it yourself:

**JobStreet Philippines**, **Kalibrr**, **Bossjob**, **OnlineJobs.ph**, **Foundit** (formerly
Monster), **Jora**, **LinkedIn Jobs**, **Indeed**, **Glassdoor**, **Jooble PH** (whose API blocks
automated requests), and **Facebook** (both public post search and group search, using
`"hiring" + keywords + location`).

Several of these require you to be signed in to see results — each link is labelled accordingly.

### Getting a job into the app

Any API result can be sent to **Ingest → Match Analysis → Tailored Resume** with one click. For
smart-link sources, open the posting, then either paste its URL into the Ingest page or paste the
description text directly. JobPilot checks `robots.txt` before fetching any URL, respects a
`Disallow`, and never bypasses logins or CAPTCHAs — when a fetch is blocked, the paste-the-text path
is offered immediately.

---

## The tailoring guarantee

Tailoring is an **editorial** operation, not a creative one. The AI may reorder, trim, and reword
content where the underlying fact already exists in your master resume. It may not invent anything.

Every AI-generated resume is then mechanically validated against your master before you can download
it:

- Employers, job titles and dates must match a master entry exactly
- No new degrees or certifications
- Every skill must appear in your master resume's skills or be evidenced in its bullets
- Contact details must be byte-identical
- Figures that appear in a bullet but not in the corresponding master entry raise a visible warning

If validation fails, JobPilot retries once with the specific violations fed back to the model, and
then falls back to the reorder-only path — which cannot fabricate by construction. The method used
("AI" or "keyword") is shown on every generated document.

Four ATS-safe templates are included — **centered** (the default), **classic** (traditional serif),
**modern** (clean sans-serif), and **compact** (fits a long history on one page). `centered` has a
centred name, one pipe-separated contact line, uppercase headings ruled underneath, and
role/employer/dates stacked on separate lines — the layout Canva and similar builders produce, which
is what most Philippine graduates already have.

It is the default because that stacking is the one layout where a text extractor never has to guess
a field boundary. The others put role and employer on a single line separated by a dash, which works
but is one delimiter away from ambiguity; `scripts/verify-pipeline.mts` renders all four, extracts
the text and parses it back, so any regression shows up as a failed assertion rather than a resume
that silently reads as blank.
All are single-column with standard headings, no tables, no graphics, and no text in header/footer
regions. An existing tailored resume can be re-rendered in a different template with no additional
AI call.

Note that `centered` does **not** CSS-uppercase the name even though the style implies it: text
transforms change the glyphs a PDF text extractor sees, so a name typed as "Maria Santos Reyes" would
reach an ATS as "MARIA SANTOS REYES". Headings are template chrome and are transformed; the name is
user data and is rendered as stored.

---

## Pages

| Page | What it does |
| --- | --- |
| **Dashboard** | Per-profile stats (applications, response rate, interviews, average match), a 12-week applications chart, upcoming follow-ups, recent activity |
| **Job Search** | Keyword/location search with remote, date-posted and job-type filters; per-source toggles; deduplicated results; smart links |
| **Ingest** | Fetch a job URL, or paste the description when a site blocks fetching |
| **Job Detail** | Editable extracted fields, match analysis, document generation with version history, interview prep |
| **Resume Manager** | Upload PDF/DOCX, correct the parsed data in a full editor, keep multiple versions, set the master |
| **Tracker** | Drag-and-drop kanban (Saved → Applied → Interview → Offer → Rejected) with notes, follow-up dates and which resume version was sent |
| **Profiles** | Create and edit the profiles; the header switcher scopes all data |
| **Settings** | API keys (masked), search defaults, template and paper size, one-click backup |

## Data, backup and privacy

- SQLite database: `./data/jobpilot.db`
- Uploaded resumes: `./storage/uploads/resumes/<profileId>/`
- Generated PDFs: `./storage/generated/<profileId>/<jobId>/`
- Both directories are gitignored.

**Settings → Download backup** produces a zip of the database plus every stored file. The WAL is
checkpointed first so the copy is complete. Note that the zip also contains any API keys you saved
through the Settings page — keys are stored in plain text in the local database, which is a
reasonable trade-off for a single-machine app but worth knowing before you share a backup.

Outbound network requests happen only for: job search APIs you configured, fetching a job URL you
paste, and Anthropic API calls when a key is set. Your resume content is sent to Anthropic only when
you have configured a key.

Avoid putting this project inside a OneDrive- or Dropbox-synced folder — sync clients hold file
locks that can corrupt a WAL-mode SQLite database.

## Tech stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · better-sqlite3 · Puppeteer (PDF) ·
pdf-parse v2 + mammoth (resume text extraction) · cheerio + robots-parser (ingestion) · @dnd-kit
(kanban) · recharts · Anthropic SDK with structured outputs
