'use strict';

const PRICING = {
  'claude-opus-4-7':   { input: 15.00, cacheWrite: 18.75, cacheRead: 1.50,  output: 75.00 },
  'claude-opus-4-6':   { input: 15.00, cacheWrite: 18.75, cacheRead: 1.50,  output: 75.00 },
  'claude-sonnet-4-6': { input: 3.00,  cacheWrite: 3.75,  cacheRead: 0.30,  output: 15.00 },
  'claude-sonnet-4-5': { input: 3.00,  cacheWrite: 3.75,  cacheRead: 0.30,  output: 15.00 },
  'claude-haiku-4-5':  { input: 0.80,  cacheWrite: 1.00,  cacheRead: 0.08,  output: 4.00  },
};

const DEFAULT_PRICING = { input: 3.00, cacheWrite: 3.75, cacheRead: 0.30, output: 15.00 };

function resolvePricing(model) {
  if (!model) return DEFAULT_PRICING;
  for (const key of Object.keys(PRICING)) {
    if (model.startsWith(key)) return PRICING[key];
  }
  return DEFAULT_PRICING;
}

function calculateCost(usage, model) {
  const p = resolvePricing(model);
  return (
    ((usage.input_tokens || 0) / 1e6) * p.input +
    ((usage.cache_creation_input_tokens || 0) / 1e6) * p.cacheWrite +
    ((usage.cache_read_input_tokens || 0) / 1e6) * p.cacheRead +
    ((usage.output_tokens || 0) / 1e6) * p.output
  );
}

function calculateUncachedCost(usage, model) {
  const p = resolvePricing(model);
  const totalInputTokens =
    (usage.input_tokens || 0) +
    (usage.cache_creation_input_tokens || 0) +
    (usage.cache_read_input_tokens || 0);
  return (totalInputTokens / 1e6) * p.input + ((usage.output_tokens || 0) / 1e6) * p.output;
}

module.exports = { resolvePricing, calculateCost, calculateUncachedCost, PRICING };
