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
