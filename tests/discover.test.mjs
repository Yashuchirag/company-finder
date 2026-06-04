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
