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

test('upsertCompany does not mutate existing entry when adding country', () => {
  const initial = [{
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://stripe.com/jobs',
    countries: ['Netherlands'], source: 'discovered', discovered_at: '2026-06-03',
  }];
  const originalCountries = initial[0].countries;
  upsertCompany(initial, {
    slug: 'stripe', company: 'Stripe', provider: 'greenhouse',
    careers_url: 'https://stripe.com/jobs', country: 'United Kingdom', source: 'discovered',
  });
  assert.deepEqual(originalCountries, ['Netherlands']);
});
