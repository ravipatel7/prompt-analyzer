'use strict';

const { collectAllMessages, parseHistoryFile } = require('../analysis/collector');
const { computeMetrics } = require('../analysis/metrics');
const { clusterPrompts } = require('../analysis/clustering');
const { generate } = require('../reporting/generator');
const { openInBrowser } = require('../reporting/opener');

async function run({ openBrowser = true } = {}) {
  console.log('Collecting Claude Code session data...');

  const [messages, history] = await Promise.all([
    collectAllMessages(),
    parseHistoryFile(),
  ]);

  if (!messages.length && !history.length) {
    console.log('No Claude Code session data found. Make sure Claude Code has been used at least once.');
    process.exit(0);
  }

  const totalUserTurns = messages.filter(m => m.type === 'user').length;
  const totalAssistantTurns = messages.filter(m => m.type === 'assistant').length;
  console.log(`Found ${totalUserTurns} user turns across ${totalAssistantTurns} assistant turns.`);

  const metrics = computeMetrics(messages);

  // Cluster human-typed prompts only (tool results already excluded via isHumanPrompt)
  const humanPrompts = metrics.userMessages
    .map(m => m.promptText)
    .filter(p => p.length > 20 && p.length < 2000); // skip empty and very long (pasted content)

  const clusters = clusterPrompts(humanPrompts);

  // Truncate cluster text to avoid inflating HTML size and injection risk
  metrics.clusters = clusters.map(c => ({
    representative: c.representative.slice(0, 150).replace(/\n/g, ' ').replace(/\s+/g, ' '),
    count: c.count,
    avgSimilarity: c.avgSimilarity,
    examples: c.examples.map(e => e.slice(0, 100).replace(/\n/g, ' ').replace(/\s+/g, ' ')),
  }));

  // Store counts separately; don't serialize raw message objects
  metrics.summary.totalUserTurns = totalUserTurns;
  delete metrics.userMessages;
  metrics.historyEntryCount = history.length;

  const reportPath = generate(metrics);

  console.log('\n── Analysis Summary ──────────────────────────────────────');
  console.log(`Sessions:          ${metrics.summary.totalSessions}`);
  console.log(`Human Prompts:     ${metrics.summary.totalUserPrompts}`);
  console.log(`Cache Hit Rate:    ${metrics.cacheMetrics.hitPercent}%`);
  console.log(`Est. Cost:         $${metrics.summary.totalCost.toFixed(4)}`);
  console.log(`Cache Savings:     $${metrics.summary.cacheSavingsUSD.toFixed(4)}`);
  if (clusters.length) console.log(`Repeated Clusters: ${clusters.length} patterns found`);
  console.log('──────────────────────────────────────────────────────────');
  console.log(`\nReport: ${reportPath}`);

  if (openBrowser) {
    openInBrowser(reportPath);
    console.log('Opening report in browser...');
  }
}

module.exports = { run };
