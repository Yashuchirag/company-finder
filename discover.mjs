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
  if (!checker) return true;
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
