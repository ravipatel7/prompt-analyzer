'use strict';

function run() {
  console.log(`
@ravipatel7/prompt-analyzer — Claude Code session analysis tool

USAGE
  npx @ravipatel7/prompt-analyzer [command] [options]

COMMANDS
  (default)           Analyze all sessions and open HTML report in browser
  analyze             Analyze all sessions (no browser open — CI-friendly)
  install             Install /prompt-analysis skill to Claude Code (global)
  install --local     Install skill to current project only
  help                Show this message

EXAMPLES
  npx @ravipatel7/prompt-analyzer
  npx @ravipatel7/prompt-analyzer install
  npx @ravipatel7/prompt-analyzer install --local
  npx @ravipatel7/prompt-analyzer analyze

REPORT SECTIONS
  1. Executive Summary    — Sessions, prompts, cost, cache hit rate
  2. Token Usage          — Daily breakdown by token type and model
  3. Cache Efficiency     — Hit/miss ratio and savings vs uncached cost
  4. Cost Breakdown       — Per-day and per-model cost analysis
  5. Prompt Verbosity     — Input:output ratios and prompt length distribution
  6. Repeated Patterns    — Similar prompt clusters (CLAUDE.md candidates)
  7. Recommendations      — Actionable improvement suggestions

DATA SOURCES
  ~/.claude/projects/*/[session].jsonl   Per-session conversation transcripts
  ~/.claude/history.jsonl                Global prompt history

REQUIREMENTS
  Node.js >= 18.0.0

LINKS
  GitHub:  https://github.com/ravipatel7/prompt-analyzer
  Issues:  https://github.com/ravipatel7/prompt-analyzer/issues
`);
}

module.exports = { run };
