# Company Finder

A country-aware Software Engineering job scanner built on top of [career-ops](https://github.com/santifer/career-ops). Scans Greenhouse, Ashby, and Lever job boards for Software Engineering roles across **Netherlands, UK, Dubai, and India** using a `/company-finder` Claude Code skill.

**Author:** Chirag Chandrashekar — [chiragchandrashekar@gmail.com](mailto:chiragchandrashekar@gmail.com)

---

## What it does

- Discovers companies hiring Software Engineers in your target countries via WebSearch across Ashby, Greenhouse, and Lever job board indexes
- Persists discovered companies in `data/discovered-companies.json` so they are never re-searched
- Merges discovered companies with your hand-curated list at scan time
- Filters by location (country-aware) and title (broad Software Engineering keywords)
- Deduplicates against previously seen jobs so your inbox only ever shows new postings
- Evaluates matching jobs against your profile using career-ops's LLM evaluation rubric (score 1–5, letter grade A–F, compensation research, interview prep)

The scanning pipeline is zero-token. LLM evaluation is a separate, deliberate step.

---

## Supported countries

| Country | Cities covered |
|---|---|
| Netherlands | Amsterdam, Rotterdam |
| United Kingdom | London, Manchester |
| Dubai | Dubai, UAE |
| India | Bangalore, Mumbai, Hyderabad |

Adding a new country requires a single entry in `config/countries.yml`. No code changes.

---

## Quick start

### Prerequisites

- Node.js >= 18
- [Claude Code](https://claude.ai/code) (for the `/company-finder` skill)

### Setup

```bash
# 1. Clone this repo
git clone https://github.com/Yashuchirag/company-finder.git
cd company-finder

# 2. Install dependencies
npm install
npx playwright install chromium

# 3. Set up your profile
cp config/profile.example.yml config/profile.yml
# Edit config/profile.yml with your details (name, target roles, compensation)

# 4. Verify setup
npm run doctor
```

### Usage

Open Claude Code in the project directory and use these skill commands:

```
# Discover new companies + scan for jobs (zero LLM tokens)
/company-finder scan

# Discovery only — preview new companies without scanning
/company-finder scan --discover-only

# Evaluate a specific job against your profile
/company-finder pipeline https://jobs.ashbyhq.com/linear/abc-123

# Evaluate all unevaluated jobs in pipeline.md in parallel
/company-finder pipeline --batch

# Add a company manually
/company-finder add --company adyen --provider greenhouse --country Netherlands
```

---

## Project structure

```
company-finder/
├── config/
│   ├── countries.yml          # Target countries — add new ones here
│   ├── portals.manual.yml     # Hand-curated company list
│   └── profile.yml            # Your candidate profile (gitignored)
├── data/
│   ├── discovered-companies.json  # Persisted discovered companies
│   ├── scan-history.tsv           # Dedup store (career-ops)
│   └── pipeline.md                # Job inbox
├── store.mjs                  # CRUD for discovered-companies.json
├── merge-portals.mjs          # Generates merged portals config at scan time
├── discover.mjs               # CLI: add / list / check companies
├── scan.mjs                   # career-ops scanner (unmodified)
├── providers/                 # career-ops ATS providers (unmodified)
└── .claude/skills/
    └── company-finder.md      # /company-finder skill definition
```

---

## New files (Company Finder additions)

| File | Purpose |
|---|---|
| `store.mjs` | Pure CRUD for `data/discovered-companies.json` |
| `merge-portals.mjs` | Builds merged `portals.yml` from discovered + manual + country config |
| `discover.mjs` | CLI for managing the discovered-companies store |
| `config/countries.yml` | Country definitions with location keywords and search terms |
| `config/portals.manual.yml` | Hand-curated company list (merged at scan time) |
| `.claude/skills/company-finder.md` | `/company-finder` Claude Code skill |
| `tests/` | Unit tests for the three new modules (23 tests) |

Everything else is career-ops, included unmodified.

---

## discover.mjs CLI reference

```bash
# List all stored companies
node discover.mjs list

# Add a company manually
node discover.mjs add --slug <slug> --provider <greenhouse|ashby|lever> --country <country> \
                      [--company <name>] [--url <url>] [--source manual|discovered] \
                      [--liveness-check] [--dry-run]

# Check if a company is in the store
node discover.mjs check --slug <slug>
```

---

## Running tests

```bash
node --test tests/store.test.mjs
node --test tests/merge-portals.test.mjs
node --test tests/discover.test.mjs
```

---

## License and attribution

This project is built on [career-ops](https://github.com/santifer/career-ops) by Santiago Fernández de Valderrama, licensed under the [MIT License](LICENSE). The career-ops source is included unmodified. The Company Finder additions (`store.mjs`, `merge-portals.mjs`, `discover.mjs`, `config/countries.yml`, `config/portals.manual.yml`, `.claude/skills/company-finder.md`, `tests/`) are original work by Chirag Chandrashekar, also released under the MIT License.

See [NOTICE](NOTICE) for full attribution details.
