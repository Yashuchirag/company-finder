# Company Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a country-aware Software Engineering job scanner on top of career-ops with a `/company-finder` Claude Code skill, targeting Netherlands, UK, Dubai, and India.

**Architecture:** Clone career-ops verbatim, then layer three new files (`store.mjs`, `merge-portals.mjs`, `discover.mjs`) and a skill (`.claude/skills/company-finder.md`) on top. Career-ops internals are not modified. The skill orchestrates WebSearch-based discovery (via Claude tools), persists discovered companies in `data/discovered-companies.json`, generates a merged `portals.yml` at scan time, and delegates scanning and evaluation to career-ops's existing engine.

**Tech Stack:** Node.js (ESM, `.mjs`), `js-yaml` v4 (already in career-ops), `node:test` + `node:assert` for tests, career-ops provider layer (Greenhouse, Ashby, Lever, Workable, Recruitee, SmartRecruiters).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| (entire career-ops repo) | Clone | Provides provider layer, scan engine, dedup, evaluation |
| `config/countries.yml` | Create | Target country definitions; single extensibility point |
| `config/portals.manual.yml` | Create | Hand-curated company list; merged at scan time |
| `data/discovered-companies.json` | Create (empty) | Persistence store for discovered companies |
| `data/portals-merged.yml` | Generated at runtime | Merged portals fed to scan.mjs; gitignored |
| `store.mjs` | Create | Pure CRUD functions for discovered-companies.json |
| `merge-portals.mjs` | Create | Generates data/portals-merged.yml from all sources |
| `discover.mjs` | Create | CLI: `add`, `list`, `check` commands for the store |
| `.claude/skills/company-finder.md` | Create | Skill definition for /company-finder commands |
| `tests/store.test.mjs` | Create | Unit tests for store.mjs |
| `tests/merge-portals.test.mjs` | Create | Unit tests for merge-portals.mjs |
| `.gitignore` | Modify | Add data/portals-merged.yml |

---

## Task 1: Clone career-ops and verify setup

**Files:**
- Entire repo at root

- [ ] **Step 1: Clone career-ops into the project directory**

Run from the parent directory (not inside Company_Finder itself — the clone must populate the empty directory):

```bash
git clone https://github.com/santifer/career-ops.git "/mnt/d/Personal Projects/Company_Finder"
cd "/mnt/d/Personal Projects/Company_Finder"
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: packages install without error.

- [ ] **Step 3: Install Playwright chromium**

```bash
npx playwright install chromium
```

- [ ] **Step 4: Run doctor to verify setup**

```bash
npm run doctor
```

Expected: doctor reports which prerequisites are met. Some items (profile.yml, CV) may be missing — that is fine at this stage. What must not fail: Node.js version check and provider loading.

- [ ] **Step 5: Create the tests directory**

```bash
mkdir -p tests
```

---

## Task 2: Create country configuration and manual portals config

**Files:**
- Create: `config/countries.yml`
- Create: `config/portals.manual.yml`

- [ ] **Step 1: Create config/countries.yml**

```yaml
# config/countries.yml
# Add a new entry here to target an additional country. No code changes needed.
# allow_keywords: fed into location_filter.allow in the generated portals.yml
# search_terms: used by the /company-finder skill's WebSearch discovery queries

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
      - "Hyderabad"
      - "Remote India"
    search_terms:
      - "India"
      - "Bangalore"
```

- [ ] **Step 2: Create config/portals.manual.yml**

```yaml
# config/portals.manual.yml
# Hand-curated companies. Uses career-ops portals.yml tracked_companies format.
# These are merged with auto-discovered companies at scan time.
# Manual entries take precedence over discovered entries with the same slug.
#
# To add a company here instead of via /company-finder add:
#
# tracked_companies:
#   - name: "Adyen"
#     careers_url: "https://www.adyen.com/careers"
#     provider: "greenhouse"
#     slug: "adyen"

tracked_companies: []
```

- [ ] **Step 3: Commit**

```bash
git add config/countries.yml config/portals.manual.yml
git commit -m "feat: add country config and manual portals starter"
```

---

## Task 3: Build store.mjs with tests

**Files:**
- Create: `store.mjs`
- Create: `tests/store.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/store.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBySlug, upsertCompany } from '../store.mjs';

test('findBySlug returns null for empty store', () => {
  assert.equal(findBySlug([], 'stripe'), null);
});

test('findBySlug returns matching entry', () => {
  const store = [{ slug: 'stripe', countries: ['Netherlands'] }];
  assert.deepEqual(findBySlug(store, 'stripe'), { slug: 'stripe', countries: ['Netherlands'] });
});

test('findBySlug returns null when slug not present', () => {
  const store = [{ slug: 'adyen', countries: ['Netherlands'] }];
  assert.equal(findBySlug(store, 'stripe'), null);
});

test('upsertCompany adds new entry with correct shape', () => {
  const store = upsertCompany([], {
    slug: 'stripe',
    company: 'Stripe',
    provider: 'greenhouse',
    careers_url: 'https://stripe.com/jobs',
    country: 'Netherlands',
    source: 'manual',
  });
  assert.equal(store.length, 1);
  assert.equal(store[0].slug, 'stripe');
  assert.deepEqual(store[0].countries, ['Netherlands']);
  assert.equal(store[0].source, 'manual');
  assert.ok(store[0].discovered_at);
});

test('upsertCompany appends new country to existing entry', () => {
  const initial = [{
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://stripe.com/jobs',
    countries: ['Netherlands'], source: 'discovered', discovered_at: '2026-06-03',
  }];
  const store = upsertCompany(initial, {
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://stripe.com/jobs', country: 'United Kingdom', source: 'discovered',
  });
  assert.equal(store.length, 1);
  assert.deepEqual(store[0].countries, ['Netherlands', 'United Kingdom']);
});

test('upsertCompany does not duplicate existing country', () => {
  const initial = [{
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://stripe.com/jobs',
    countries: ['Netherlands'], source: 'discovered', discovered_at: '2026-06-03',
  }];
  const store = upsertCompany(initial, {
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://stripe.com/jobs', country: 'Netherlands', source: 'discovered',
  });
  assert.deepEqual(store[0].countries, ['Netherlands']);
});

test('upsertCompany does not mutate original store', () => {
  const initial = [];
  const result = upsertCompany(initial, {
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://stripe.com/jobs', country: 'Netherlands', source: 'manual',
  });
  assert.equal(initial.length, 0);
  assert.equal(result.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/store.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` or similar — store.mjs does not exist yet.

- [ ] **Step 3: Implement store.mjs**

```javascript
// store.mjs — Pure CRUD for data/discovered-companies.json.
// loadStore/saveStore touch the filesystem; findBySlug/upsertCompany are pure.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const STORE_PATH = 'data/discovered-companies.json';

export function loadStore() {
  if (!existsSync(STORE_PATH)) return [];
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveStore(entries) {
  mkdirSync('data', { recursive: true });
  writeFileSync(STORE_PATH, JSON.stringify(entries, null, 2) + '\n', 'utf-8');
}

export function findBySlug(store, slug) {
  return store.find(e => e.slug === slug) ?? null;
}

export function upsertCompany(store, { slug, company, provider, careers_url, country, source }) {
  const existing = findBySlug(store, slug);
  if (existing) {
    if (!existing.countries.includes(country)) {
      existing.countries.push(country);
    }
    return store;
  }
  return [
    ...store,
    {
      slug,
      company,
      provider,
      careers_url,
      countries: [country],
      source,
      discovered_at: new Date().toISOString().split('T')[0],
    },
  ];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/store.test.mjs
```

Expected: all 6 tests pass with `✓` markers.

- [ ] **Step 5: Commit**

```bash
git add store.mjs tests/store.test.mjs
git commit -m "feat: add store.mjs with full test coverage"
```

---

## Task 4: Build merge-portals.mjs with tests

**Files:**
- Create: `merge-portals.mjs`
- Create: `tests/merge-portals.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/merge-portals.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMergedPortals } from '../merge-portals.mjs';

const twoCountries = {
  countries: [
    {
      name: 'Netherlands',
      allow_keywords: ['Netherlands', 'Amsterdam'],
      search_terms: ['Netherlands'],
    },
    {
      name: 'United Kingdom',
      allow_keywords: ['United Kingdom', 'UK', 'London'],
      search_terms: ['UK'],
    },
  ],
};

test('buildMergedPortals includes title_filter with positive and negative lists', () => {
  const result = buildMergedPortals([], { tracked_companies: [] }, twoCountries);
  assert.ok(result.title_filter.positive.includes('Software Engineer'));
  assert.ok(result.title_filter.positive.includes('Backend Engineer'));
  assert.ok(result.title_filter.negative.includes('Junior'));
  assert.ok(result.title_filter.negative.includes('Intern'));
});

test('buildMergedPortals location_filter.allow contains all allow_keywords from all countries', () => {
  const result = buildMergedPortals([], { tracked_companies: [] }, twoCountries);
  assert.ok(result.location_filter.allow.includes('Netherlands'));
  assert.ok(result.location_filter.allow.includes('Amsterdam'));
  assert.ok(result.location_filter.allow.includes('United Kingdom'));
  assert.ok(result.location_filter.allow.includes('UK'));
  assert.ok(result.location_filter.allow.includes('London'));
});

test('buildMergedPortals includes discovered companies in tracked_companies', () => {
  const store = [{
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://job-boards.greenhouse.io/stripe',
    countries: ['Netherlands'], source: 'discovered', discovered_at: '2026-06-03',
  }];
  const result = buildMergedPortals(store, { tracked_companies: [] }, twoCountries);
  const stripe = result.tracked_companies.find(c => c.slug === 'stripe');
  assert.ok(stripe);
  assert.equal(stripe.name, 'Stripe');
  assert.equal(stripe.provider, 'greenhouse');
});

test('buildMergedPortals includes manual companies in tracked_companies', () => {
  const manual = {
    tracked_companies: [{
      slug: 'adyen', name: 'Adyen',
      careers_url: 'https://www.adyen.com/careers',
      provider: 'greenhouse',
    }],
  };
  const result = buildMergedPortals([], manual, twoCountries);
  const adyen = result.tracked_companies.find(c => c.slug === 'adyen');
  assert.ok(adyen);
});

test('buildMergedPortals manual entry wins over discovered entry with same slug', () => {
  const store = [{
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://job-boards.greenhouse.io/stripe',
    countries: ['Netherlands'], source: 'discovered', discovered_at: '2026-06-03',
  }];
  const manual = {
    tracked_companies: [{
      slug: 'stripe', name: 'Stripe (manual)',
      careers_url: 'https://stripe.com/jobs',
      provider: 'greenhouse',
    }],
  };
  const result = buildMergedPortals(store, manual, twoCountries);
  const stripes = result.tracked_companies.filter(c => c.slug === 'stripe');
  assert.equal(stripes.length, 1);
  assert.equal(stripes[0].careers_url, 'https://stripe.com/jobs');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/merge-portals.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` — merge-portals.mjs does not exist yet.

- [ ] **Step 3: Implement merge-portals.mjs**

```javascript
// merge-portals.mjs — Generates data/portals-merged.yml from:
//   1. data/discovered-companies.json
//   2. config/portals.manual.yml
//   3. config/countries.yml (location_filter + title_filter)
//
// Manual entries take precedence over discovered entries with the same slug.
// Run as script: node merge-portals.mjs  → writes data/portals-merged.yml

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { loadStore } from './store.mjs';

const COUNTRIES_PATH = 'config/countries.yml';
const MANUAL_PATH = 'config/portals.manual.yml';
export const MERGED_OUTPUT_PATH = 'data/portals-merged.yml';

const TITLE_FILTER = {
  positive: [
    'Software Engineer',
    'Backend Engineer',
    'Full Stack',
    'Frontend Engineer',
    'Platform Engineer',
    'DevOps',
    'Site Reliability',
    'SRE',
    'Data Engineer',
    'Cloud Engineer',
    'Infrastructure Engineer',
    'Engineering Manager',
    'Staff Engineer',
    'Principal Engineer',
    'Solutions Engineer',
    'AI Engineer',
    'ML Engineer',
  ],
  negative: [
    'Junior',
    'Intern',
    'iOS',
    'Android',
    'Embedded',
    '.NET',
    'PHP',
    'QA',
    'Test Engineer',
  ],
};

function buildLocationFilter(countries) {
  const allow = countries.flatMap(c => c.allow_keywords);
  return { allow };
}

function storeEntryToPortalEntry(entry) {
  return {
    name: entry.company,
    careers_url: entry.careers_url,
    provider: entry.provider,
    slug: entry.slug,
    enabled: true,
  };
}

export function buildMergedPortals(store, manualConfig, countriesConfig) {
  const manualCompanies = manualConfig?.tracked_companies ?? [];
  const manualSlugs = new Set(manualCompanies.map(c => c.slug));
  const discoveredCompanies = store
    .map(storeEntryToPortalEntry)
    .filter(c => !manualSlugs.has(c.slug));

  return {
    title_filter: TITLE_FILTER,
    location_filter: buildLocationFilter(countriesConfig.countries),
    tracked_companies: [...manualCompanies, ...discoveredCompanies],
  };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const store = loadStore();
  const manualConfig = existsSync(MANUAL_PATH)
    ? yaml.load(readFileSync(MANUAL_PATH, 'utf-8'))
    : { tracked_companies: [] };
  const countriesConfig = yaml.load(readFileSync(COUNTRIES_PATH, 'utf-8'));

  const merged = buildMergedPortals(store, manualConfig, countriesConfig);
  writeFileSync(MERGED_OUTPUT_PATH, yaml.dump(merged), 'utf-8');
  console.log(`Merged portals written to ${MERGED_OUTPUT_PATH}`);
  console.log(`  ${merged.tracked_companies.length} companies total`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/merge-portals.test.mjs
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add merge-portals.mjs tests/merge-portals.test.mjs
git commit -m "feat: add merge-portals.mjs with full test coverage"
```

---

## Task 5: Build discover.mjs CLI with tests

**Files:**
- Create: `discover.mjs`
- Create: `tests/discover.test.mjs`

- [ ] **Step 1: Write the failing tests**

Create `tests/discover.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveAtsUrl, extractSlugFromUrl, inferProviderFromUrl } from '../discover.mjs';

test('deriveAtsUrl returns greenhouse boards URL', () => {
  assert.equal(
    deriveAtsUrl('stripe', 'greenhouse'),
    'https://job-boards.greenhouse.io/stripe'
  );
});

test('deriveAtsUrl returns ashby jobs URL', () => {
  assert.equal(
    deriveAtsUrl('linear', 'ashby'),
    'https://jobs.ashbyhq.com/linear'
  );
});

test('deriveAtsUrl returns lever jobs URL', () => {
  assert.equal(
    deriveAtsUrl('vercel', 'lever'),
    'https://jobs.lever.co/vercel'
  );
});

test('extractSlugFromUrl extracts from ashby URL', () => {
  assert.equal(
    extractSlugFromUrl('https://jobs.ashbyhq.com/linear/abc-123'),
    'linear'
  );
});

test('extractSlugFromUrl extracts from greenhouse URL', () => {
  assert.equal(
    extractSlugFromUrl('https://job-boards.greenhouse.io/stripe/jobs/12345'),
    'stripe'
  );
});

test('extractSlugFromUrl extracts from lever URL', () => {
  assert.equal(
    extractSlugFromUrl('https://jobs.lever.co/vercel/abc-123'),
    'vercel'
  );
});

test('inferProviderFromUrl detects ashby', () => {
  assert.equal(
    inferProviderFromUrl('https://jobs.ashbyhq.com/linear/abc'),
    'ashby'
  );
});

test('inferProviderFromUrl detects greenhouse', () => {
  assert.equal(
    inferProviderFromUrl('https://job-boards.greenhouse.io/stripe'),
    'greenhouse'
  );
});

test('inferProviderFromUrl detects lever', () => {
  assert.equal(
    inferProviderFromUrl('https://jobs.lever.co/vercel'),
    'lever'
  );
});

test('inferProviderFromUrl returns null for unknown domain', () => {
  assert.equal(
    inferProviderFromUrl('https://careers.example.com/jobs/123'),
    null
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
node --test tests/discover.test.mjs
```

Expected: `ERR_MODULE_NOT_FOUND` — discover.mjs does not exist yet.

- [ ] **Step 3: Implement discover.mjs**

```javascript
#!/usr/bin/env node
// discover.mjs — CLI for managing data/discovered-companies.json
//
// Commands:
//   node discover.mjs list
//   node discover.mjs add --slug <slug> --provider <provider> --country <country>
//                         [--company <name>] [--url <url>] [--source manual|discovered]
//                         [--liveness-check] [--dry-run]
//   node discover.mjs check --slug <slug>
//
// Pure helper functions (deriveAtsUrl, extractSlugFromUrl, inferProviderFromUrl)
// are named exports for use by tests and the skill.

import { fileURLToPath } from 'url';
import { loadStore, saveStore, upsertCompany, findBySlug } from './store.mjs';

// ── Pure helpers (exported for tests) ───────────────────────────────────────

const ATS_URL_PATTERNS = {
  greenhouse: slug => `https://job-boards.greenhouse.io/${slug}`,
  ashby:      slug => `https://jobs.ashbyhq.com/${slug}`,
  lever:      slug => `https://jobs.lever.co/${slug}`,
  workable:   slug => `https://apply.workable.com/${slug}`,
  recruitee:  slug => `https://${slug}.recruitee.com`,
  smartrecruiters: slug => `https://jobs.smartrecruiters.com/${slug}`,
};

const URL_TO_PROVIDER = [
  { pattern: /jobs\.ashbyhq\.com/, provider: 'ashby' },
  { pattern: /job-boards(?:\.eu)?\.greenhouse\.io/, provider: 'greenhouse' },
  { pattern: /boards\.greenhouse\.io/, provider: 'greenhouse' },
  { pattern: /jobs\.lever\.co/, provider: 'lever' },
  { pattern: /apply\.workable\.com/, provider: 'workable' },
  { pattern: /\.recruitee\.com/, provider: 'recruitee' },
  { pattern: /jobs\.smartrecruiters\.com/, provider: 'smartrecruiters' },
];

export function deriveAtsUrl(slug, provider) {
  return ATS_URL_PATTERNS[provider]?.(slug) ?? null;
}

export function inferProviderFromUrl(url) {
  for (const { pattern, provider } of URL_TO_PROVIDER) {
    if (pattern.test(url)) return provider;
  }
  return null;
}

export function extractSlugFromUrl(url) {
  const { pathname } = new URL(url);
  return pathname.split('/').filter(Boolean)[0] ?? null;
}

// ── Liveness check ───────────────────────────────────────────────────────────

const LIVENESS_API = {
  greenhouse: slug =>
    fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`, { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then(d => Array.isArray(d?.jobs)),
  ashby: slug =>
    fetch('https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operationName: 'ApiJobBoardWithTeams',
        variables: { organizationHostedJobsPageName: slug },
        query: 'query ApiJobBoardWithTeams($organizationHostedJobsPageName:String!){jobBoard:jobBoardWithTeams(organizationHostedJobsPageName:$organizationHostedJobsPageName){teams{parentTeamId id name jobPostings{id}}}}',
      }),
      signal: AbortSignal.timeout(6000),
    })
      .then(r => r.json())
      .then(d => d?.data?.jobBoard !== null),
  lever: slug =>
    fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`, { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then(d => Array.isArray(d)),
};

async function checkLiveness(slug, provider) {
  const checker = LIVENESS_API[provider];
  if (!checker) return true; // no liveness check for this provider, assume alive
  try {
    return await checker(slug);
  } catch {
    return false;
  }
}

// ── CLI ───────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const command = args[0];

  function getFlag(flag) {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] ?? null : null;
  }

  function hasFlag(flag) {
    return args.includes(flag);
  }

  if (command === 'list') {
    const store = loadStore();
    if (store.length === 0) {
      console.log('No companies in store.');
    } else {
      for (const e of store) {
        console.log(`${e.slug} [${e.provider}] countries: ${e.countries.join(', ')} (${e.source})`);
      }
    }

  } else if (command === 'add') {
    const slug     = getFlag('--slug');
    const provider = getFlag('--provider');
    const country  = getFlag('--country');
    const company  = getFlag('--company') ?? slug;
    const source   = getFlag('--source') ?? 'manual';
    const url      = getFlag('--url') ?? deriveAtsUrl(slug, provider);
    const dryRun   = hasFlag('--dry-run');
    const liveness = hasFlag('--liveness-check');

    if (!slug || !provider || !country) {
      console.error('Usage: discover.mjs add --slug <slug> --provider <provider> --country <country>');
      console.error('  Optional: --company <name> --url <url> --source manual|discovered --liveness-check --dry-run');
      process.exit(1);
    }

    if (liveness) {
      const alive = await checkLiveness(slug, provider);
      if (!alive) {
        console.warn(`⚠  Liveness check failed for ${slug} (${provider}) — skipping.`);
        process.exit(0);
      }
    }

    const store = loadStore();
    const alreadyExists = findBySlug(store, slug) !== null;

    if (dryRun) {
      if (alreadyExists) {
        console.log(`[dry-run] Would append "${country}" to existing entry: ${slug}`);
      } else {
        console.log(`[dry-run] Would add new entry: ${slug} [${provider}] — ${country}`);
      }
      process.exit(0);
    }

    const updated = upsertCompany(store, { slug, company, provider, careers_url: url, country, source });
    saveStore(updated);

    if (alreadyExists) {
      console.log(`Updated: appended "${country}" to ${slug}`);
    } else {
      console.log(`Added: ${slug} [${provider}] — ${country}`);
    }

  } else if (command === 'check') {
    const slug = getFlag('--slug');
    if (!slug) {
      console.error('Usage: discover.mjs check --slug <slug>');
      process.exit(1);
    }
    const store = loadStore();
    const entry = findBySlug(store, slug);
    if (entry) {
      console.log(JSON.stringify(entry, null, 2));
    } else {
      console.log(`Not found: ${slug}`);
      process.exit(1);
    }

  } else {
    console.error('Commands: list | add | check');
    process.exit(1);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test tests/discover.test.mjs
```

Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add discover.mjs tests/discover.test.mjs
git commit -m "feat: add discover.mjs CLI with test coverage"
```

---

## Task 6: Write the /company-finder skill

**Files:**
- Create: `.claude/skills/company-finder.md`

- [ ] **Step 1: Create the skills directory**

```bash
mkdir -p .claude/skills
```

- [ ] **Step 2: Create .claude/skills/company-finder.md**

```markdown
# /company-finder — Country-Aware Job Scanner

Skill for scanning Software Engineering jobs across Netherlands, UK, Dubai, and India.
All commands run from the Company_Finder project root.

---

## /company-finder scan

Full discovery and scan pipeline. Zero LLM tokens until pipeline is called.

### Step 1 — Discover new companies via WebSearch

Read `config/countries.yml` to get countries and their `search_terms`.

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
1. Call `inferProviderFromUrl(url)` pattern — the URL domain reveals the provider:
   - `jobs.ashbyhq.com` → ashby
   - `job-boards.greenhouse.io` → greenhouse
   - `jobs.lever.co` → lever
2. Extract the slug: first path segment after the domain (e.g. `stripe` from `jobs.ashbyhq.com/stripe/...`)
3. Run:
   ```bash
   node discover.mjs add --slug <slug> --provider <provider> --country "<country_name>" --source discovered --liveness-check
   ```
4. Count: new entries added vs already known (check exit output)

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
⚠  Netherlands: no WebSearch results returned — check your search terms or connectivity
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
3. Run the career-ops evaluation rubric (same as `/career-ops` command):
   - **Role summary:** Company overview, role type, key responsibilities
   - **CV match:** Score 1-5 across 10 weighted dimensions (skills match, level fit, domain fit, growth potential, culture signals, compensation alignment, location/remote, tech stack, team size fit, mission alignment)
   - **Overall score:** Weighted average, letter grade A-F
   - **Level strategy:** Seniority positioning notes
   - **Compensation research:** Estimated band for this role and location
   - **Personalization hooks:** 2-3 specific things to mention in cover letter or intro
   - **Interview prep:** 3 STAR+Reflection stories mapped to likely interview questions
4. Append the evaluation block to `data/pipeline.md` beneath the job's checkbox entry, formatted as:

```markdown
**Score: X.X/5 (Grade)**
*Evaluated: YYYY-MM-DD*

<evaluation content>
```

---

## /company-finder pipeline --batch

Evaluate all unevaluated jobs in `data/pipeline.md` in parallel using sub-agents.

An unevaluated job is a checkbox line (`- [ ] ...`) that has no evaluation block (no `**Score:**` line) immediately following it.

Dispatch one sub-agent per unevaluated job using `claude -p` with the job URL and profile. Collect results and append to pipeline.md.

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
```

- [ ] **Step 3: Verify the skill file is readable**

```bash
head -5 .claude/skills/company-finder.md
```

Expected: shows the first few lines of the skill markdown.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/company-finder.md
git commit -m "feat: add /company-finder skill definition"
```

---

## Task 7: Initialize data store and update .gitignore

**Files:**
- Create: `data/discovered-companies.json`
- Modify: `.gitignore`

- [ ] **Step 1: Initialize empty discovered-companies.json**

```bash
mkdir -p data
echo '[]' > data/discovered-companies.json
```

- [ ] **Step 2: Add portals-merged.yml to .gitignore**

Open `.gitignore` (which exists from the career-ops clone) and append:

```
# Company Finder — generated at scan time, not committed
data/portals-merged.yml
```

- [ ] **Step 3: Run all tests to confirm nothing is broken**

```bash
node --test tests/store.test.mjs && node --test tests/merge-portals.test.mjs && node --test tests/discover.test.mjs
```

Expected: all tests pass across all three suites.

- [ ] **Step 4: Smoke test — add a company manually and verify**

```bash
node discover.mjs add --slug stripe --provider greenhouse --country "Netherlands" --dry-run
```

Expected output:
```
[dry-run] Would add new entry: stripe [greenhouse] — Netherlands
```

```bash
node discover.mjs add --slug stripe --provider greenhouse --country "Netherlands"
node discover.mjs list
```

Expected:
```
stripe [greenhouse] countries: Netherlands (manual)
```

- [ ] **Step 5: Smoke test — generate merged portals**

```bash
node merge-portals.mjs
cat data/portals-merged.yml
```

Expected: YAML file with `title_filter`, `location_filter` (containing Netherlands, UK, Dubai, India keywords), and `tracked_companies` with the stripe entry.

- [ ] **Step 6: Clean up smoke test data**

```bash
echo '[]' > data/discovered-companies.json
```

- [ ] **Step 7: Commit**

```bash
git add data/discovered-companies.json .gitignore
git commit -m "feat: initialize data store and update gitignore"
```

---

## Task 8: Create profile from template and run doctor

**Files:**
- Create: `config/profile.yml` (from template, with user's details)

- [ ] **Step 1: Copy profile template**

```bash
cp config/profile.example.yml config/profile.yml
```

- [ ] **Step 2: Open profile.yml and fill in the following minimum fields**

Edit `config/profile.yml`:
- `candidate.full_name`
- `candidate.email`
- `target_roles.primary` — set to `["Software Engineer", "Backend Engineer"]` (adjust as needed)
- `location.country` — set to the country you are based in
- `compensation.currency` — set to your preferred currency

Leave other fields at their example values for now; the system will work with partial data.

- [ ] **Step 3: Run doctor to check overall setup**

```bash
npm run doctor
```

Review the output. The scanner (Task 1-7 work) does not require PDF generation or Playwright beyond initial install.

- [ ] **Step 4: Commit profile (add to .gitignore first if it contains personal data)**

If you want to keep your profile private, add it to `.gitignore`:
```
config/profile.yml
```

Then commit the gitignore update:
```bash
git add .gitignore
git commit -m "chore: gitignore profile.yml (contains personal data)"
```

---

## Self-Review Checklist

**Spec coverage:**

| Spec requirement | Task |
|---|---|
| Fresh clone of career-ops | Task 1 |
| config/countries.yml with extensible country structure | Task 2 |
| config/portals.manual.yml for hand-curated companies | Task 2 |
| data/discovered-companies.json keyed by slug with countries array | Task 3 |
| upsert dedup: appends country, never duplicates | Task 3 |
| merge-portals.mjs: discovered + manual merge, manual wins | Task 4 |
| title_filter: broad Software Engineering | Task 4 |
| location_filter derived from countries.yml allow_keywords | Task 4 |
| discover.mjs: add/list/check CLI | Task 5 |
| --liveness-check flag on add | Task 5 |
| --source flag (manual vs discovered) | Task 5 |
| --dry-run flag | Task 5 |
| /company-finder scan skill | Task 6 |
| /company-finder scan --discover-only | Task 6 |
| /company-finder pipeline \<url\> | Task 6 |
| /company-finder pipeline --batch | Task 6 |
| /company-finder add command | Task 6 |
| Error handling for missing profile.yml | Task 6 |
| data/portals-merged.yml gitignored | Task 7 |
| Smoke test end-to-end | Task 7 |
| profile.yml setup | Task 8 |

All spec requirements are covered.
