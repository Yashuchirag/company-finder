---
name: company-finder
description: Country-aware Software Engineering job scanner for Netherlands, UK, Dubai, and India
user-invocable: true
argument-hint: "[scan | scan --discover-only | pipeline <url> | pipeline --batch | add --company <slug> --provider <provider> --country <country>]"
license: MIT
---

# /company-finder — Country-Aware Job Scanner

Skill for scanning Software Engineering jobs across Netherlands, UK, Dubai, and India.
All commands run from the Company_Finder project root.

---

## /company-finder scan

Full discovery and scan pipeline. Zero LLM tokens until pipeline is called.

### Step 1 — Discover new companies via WebSearch

Read `config/countries.yml` to get countries and their `search_terms`. Each entry looks like:
```yaml
- name: Netherlands
  search_terms: ["Netherlands", "Amsterdam"]
  allow_keywords: ["Netherlands", "Amsterdam", "Rotterdam", "Remote NL"]
```

For each country, run WebSearch queries across the three major ATS job board indexes.
Use these query templates (substitute country search_term and role keyword):

```
site:jobs.ashbyhq.com "Software Engineer" {search_term}
site:jobs.ashbyhq.com "Backend Engineer" {search_term}
site:jobs.ashbyhq.com "Full Stack" {search_term}
site:job-boards.greenhouse.io "Software Engineer" {search_term}
site:job-boards.greenhouse.io "Backend Engineer" {search_term}
site:jobs.lever.co "Software Engineer" {search_term}
site:jobs.lever.co "Full Stack" {search_term}
```

Run all queries for all countries. For each URL in the results:
1. The URL domain reveals the provider:
   - `jobs.ashbyhq.com` → ashby
   - `job-boards.greenhouse.io` → greenhouse
   - `jobs.lever.co` → lever
2. Extract the slug: first path segment after the domain (e.g. `stripe` from `jobs.ashbyhq.com/stripe/...`)
3. Run:
   ```bash
   node discover.mjs add --slug <slug> --provider <provider> --country "<country_name>" --source discovered --liveness-check
   ```
4. Count new entries added vs already known from the command output.

After all countries, report:
```
Discovery complete:
  Netherlands: X new, Y known
  United Kingdom: X new, Y known
  Dubai: X new, Y known
  India: X new, Y known
```

If a country returns zero WebSearch results, report it explicitly:
```
⚠  <Country>: no WebSearch results returned — check search terms or connectivity
```

### Step 2 — Generate merged portals config

```bash
node merge-portals.mjs
```

This writes `data/portals-merged.yml` containing all discovered + manual companies with location and title filters applied.

### Step 3 — Scan all companies

```bash
CAREER_OPS_PORTALS=data/portals-merged.yml node scan.mjs
```

### Step 4 — Report results

Read `data/pipeline.md` and show a summary table of new jobs:

| Company | Role | Location | URL |
|---|---|---|---|

---

## /company-finder scan --discover-only

Run only Step 1 from the scan flow above. Do not generate portals or run scan.mjs.
Useful for previewing what new companies would be added before committing to a full scan.

---

## /company-finder pipeline \<url\>

Evaluate a single job against the candidate profile.

1. Fetch the job description from `<url>` using WebFetch
2. Read `config/profile.yml` for candidate details
3. Run the career-ops evaluation rubric:
   - **Role summary:** Company overview, role type, key responsibilities
   - **CV match:** Score 1–5 across 10 weighted dimensions (skills match, level fit, domain fit, growth potential, culture signals, compensation alignment, location/remote, tech stack, team size fit, mission alignment)
   - **Overall score:** Weighted average, letter grade A–F
   - **Level strategy:** Seniority positioning notes
   - **Compensation research:** Estimated band for this role and location
   - **Personalization hooks:** 2–3 specific things to mention in cover letter or intro
   - **Interview prep:** 3 STAR+Reflection stories mapped to likely interview questions
4. Append the evaluation block to `data/pipeline.md` beneath the job's checkbox entry:

```markdown
**Score: X.X/5 (Grade)**
*Evaluated: YYYY-MM-DD*

<evaluation content>
```

---

## /company-finder pipeline --batch

Evaluate all unevaluated jobs in `data/pipeline.md` in parallel using sub-agents.

An unevaluated job is a checkbox line (`- [ ] ...`) that has no evaluation block (no `**Score:**` line) immediately following it.

Dispatch one sub-agent per unevaluated job using `claude -p` with the job URL and profile. Collect results and append to `data/pipeline.md`.

---

## /company-finder add --company \<slug\> --provider \<provider\> --country \<country\> [--url \<url\>]

Add a company manually to the discovered-companies store.

```bash
node discover.mjs add \
  --slug <slug> \
  --provider <provider> \
  --country "<country>" \
  --source manual \
  [--url <url>]
```

If `--url` is omitted, the ATS-hosted URL is derived automatically from slug and provider.

Report: `Added <slug> to <country>. It will be included in the next scan.`

---

## Error handling

- If `config/profile.yml` does not exist when running pipeline: stop and ask the user to copy `config/profile.example.yml` to `config/profile.yml` and fill in their details.
- If `data/portals-merged.yml` is missing when running scan.mjs directly: run `node merge-portals.mjs` first.
- If scan.mjs exits with a non-zero code: show the last 20 lines of output and ask the user to check their setup with `npm run doctor`.
