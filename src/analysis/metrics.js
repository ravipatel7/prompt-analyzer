'use strict';

const { calculateCost, calculateUncachedCost } = require('./pricing');

function formatDate(ts) {
  return new Date(ts).toISOString().split('T')[0];
}

// ─── Prompting quality scoring ────────────────────────────────────────────────
// Dimensions mapped to Anthropic's prompting best practices guide:
//   1. Directness  — clear action verb, specific ask
//   2. Context     — background / motivation provided
//   3. Examples    — few-shot samples, code blocks, reference material
//   4. Structure   — XML tags, lists, organised layout
//   5. Output Spec — format, constraints, completion criteria

const ACTION_VERBS = new Set([
  'create','write','add','fix','implement','update','remove','delete','refactor',
  'analyze','analyse','review','check','explain','generate','build','make','run',
  'test','debug','find','get','show','list','format','convert','parse','extract',
  'summarize','summarise','describe','compare','improve','optimize','optimise',
  'change','modify','rename','move','copy','setup','configure','install','deploy',
  'read','edit','replace','insert','append','define','document','draft',
  'rewrite','translate','search','open','close','save','calculate','compute',
]);

function scorePrompt(text) {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/);
  const len = text.length;

  // 1. Directness (0–25)
  let directness = 0;
  if (ACTION_VERBS.has(words[0])) directness = 25;
  else if (words.slice(0, 3).some(w => ACTION_VERBS.has(w))) directness = 16;
  else if (/^(can you|please|could you|would you)\s+\w/i.test(lower) && len > 30) directness = 8;

  // 2. Context (0–20)
  let context = 0;
  const ctxMarkers = ['context:', 'background:', 'because ', 'since ', "i'm trying",
    'i am trying', 'the goal', 'this is for', 'currently ', 'the issue is',
    'the problem is', 'the error is', 'note:', 'i need to'];
  if (ctxMarkers.some(m => lower.includes(m))) context = 20;
  else if (len > 200) context = 12;
  else if (len > 80) context = 6;

  // 3. Examples (0–15)
  let examples = 0;
  if (/for example|e\.g\.|<example|like this:|sample:/i.test(lower)) examples = 15;
  else if (/```[\s\S]*?```/.test(text)) examples = 12;
  else if (/:\s*\n/.test(text) && len > 100) examples = 5;

  // 4. Structure (0–20)
  let structure = 0;
  if (/<[a-z_-]+>/.test(text)) structure = 20;
  else if (/^\s*\d+[.)]\s/m.test(text)) structure = 16;
  else if (/^\s*[-*•]\s/m.test(text)) structure = 14;
  else if (text.includes('\n')) structure = 8;
  else if (/:\s/.test(text) && len > 50) structure = 4;

  // 5. Output specification (0–20)
  let outputSpec = 0;
  const outMarkers = [
    'as json','in json','as markdown','as a list','as a table','in a table',
    'bullet points','numbered list','step by step','step-by-step','output:',
    'return a','return the','format:','do not ','make sure ','must ','only ','without ','ensure ',
  ];
  outputSpec = Math.min(outMarkers.filter(m => lower.includes(m)).length * 7, 20);

  return { total: directness + context + examples + structure + outputSpec,
           directness, context, examples, structure, outputSpec };
}

function computePromptingAnalysis(scoredEntries, textExamples) {
  const eligible = scoredEntries.filter(s => s.text && s.text.length > 0);
  if (!eligible.length) return null;
  const totals = eligible.map(s => s.total);
  const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);

  const gradeBase = avg >= 70 ? 'A' : avg >= 50 ? 'B' : avg >= 30 ? 'C' : avg >= 15 ? 'D' : 'F';
  const mod = avg % 15;
  const suffix = gradeBase === 'F' ? '' : mod >= 11 ? '+' : mod <= 4 ? '−' : '';

  const dimDefs = [
    { key: 'directness', label: 'Directness', tip: 'Starts with action verb, specific ask',       max: 25 },
    { key: 'context',    label: 'Context',    tip: 'Background / motivation provided',             max: 20 },
    { key: 'examples',   label: 'Examples',   tip: 'Few-shot samples, code blocks',               max: 15 },
    { key: 'structure',  label: 'Structure',  tip: 'XML tags, numbered / bullet lists',           max: 20 },
    { key: 'outputSpec', label: 'Output Spec',tip: 'Format, constraints, completion criteria',    max: 20 },
  ];

  const dimensions = dimDefs.map(d => ({
    ...d,
    score: Math.round(eligible.reduce((s, r) => s + r[d.key], 0) / eligible.length),
    pct: Math.round(eligible.reduce((s, r) => s + r[d.key], 0) / eligible.length / d.max * 100),
  }));

  const histogram = [0, 20, 40, 60, 80].map((lo) => ({
    range: lo === 0 ? '0–20' : `${lo + 1}–${lo + 20}`,
    count: totals.filter(s => s >= lo && s <= lo + 20).length,
  }));

  const withText = (textExamples || []).map((m, i) => ({ ...eligible[i], text: m }))
    .filter(s => s.text);
  const sorted = withText.length ? [...withText].sort((a, b) => b.total - a.total) : [];

  function pickDistinct(arr, n) {
    const seen = new Set();
    const out = [];
    for (const s of arr) {
      const key = s.text.slice(0, 60).replace(/\s+/g, ' ').trim().toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ text: s.text.slice(0, 220).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim(), score: s.total });
        if (out.length >= n) break;
      }
    }
    return out;
  }

  const topExamples  = pickDistinct(sorted, 3);
  const weakExamples = pickDistinct([...sorted].reverse(), 3);

  const lengths = eligible.map(s => s.text.length).filter(l => l > 0);
  const avgPromptLength = lengths.length ? Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) : 0;

  return {
    avgScore: avg,
    grade: gradeBase + suffix,
    counted: eligible.length,
    histogram,
    dimensions,
    topExamples,
    weakExamples,
    avgPromptLength,
  };
}

// ─── Interaction patterns ─────────────────────────────────────────────────────

function classifyInteraction(text) {
  const t = text.trim();
  const lo = t.toLowerCase();
  if (t.length < 60 && /^(stop|cancel|wait|hold on|pause|undo|revert|abort)/i.test(t)) return 'interruption';
  if (t.length < 100 && /^(continue|proceed|go on|keep going|next|do it|yes|ok|looks good|perfect|done|great|sounds good|go ahead|lgtm)/i.test(t)) return 'continuation';
  if (/^(what|how|why|when|where|which|who|can you|could you|is |are |does |do you|will you|would you)/i.test(lo)) return 'question';
  if (/make it (shorter|longer|simpler|more concise|clearer|briefer|terser)|format (it|this|as|the)|use (markdown|json|a table|bullet|numbered|xml|yaml)|reformat|restructure|as a (list|table|json|csv)|output (as|in)/i.test(lo)) return 'formatChange';
  if (ACTION_VERBS.has(lo.split(/\s+/)[0])) return 'directive';
  return 'clarification';
}

function computeInteractionPatterns(userMessages) {
  const counts = { directive: 0, question: 0, continuation: 0, formatChange: 0, clarification: 0, interruption: 0 };
  for (const m of userMessages) {
    if (!m.promptText.trim()) continue;
    counts[classifyInteraction(m.promptText)]++;
  }
  return counts;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function computeMetrics(messages) {
  const byModel = {};
  const byDate = {};
  const byProject = {};
  const byDateSessions = {};

  let totalCacheRead = 0, totalCacheCreation = 0, totalInput = 0, totalOutput = 0;
  let totalCost = 0, totalUncachedCost = 0;

  const verbosityRatios = [];
  const sessions = new Set();
  const userMessages = [];
  const allScoredPrompts = []; // {dateKey, total, directness, context, examples, structure, outputSpec, text}
  const interactionPrompts = { directive: [], question: [], continuation: [], formatChange: [], clarification: [], interruption: [] };

  let firstTs = Infinity, lastTs = 0;

  for (const msg of messages) {
    if (msg.timestamp < firstTs) firstTs = msg.timestamp;
    if (msg.timestamp > lastTs) lastTs = msg.timestamp;

    const dateKey = formatDate(msg.timestamp);

    if (msg.type === 'user') {
      sessions.add(msg.sessionId);
      if (msg.isHumanPrompt) {
        userMessages.push(msg);
        if (!byDate[dateKey]) byDate[dateKey] = {
          date: dateKey, inputTokens: 0, cacheCreation: 0, cacheRead: 0,
          outputTokens: 0, cost: 0, userPromptCount: 0, sessionCount: 0,
        };
        byDate[dateKey].userPromptCount = (byDate[dateKey].userPromptCount || 0) + 1;

        // Score and store per-date prompting data (score all, even short ones — they score 0)
        if (msg.promptText.length > 0) {
          const s = scorePrompt(msg.promptText);
          allScoredPrompts.push({ dateKey, ...s, text: msg.promptText });
          const psd = byDate[dateKey].promptScoreData =
            byDate[dateKey].promptScoreData || { count: 0, scoreSum: 0, directness: 0, context: 0, examples: 0, structure: 0, outputSpec: 0, hist: [0,0,0,0,0], lengthSum: 0, longCount: 0 };
          psd.count++;
          psd.scoreSum     += s.total;
          psd.directness   += s.directness;
          psd.context      += s.context;
          psd.examples     += s.examples;
          psd.structure    += s.structure;
          psd.outputSpec   += s.outputSpec;
          psd.hist[Math.min(4, Math.floor(s.total / 20))]++;
          psd.lengthSum    += msg.promptText.length;
        }

        // Per-date interaction pattern counts + global prompt lists
        if (msg.promptText.trim()) {
          const category = classifyInteraction(msg.promptText);
          const ic = byDate[dateKey].interactionCounts =
            byDate[dateKey].interactionCounts ||
            { directive: 0, question: 0, continuation: 0, formatChange: 0, clarification: 0, interruption: 0 };
          ic[category]++;
          interactionPrompts[category].push(msg.promptText);
        }
      }
      continue;
    }

    if (msg.type !== 'assistant') continue;

    const { model, usage } = msg;
    const cost = calculateCost(usage, model);
    const uncachedCost = calculateUncachedCost(usage, model);

    totalCacheRead     += usage.cache_read_input_tokens;
    totalCacheCreation += usage.cache_creation_input_tokens;
    totalInput         += usage.input_tokens;
    totalOutput        += usage.output_tokens;
    totalCost          += cost;
    totalUncachedCost  += uncachedCost;

    if (usage.input_tokens > 0 && usage.output_tokens > 0) {
      const ti = usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens;
      verbosityRatios.push(ti / usage.output_tokens);
    }

    if (!byModel[model]) byModel[model] = {
      model, inputTokens: 0, cacheCreation: 0, cacheRead: 0,
      outputTokens: 0, cost: 0, uncachedCost: 0, messageCount: 0,
    };
    byModel[model].inputTokens   += usage.input_tokens;
    byModel[model].cacheCreation += usage.cache_creation_input_tokens;
    byModel[model].cacheRead     += usage.cache_read_input_tokens;
    byModel[model].outputTokens  += usage.output_tokens;
    byModel[model].cost          += cost;
    byModel[model].uncachedCost  += uncachedCost;
    byModel[model].messageCount++;

    if (!byDate[dateKey]) byDate[dateKey] = {
      date: dateKey, inputTokens: 0, cacheCreation: 0, cacheRead: 0,
      outputTokens: 0, cost: 0, userPromptCount: 0, sessionCount: 0,
    };
    byDate[dateKey].inputTokens   += usage.input_tokens;
    byDate[dateKey].cacheCreation += usage.cache_creation_input_tokens;
    byDate[dateKey].cacheRead     += usage.cache_read_input_tokens;
    byDate[dateKey].outputTokens  += usage.output_tokens;
    byDate[dateKey].cost          += cost;

    // Per-date model breakdown (for filterable model tables)
    const md = byDate[dateKey].modelData = byDate[dateKey].modelData || {};
    if (!md[model]) md[model] = { inputTokens: 0, cacheCreation: 0, cacheRead: 0, outputTokens: 0, cost: 0, uncachedCost: 0, messageCount: 0 };
    md[model].inputTokens   += usage.input_tokens;
    md[model].cacheCreation += usage.cache_creation_input_tokens;
    md[model].cacheRead     += usage.cache_read_input_tokens;
    md[model].outputTokens  += usage.output_tokens;
    md[model].cost          += cost;
    md[model].uncachedCost  += uncachedCost;
    md[model].messageCount++;

    if (!byDateSessions[dateKey]) byDateSessions[dateKey] = new Set();
    byDateSessions[dateKey].add(msg.sessionId);

    const pk = msg.projectKey;
    if (!byProject[pk]) byProject[pk] = {
      projectKey: pk, inputTokens: 0, cacheCreation: 0, cacheRead: 0, outputTokens: 0, cost: 0,
    };
    byProject[pk].inputTokens   += usage.input_tokens;
    byProject[pk].cacheCreation += usage.cache_creation_input_tokens;
    byProject[pk].cacheRead     += usage.cache_read_input_tokens;
    byProject[pk].outputTokens  += usage.output_tokens;
    byProject[pk].cost          += cost;
  }

  for (const [dk, sessSet] of Object.entries(byDateSessions)) {
    if (byDate[dk]) byDate[dk].sessionCount = sessSet.size;
  }

  const totalEffectiveInput = totalInput + totalCacheCreation + totalCacheRead;
  const cacheHitRatio = totalEffectiveInput > 0 ? totalCacheRead / totalEffectiveInput : 0;

  verbosityRatios.sort((a, b) => a - b);
  const avgVerbosity = verbosityRatios.length > 0
    ? verbosityRatios.reduce((s, v) => s + v, 0) / verbosityRatios.length : 0;

  const rawLengths = userMessages.map(m => m.promptText.length).filter(l => l > 0).sort((a, b) => a - b);
  const promptP95 = rawLengths[Math.floor(rawLengths.length * 0.95)] || 0;
  const longPromptCount = rawLengths.filter(l => l > promptP95).length;

  // Back-fill longCount per date now that P95 is known
  for (const msg of userMessages) {
    if (msg.promptText.length <= promptP95) continue;
    const dk = formatDate(msg.timestamp);
    if (byDate[dk] && byDate[dk].promptScoreData) byDate[dk].promptScoreData.longCount++;
  }

  const histMax = rawLengths[rawLengths.length - 1] || 1;
  const bucketSize = Math.ceil(histMax / 10) || 1;
  const promptHistogram = Array.from({ length: 10 }, (_, i) => ({
    label: `${i * bucketSize}–${(i + 1) * bucketSize}`,
    count: rawLengths.filter(l => l >= i * bucketSize && l < (i + 1) * bucketSize).length,
  }));

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
      totalCost,
      totalUncachedCost,
      cacheSavingsUSD: totalUncachedCost - totalCost,
    },
    tokens: { totalInput, totalCacheCreation, totalCacheRead, totalOutput, totalEffectiveInput },
    cacheMetrics: {
      hitRatio: cacheHitRatio,
      hitPercent: Math.round(cacheHitRatio * 100),
      cacheReadTokens: totalCacheRead,
      cacheMissTokens: totalInput + totalCacheCreation,
    },
    verbosity: {
      avgRatio: avgVerbosity,
      avgPromptLength: rawLengths.length > 0
        ? Math.round(rawLengths.reduce((s, l) => s + l, 0) / rawLengths.length) : 0,
      longPromptThreshold: promptP95,
      longPromptCount,
      promptHistogram,
    },
    promptingScore: computePromptingAnalysis(allScoredPrompts, allScoredPrompts.map(s => s.text)),
    interactionPatterns: computeInteractionPatterns(userMessages),
    interactionPrompts,
    byModel: Object.values(byModel).sort((a, b) => b.cost - a.cost),
    byDate: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
    byProject: Object.values(byProject).sort((a, b) => b.cost - a.cost).slice(0, 10),
    userMessages,
  };
}

module.exports = { computeMetrics };
