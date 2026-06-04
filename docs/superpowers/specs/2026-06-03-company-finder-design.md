# Company Finder: Design Spec

**Date:** 2026-06-03  
**Status:** Approved

---

## Overview

Company Finder is a fresh clone of the career-ops job scanner, extended with a country-aware discovery layer and a Claude Code skill (`/company-finder`). It targets Software Engineering roles at English-speaking companies in Netherlands, UK, Dubai, and India. The system is designed to be extensible: adding a new country requires a single entry in `config/countries.yml` and nothing else.

The scanning pipeline is zero-token. LLM evaluation is a separate, deliberate step. This mirrors the career-ops philosophy: scan cheaply and often, evaluate selectively.

---

## Architecture

```
Company_Finder/
├── [career-ops files — unchanged]
├── config/
│   ├── countries.yml          # target country definitions (extensible)
│   ├── portals.manual.yml     # hand-curated company list
│   └── profile.yml            # candidate profile (career-ops format)
├── data/
│   ├── discovered-companies.json  # persistence store for discovered companies
│   ├── scan-history.tsv           # career-ops dedup store (unchanged)
│   └── pipeline.md                # job inbox (unchanged)
├── discover.mjs               # discovery module (new)
└── .claude/skills/
    └── company-finder.md      # /company-finder skill definition
```

The career-ops provider layer (Greenhouse, Ashby, Lever, Workable, Recruitee, SmartRecruiters), dedup engine, scan engine, evaluation logic, and PDF generation are all used as-is. No modifications to career-ops internals.

---

## Country Configuration

`config/countries.yml` is the single extensibility point for adding countries. Every other part of the system derives from it.

```yaml
countries:
  - name: Netherlands
    allow_keywords:
      - "Netherlands"
      - "Amsterdam"
      - "Rotterdam"
      - "Remote NL"
    search_terms:
      - "Netherlands"
      - "Amsterdam"

  - name: United Kingdom
    allow_keywords:
      - "United Kingdom"
      - "UK"
      - "London"
      - "Manchester"
      - "Remote UK"
    search_terms:
      - "UK"
      - "London"
      - "United Kingdom"

  - name: Dubai
    allow_keywords:
      - "Dubai"
      - "UAE"
      - "Remote UAE"
    search_terms:
      - "Dubai"
      - "UAE"

  - name: India
    allow_keywords:
      - "India"
      - "Bangalore"
      - "Bengaluru"
      - "Mumbai"
      - "Remote India"
    search_terms:
      - "India"
      - "Bangalore"
```

**To add a new country:** append a new entry to this file. No other changes required.

`allow_keywords` feed directly into the `location_filter.allow` list in the generated `portals.yml`. `search_terms` are used by `discover.mjs` to construct WebSearch queries.

---

## Data Model

### `data/discovered-companies.json`

A flat JSON array. Keyed by company slug — one entry per company regardless of how many countries it appears in.

```json
[
  {
    "slug": "stripe",
    "company": "Stripe",
    "provider": "greenhouse",
    "careers_url": "https://stripe.com/jobs",
    "countries": ["Netherlands", "United Kingdom"],
    "source": "discovered",
    "discovered_at": "2026-06-03"
  },
  {
    "slug": "adyen",
    "company": "Adyen",
    "provider": "greenhouse",
    "careers_url": "https://www.adyen.com/careers",
    "countries": ["Netherlands"],
    "source": "manual",
    "discovered_at": "2026-06-03"
  }
]
```

**Fields:**
- `slug`: ATS identifier (e.g. `stripe` for `jobs.ashbyhq.com/stripe`)
- `provider`: one of `greenhouse`, `ashby`, `lever`, `workable`, `recruitee`, `smartrecruiters`
- `careers_url`: branded careers page URL (preferred) or ATS-hosted URL as fallback
- `countries`: array of countries that have triggered discovery or manual addition of this company
- `source`: `"discovered"` (WebSearch) or `"manual"` (via `--add` command)
- `discovered_at`: ISO date string of first discovery

**Dedup rule:** when discovery finds a company slug already in the store, it appends the new country to the `countries` array instead of creating a duplicate entry.

### `config/portals.manual.yml`

Standard career-ops `portals.yml` format. Contains companies the user has hand-curated. Merged with discovered companies at scan time.

---

## Components

### `discover.mjs`

Reads `config/countries.yml` and runs WebSearch queries across Ashby, Greenhouse, and Lever job board indexes for each country. For each returned URL, extracts the company slug, infers the provider, runs a liveness check (hits the ATS API to confirm the board returns results), and writes new entries to `discovered-companies.json`.

Discovery queries follow the pattern:
```
site:jobs.ashbyhq.com "Software Engineer" Netherlands
site:job-boards.greenhouse.io "Software Engineer" UK
site:jobs.lever.co "Software Engineer" Dubai
```

Title terms used in queries (sampled from the broad SE filter): `"Software Engineer"`, `"Backend Engineer"`, `"Full Stack Engineer"`, `"Platform Engineer"`, `"DevOps Engineer"`, `"Data Engineer"`.

**Flags:**
- `--dry-run`: print discoveries without writing to store
- `--country <name>`: run discovery for one country only

### Portals merge (in-memory, not committed)

At scan time, `scan.mjs` is invoked with a generated `portals.yml` that merges:
1. All entries from `discovered-companies.json`
2. All entries from `config/portals.manual.yml`
3. A `location_filter` built from all `allow_keywords` across all countries in `countries.yml`
4. The broad Software Engineering `title_filter`

The merged file is written to a temp path and passed via `CAREER_OPS_PORTALS`. It is not committed to git.

### Title filter (broad Software Engineering)

```yaml
title_filter:
  positive:
    - "Software Engineer"
    - "Backend Engineer"
    - "Full Stack"
    - "Frontend Engineer"
    - "Platform Engineer"
    - "DevOps"
    - "Site Reliability"
    - "SRE"
    - "Data Engineer"
    - "Cloud Engineer"
    - "Infrastructure Engineer"
    - "Engineering Manager"
    - "Staff Engineer"
    - "Principal Engineer"
    - "Solutions Engineer"
    - "AI Engineer"
    - "ML Engineer"
  negative:
    - "Junior"
    - "Intern"
    - "iOS"
    - "Android"
    - "Embedded"
    - ".NET"
    - "PHP"
    - "QA"
    - "Test Engineer"
```

---

## Commands

### `/company-finder scan`

Full discovery and scan pipeline. Zero LLM tokens.

Steps:
1. Run `discover.mjs` for all countries
2. Report: how many new companies discovered per country, how many already known
3. Generate merged `portals.yml` in memory
4. Run `scan.mjs` against merged config
5. Report: how many jobs found, how many passed title+location filter, how many were new (not in dedup store)
6. Show a summary table of new jobs by company and country

If a country returns zero discoveries, the skill reports this explicitly rather than silently skipping it.

### `/company-finder scan --discover-only`

Runs only step 1 and 2. Useful for checking what new companies exist before committing to a full scan.

### `/company-finder pipeline <url>`

Takes a single job URL from `pipeline.md`, reads `config/profile.yml`, and runs career-ops's full LLM evaluation. Outputs a structured score and evaluation block.

### `/company-finder pipeline --batch`

Evaluates all unevaluated jobs in `pipeline.md` in parallel using sub-agents. Equivalent to career-ops's batch mode.

### `/company-finder add --company <slug> --provider <provider> --country <country> [--url <careers_url>]`

Writes a manual entry directly to `discovered-companies.json` with `source: manual`. If the slug already exists, appends the country to the `countries` array. The next scan picks it up automatically.

`--url` is optional. If omitted, `discover.mjs` derives the standard ATS-hosted URL from the slug and provider (e.g. `https://boards.greenhouse.io/adyen`). Provide `--url` when the company has a branded careers page you want to use instead.

Example:
```
/company-finder add --company adyen --provider greenhouse --country Netherlands --url https://www.adyen.com/careers
```

---

## Data Flow

```
/company-finder scan
│
├── discover.mjs
│   ├── read countries.yml
│   ├── WebSearch per country × provider × title term
│   ├── extract slug from returned URLs
│   ├── liveness check (ATS API responds with jobs)
│   └── write new entries to discovered-companies.json
│
├── merge portals (in-memory)
│   ├── discovered-companies.json → tracked_companies entries
│   ├── portals.manual.yml merged in
│   ├── location_filter from countries.yml allow_keywords
│   └── title_filter (broad SE keywords)
│
└── scan.mjs (CAREER_OPS_PORTALS=<temp merged file>)
    ├── hit Greenhouse / Ashby / Lever APIs in parallel
    ├── apply title + location filter
    ├── deduplicate against scan-history.tsv
    └── write new jobs to data/pipeline.md

/company-finder pipeline <url>
│
├── read config/profile.yml
├── fetch job description from URL
└── LLM evaluation (career-ops rubric)
    └── annotate pipeline.md with score + evaluation block
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| WebSearch returns stale/closed job URL | Liveness check rejects it before writing to store |
| ATS board returns 404 during scan | Per-company warning logged, scan continues with remaining companies |
| Country returns zero WebSearch results | Explicitly reported in scan summary, not silently skipped |
| `--add` called with existing slug | Appends country to `countries` array, no duplicate created |
| Merged portals.yml generation fails | Error surfaced before scan starts, nothing written |
| `profile.yml` missing during pipeline | Clear error asking user to create it from the example template |

---

## Future Extensibility

- **New country:** add one entry to `config/countries.yml`. No code changes.
- **New ATS provider:** drop a `*.mjs` file into `providers/` (career-ops plugin pattern). No config changes.
- **New title filter keyword:** edit the `title_filter` section. Affects all companies globally.
- **Per-company title override:** career-ops supports per-entry overrides in `portals.yml` — available via `portals.manual.yml` for curated companies.
