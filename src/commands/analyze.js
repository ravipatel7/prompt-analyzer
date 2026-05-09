'use strict';

const { collectAllMessages, parseHistoryFile } = require('../analysis/collector');
const { computeMetrics } = require('../analysis/metrics');
const { clusterPrompts } = require('../analysis/clustering');
const { generate } = require('../reporting/generator');
const { openInBrowser } = require('../reporting/opener');

const SYSTEM_NOISE_RE = /<[a-z]|\[Request interrupted|\[Image|^Caveat|^Context Window|^SYSTEM|^Note:|^\[NOTE\]/i;
function isCleanCluster(rep) { return !SYSTEM_NOISE_RE.test(rep) && rep.trim().length > 10; }

function generateTemplateSuggestions(clusters) {
  return clusters.slice(0, 5).map(c => {
    const rep = c.representative;
    const lo = rep.toLowerCase();

    const hasContext     = /because|context:|since |background:|i'm trying|i need/i.test(lo);
    const hasOutputSpec  = /as json|as a list|format|output:|return a|step by step/i.test(lo);
    const hasConstraints = /\bonly\b|do not|without|make sure|must |ensure /i.test(lo);

    const additions = [];
    if (!hasContext)     additions.push('Context: {background / what you\'re trying to accomplish}');
    if (!hasOutputSpec)  additions.push('Output: {list | JSON | code | prose — specify format}');
    if (!hasConstraints) additions.push('Constraints: {scope, requirements, things to avoid}');

    return {
      pattern: rep.slice(0, 120),
      template: (rep + (additions.length ? '\n\n' + additions.join('\n') : '')).slice(0, 600),
      count: c.count,
      improvements: additions.map(a => a.split(':')[0]),
    };
  });
}

function generateClaudeMdSuggestions(allText, clusters, interactionPatterns, promptingScore) {
  const lo = allText.toLowerCase();
  const suggestions = [];

  const techMap = [
    ['typescript', 'TypeScript'], ['react', 'React'], ['next.js', 'Next.js'],
    ['nextjs', 'Next.js'], ['python', 'Python'], ['rust', 'Rust'],
    ['vue.js', 'Vue.js'], ['vuejs', 'Vue.js'], ['docker', 'Docker'],
    ['postgres', 'PostgreSQL'], ['mongodb', 'MongoDB'], ['node.js', 'Node.js'],
    ['nodejs', 'Node.js'], ['tailwind', 'Tailwind CSS'], ['prisma', 'Prisma'],
    ['graphql', 'GraphQL'], ['aws ', 'AWS'], ['kubernetes', 'Kubernetes'],
    ['redis', 'Redis'], ['supabase', 'Supabase'], ['vercel', 'Vercel'],
  ];
  const uniqueTech = [...new Set(techMap.filter(([k]) => lo.includes(k)).map(([, v]) => v))];

  if (uniqueTech.length >= 2) {
    suggestions.push({
      type: 'context',
      icon: '🛠',
      title: 'Tech Stack Context',
      content: `# Tech Stack\nThis project uses: ${uniqueTech.join(', ')}`,
      reason: `Detected in your prompts — stating this once in CLAUDE.md saves repeating it every session and reduces input tokens.`,
    });
  }

  if (interactionPatterns && interactionPatterns.formatChange >= 3) {
    suggestions.push({
      type: 'behavior',
      icon: '📐',
      title: 'Default Response Format',
      content: `# Response Format\nDefault to markdown. Always use fenced code blocks for code.\nKeep responses concise unless detail is explicitly requested.`,
      reason: `You've requested format changes ${interactionPatterns.formatChange}× — locking in a default stops this recurring overhead.`,
    });
  }

  const ctxDim = promptingScore && promptingScore.dimensions
    ? promptingScore.dimensions.find(d => d.key === 'context')
    : null;
  if (ctxDim && ctxDim.pct < 50) {
    suggestions.push({
      type: 'context',
      icon: '🗂',
      title: 'Project Overview Block',
      content: `# About This Project\n{1-2 sentence description of what this codebase does}\n\n# Key Files\n- {path}: {purpose}\n\n# Conventions\n- {preferred patterns, naming conventions, style}`,
      reason: `Context scores in your prompts average ${ctxDim.pct}% — CLAUDE.md front-loads this so you never need to re-explain it.`,
    });
  }

  // Only use clusters with clean, clearly human-typed representatives
  const topClusters = clusters
    .filter(c => c.count >= 4 && isCleanCluster(c.representative))
    .slice(0, 2);
  for (const cluster of topClusters) {
    const slug = cluster.representative.trim().split(/\s+/).slice(0, 3)
      .join('-').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 30);
    suggestions.push({
      type: 'skill',
      icon: '⚡',
      title: `Automate: "${cluster.representative.slice(0, 55)}…"`,
      content: `# In Claude Code, run:\n/skill-creator\n\n# Describe the "${slug}" workflow\n# Save as /${slug} for one-command execution`,
      reason: `${cluster.count} similar prompts at ${Math.round(cluster.avgSimilarity * 100)}% avg similarity — a Claude Code skill makes this a single slash command.`,
    });
  }

  if (suggestions.length < 3) {
    suggestions.push({
      type: 'context',
      icon: '📋',
      title: 'Project Context Template',
      content: `# Project\n{Describe your project in 1-2 sentences}\n\n# Goals\n{What you're building / what matters most right now}\n\n# Do\n- {preferred behaviors / output formats}\n\n# Don't\n- {things to avoid}`,
      reason: 'A well-structured CLAUDE.md saves 20–40% of context tokens by front-loading repeated project information.',
    });
  }

  return suggestions.slice(0, 5);
}

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

  const totalUserTurns     = messages.filter(m => m.type === 'user').length;
  const totalAssistantTurns = messages.filter(m => m.type === 'assistant').length;
  console.log(`Found ${totalUserTurns} user turns across ${totalAssistantTurns} assistant turns.`);

  const metrics = computeMetrics(messages);

  const humanPrompts = metrics.userMessages
    .map(m => m.promptText)
    .filter(p => p.length > 20 && p.length < 2000);

  const clusters = clusterPrompts(humanPrompts);

  metrics.clusters = clusters.map(c => ({
    representative: c.representative.slice(0, 150).replace(/\n/g, ' ').replace(/\s+/g, ' '),
    count: c.count,
    avgSimilarity: c.avgSimilarity,
    examples: c.examples.map(e => e.slice(0, 100).replace(/\n/g, ' ').replace(/\s+/g, ' ')),
  }));

  // Filter clusters to only clean human-typed patterns for template suggestions
  const cleanClusters = metrics.clusters.filter(c => isCleanCluster(c.representative));
  metrics.templateSuggestions = generateTemplateSuggestions(cleanClusters);

  const allText = metrics.userMessages.map(m => m.promptText).join(' ');
  metrics.claudeMdSuggestions = generateClaudeMdSuggestions(
    allText, metrics.clusters, metrics.interactionPatterns, metrics.promptingScore
  );

  metrics.summary.totalUserTurns = totalUserTurns;
  delete metrics.userMessages;
  metrics.historyEntryCount = history.length;

  const reportPath = generate(metrics);

  const ps = metrics.promptingScore;
  console.log('\n── Analysis Summary ──────────────────────────────────────');
  console.log(`Sessions:          ${metrics.summary.totalSessions}`);
  console.log(`Human Prompts:     ${metrics.summary.totalUserPrompts}`);
  console.log(`Cache Hit Rate:    ${metrics.cacheMetrics.hitPercent}%`);
  console.log(`Est. Cost:         $${metrics.summary.totalCost.toFixed(4)}`);
  console.log(`Cache Savings:     $${metrics.summary.cacheSavingsUSD.toFixed(4)}`);
  if (ps) console.log(`Prompting Score:   ${ps.avgScore}/100 (${ps.grade})`);
  if (clusters.length) console.log(`Repeated Clusters: ${clusters.length} patterns found`);
  console.log('──────────────────────────────────────────────────────────');
  console.log(`\nReport: ${reportPath}`);

  if (openBrowser) {
    openInBrowser(reportPath);
    console.log('Opening report in browser...');
  }
}

module.exports = { run };
