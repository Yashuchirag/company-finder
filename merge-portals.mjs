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
