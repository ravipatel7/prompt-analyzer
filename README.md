# @ravilabs/prompt-analyser

Analyze your Claude Code session data and generate a rich HTML report covering token usage, cache efficiency, API cost estimates, repeated prompt patterns, and actionable improvement recommendations.

## Quick Start

```bash
# Run analysis and open HTML report in browser
npx @ravilabs/prompt-analyser

# Install the /prompt-analysis skill into Claude Code
npx @ravilabs/prompt-analyser install
```

## What You Get

The HTML report includes:

| Section | What it shows |
|---|---|
| Executive Summary | Sessions, prompts, estimated cost, cache hit rate, date range |
| Token Usage Over Time | Daily stacked chart — input / cache read / cache write / output |
| Cache Efficiency | Hit/miss doughnut chart, per-model rates, $ saved vs uncached |
| Cost Breakdown | Daily cost bar chart, per-model cost table |
| Prompt Verbosity | Prompt length histogram, input:output ratio stats |
| Repeated Patterns | Similar prompt clusters — CLAUDE.md and hook candidates |
| Recommendations | Rule-based, actionable suggestions |

## Commands

```
npx @ravilabs/prompt-analyser              # Analyze + open report in browser
npx @ravilabs/prompt-analyser analyze      # Analyze only (CI-friendly, no browser)
npx @ravilabs/prompt-analyser install      # Install skill globally to Claude Code
npx @ravilabs/prompt-analyser install --local  # Install skill to current project
npx @ravilabs/prompt-analyser help         # Show help
```

## Claude Code Skill

After running `install`, restart Claude Code and use `/prompt-analysis` in any session to trigger an interactive analysis with recommendations.

## Data Sources

- `~/.claude/projects/*/[session-id].jsonl` — full conversation transcripts with token usage
- `~/.claude/history.jsonl` — global prompt history

**No data leaves your machine.** Everything runs locally.

## Pricing Model Used

| Model | Input | Cache Write | Cache Read | Output |
|---|---|---|---|---|
| claude-sonnet-4-6 | $3.00/MTok | $3.75/MTok | $0.30/MTok | $15.00/MTok |
| claude-opus-4-7 | $15.00/MTok | $18.75/MTok | $1.50/MTok | $75.00/MTok |
| claude-haiku-4-5 | $0.80/MTok | $1.00/MTok | $0.08/MTok | $4.00/MTok |

## Requirements

- Node.js ≥ 18.0.0
- Claude Code with at least one session recorded

## Platform Support

Works on macOS, Linux, and Windows.

| Platform | Claude data path |
|---|---|
| macOS / Linux | `~/.claude/` |
| Windows | `%APPDATA%\Claude\` |

## License

MIT
