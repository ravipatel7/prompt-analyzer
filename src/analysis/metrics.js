'use strict';

const { calculateCost, calculateUncachedCost } = require('./pricing');

function formatDate(ts) {
  return new Date(ts).toISOString().split('T')[0];
}

function computeMetrics(messages) {
  const byModel = {};
  const byDate = {};
  const byProject = {};

  let totalCacheRead = 0;
  let totalCacheCreation = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCost = 0;
  let totalUncachedCost = 0;

  const verbosityRatios = [];
  const sessions = new Set();
  const userMessages = [];

  let firstTs = Infinity;
  let lastTs = 0;

  for (const msg of messages) {
    if (msg.timestamp < firstTs) firstTs = msg.timestamp;
    if (msg.timestamp > lastTs) lastTs = msg.timestamp;

    if (msg.type === 'user') {
      sessions.add(msg.sessionId);
      // Only track human-typed prompts (not tool results) for verbosity/clustering
      if (msg.isHumanPrompt) userMessages.push(msg);
      continue;
    }

    if (msg.type !== 'assistant') continue;

    const { model, usage } = msg;
    const dateKey = formatDate(msg.timestamp);
    const cost = calculateCost(usage, model);
    const uncachedCost = calculateUncachedCost(usage, model);

    totalCacheRead += usage.cache_read_input_tokens;
    totalCacheCreation += usage.cache_creation_input_tokens;
    totalInput += usage.input_tokens;
    totalOutput += usage.output_tokens;
    totalCost += cost;
    totalUncachedCost += uncachedCost;

    if (usage.input_tokens > 0 && usage.output_tokens > 0) {
      const totalIn = usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
      verbosityRatios.push(totalIn / usage.output_tokens);
    }

    // By model
    if (!byModel[model]) {
      byModel[model] = {
        model,
        inputTokens: 0, cacheCreation: 0, cacheRead: 0, outputTokens: 0,
        cost: 0, uncachedCost: 0, messageCount: 0,
      };
    }
    byModel[model].inputTokens += usage.input_tokens;
    byModel[model].cacheCreation += usage.cache_creation_input_tokens;
    byModel[model].cacheRead += usage.cache_read_input_tokens;
    byModel[model].outputTokens += usage.output_tokens;
    byModel[model].cost += cost;
    byModel[model].uncachedCost += uncachedCost;
    byModel[model].messageCount++;

    // By date
    if (!byDate[dateKey]) {
      byDate[dateKey] = { date: dateKey, inputTokens: 0, cacheCreation: 0, cacheRead: 0, outputTokens: 0, cost: 0 };
    }
    byDate[dateKey].inputTokens += usage.input_tokens;
    byDate[dateKey].cacheCreation += usage.cache_creation_input_tokens;
    byDate[dateKey].cacheRead += usage.cache_read_input_tokens;
    byDate[dateKey].outputTokens += usage.output_tokens;
    byDate[dateKey].cost += cost;

    // By project
    const pk = msg.projectKey;
    if (!byProject[pk]) {
      byProject[pk] = { projectKey: pk, inputTokens: 0, cacheCreation: 0, cacheRead: 0, outputTokens: 0, cost: 0 };
    }
    byProject[pk].inputTokens += usage.input_tokens;
    byProject[pk].cacheCreation += usage.cache_creation_input_tokens;
    byProject[pk].cacheRead += usage.cache_read_input_tokens;
    byProject[pk].outputTokens += usage.output_tokens;
    byProject[pk].cost += cost;
  }

  const totalEffectiveInput = totalInput + totalCacheCreation + totalCacheRead;
  const cacheHitRatio = totalEffectiveInput > 0
    ? totalCacheRead / totalEffectiveInput
    : 0;

  // Verbosity percentiles
  verbosityRatios.sort((a, b) => a - b);
  const avgVerbosity = verbosityRatios.length > 0
    ? verbosityRatios.reduce((s, v) => s + v, 0) / verbosityRatios.length
    : 0;
  const p95idx = Math.floor(verbosityRatios.length * 0.95);
  const verbosityP95 = verbosityRatios[p95idx] || 0;

  // Prompt character lengths — pre-compute histogram to avoid serializing raw array
  const rawLengths = userMessages
    .map(m => m.promptText.length)
    .filter(l => l > 0)
    .sort((a, b) => a - b);
  const promptP95 = rawLengths[Math.floor(rawLengths.length * 0.95)] || 0;
  const longPromptCount = rawLengths.filter(l => l > promptP95).length;

  const histMax = rawLengths[rawLengths.length - 1] || 1;
  const bucketSize = Math.ceil(histMax / 10) || 1;
  const promptHistogram = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * bucketSize}–${(i + 1) * bucketSize}`,
    count: rawLengths.filter(l => l >= i * bucketSize && l < (i + 1) * bucketSize).length,
  }));

  // Sorted arrays for charts
  const datesSorted = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
  const modelsSorted = Object.values(byModel).sort((a, b) => b.cost - a.cost);
  const projectsSorted = Object.values(byProject).sort((a, b) => b.cost - a.cost).slice(0, 10);

  return {
    summary: {
      totalSessions: sessions.size,
      totalUserPrompts: userMessages.length,
      totalAssistantMessages: messages.filter(m => m.type === 'assistant').length,
      dateRange: {
        first: firstTs === Infinity ? null : new Date(firstTs).toISOString(),
        last: lastTs === 0 ? null : new Date(lastTs).toISOString(),
      },
      modelsUsed: Object.keys(byModel),
      totalCost: totalCost,
      totalUncachedCost: totalUncachedCost,
      cacheSavingsUSD: totalUncachedCost - totalCost,
    },
    tokens: {
      totalInput,
      totalCacheCreation,
      totalCacheRead,
      totalOutput,
      totalEffectiveInput,
    },
    cacheMetrics: {
      hitRatio: cacheHitRatio,
      hitPercent: Math.round(cacheHitRatio * 100),
      cacheReadTokens: totalCacheRead,
      cacheMissTokens: totalInput + totalCacheCreation,
    },
    verbosity: {
      avgRatio: avgVerbosity,
      p95Ratio: verbosityP95,
      avgPromptLength: rawLengths.length > 0
        ? Math.round(rawLengths.reduce((s, l) => s + l, 0) / rawLengths.length)
        : 0,
      longPromptThreshold: promptP95,
      longPromptCount,
      promptHistogram,
    },
    byModel: modelsSorted,
    byDate: datesSorted,
    byProject: projectsSorted,
    userMessages,
  };
}

module.exports = { computeMetrics };
