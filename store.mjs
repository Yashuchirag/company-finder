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
