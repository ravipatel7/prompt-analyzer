'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculateCost, calculateUncachedCost, resolvePricing } = require('./pricing');

test('resolvePricing: exact match', () => {
  const p = resolvePricing('claude-sonnet-4-6');
  assert.equal(p.input, 3.00);
  assert.equal(p.output, 15.00);
});

test('resolvePricing: prefix match for dated model', () => {
  const p = resolvePricing('claude-haiku-4-5-20251001');
  assert.equal(p.input, 0.80);
  assert.equal(p.output, 4.00);
});

test('resolvePricing: unknown model returns default', () => {
  const p = resolvePricing('claude-unknown-model');
  assert.equal(p.input, 3.00);
});

test('calculateCost: sonnet with only output tokens', () => {
  const usage = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1000000 };
  const cost = calculateCost(usage, 'claude-sonnet-4-6');
  assert.equal(cost, 15.00);
});

test('calculateCost: cache read is cheaper than input', () => {
  const base = { input_tokens: 1000000, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 };
  const cached = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000000, output_tokens: 0 };
  assert(calculateCost(base, 'claude-sonnet-4-6') > calculateCost(cached, 'claude-sonnet-4-6'));
});

test('calculateUncachedCost: treats all input as direct', () => {
  const usage = { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000000, output_tokens: 0 };
  const uncached = calculateUncachedCost(usage, 'claude-sonnet-4-6');
  assert.equal(uncached, 3.00); // 1M tokens × $3/MTok
});
