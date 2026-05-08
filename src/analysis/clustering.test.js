'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { tokenize, jaccardSimilarity, clusterPrompts } = require('./clustering');

test('tokenize: lowercases and removes punctuation', () => {
  const set = tokenize('Hello, World! How are you?');
  assert(set.has('hello'));
  assert(set.has('world'));
  assert(!set.has('hello,'));
});

test('tokenize: filters words of 2 chars or fewer', () => {
  const set = tokenize('a to big word');
  assert(!set.has('a'));
  assert(!set.has('to'));
  assert(set.has('big'));
  assert(set.has('word'));
});

test('jaccardSimilarity: identical sets = 1', () => {
  const s = new Set(['a', 'b', 'c']);
  assert.equal(jaccardSimilarity(s, s), 1);
});

test('jaccardSimilarity: disjoint sets = 0', () => {
  const a = new Set(['x', 'y']);
  const b = new Set(['m', 'n']);
  assert.equal(jaccardSimilarity(a, b), 0);
});

test('jaccardSimilarity: partial overlap', () => {
  const a = new Set(['a', 'b', 'c']);
  const b = new Set(['b', 'c', 'd']);
  const sim = jaccardSimilarity(a, b);
  assert(sim > 0 && sim < 1);
  assert.equal(sim, 2 / 4); // intersection=2, union=4
});

test('clusterPrompts: identical prompts form one cluster', () => {
  const prompts = Array(5).fill('fix the bug in the authentication module');
  const clusters = clusterPrompts(prompts, 0.6);
  assert(clusters.length >= 1);
  assert(clusters[0].count >= 2);
});

test('clusterPrompts: completely different prompts form no clusters', () => {
  const prompts = [
    'write unit tests for authentication',
    'deploy the application server now',
    'refactor database queries performance',
    'add dark mode css styling',
    'configure nginx reverse proxy settings',
  ];
  const clusters = clusterPrompts(prompts, 0.8);
  assert.equal(clusters.length, 0);
});
