# GLM Plugin for Claude Code

A Claude Code plugin that brings Zhipu AI's GLM-4 into your workflow for reasoning, code review, and structured task delegation — powered by the OpenAI-compatible Zhipu API.

**Operating model:** GLM analyses, Claude interprets, user decides.

## Prerequisites

- [Claude Code](https://claude.ai/claude-code) installed
- Zhipu AI API key from [open.bigmodel.cn](https://open.bigmodel.cn)
- Node.js 18+

Set your API key:
```bash
export ZHIPU_API_KEY=your_key_here
```

## Installation

**Recommended:** Use the [claude-code-llm-plugins](https://github.com/markgerrard/claude-code-llm-plugins) monorepo:

```bash
git clone https://github.com/markgerrard/claude-code-llm-plugins.git
cd claude-code-llm-plugins
./install.sh glm
```

Restart Claude Code to load the plugin.

## When to use GLM

| Use GLM when | Use other tools when |
|--------------|---------------------|
| You want a second opinion on code from a strong Chinese AI model | You need real-time web/social data (use Grok) |
| You want structured task delegation with good reasoning | You need image generation or multimodal output |
| You need code review from a different perspective | You need tool use or function calling |
| You want to compare approaches across AI models | You need the most current library docs |

GLM-4 is a strong reasoning and coding model from Zhipu AI. It provides a different perspective from Western AI models and excels at structured analysis.

## Commands

| Command | Description |
|---------|-------------|
| `/glm:ask <question>` | General GLM-4 query |
| `/glm:task <prompt>` | Structured task delegation |
| `/glm:review [focus]` | Code review via git diff (piped stdin) |
| `/glm:setup` | Check API key and connectivity |
| `/glm:status [job-id]` | Show active and recent background jobs |
| `/glm:result [job-id]` | Show finished job output |
| `/glm:cancel [job-id]` | Cancel an active background job |

## Command selection guide

- `/glm:ask` — quick question, get GLM's take
- `/glm:task` — structured work: analysis, generation, transformation
- `/glm:review` — code review with a fresh set of eyes

### Examples

```
# General questions
/glm:ask "What are the tradeoffs between Redis Streams and Kafka for event sourcing?"
/glm:ask --model flash "Explain the CAP theorem in one paragraph"

# Structured tasks
/glm:task "Generate a TypeScript interface for a payment webhook payload with Stripe-compatible fields"
/glm:task --background "Analyse the architectural patterns in this codebase and suggest improvements"

# Code review
/glm:review
/glm:review security
/glm:review --model plus "error handling"

# Background jobs
/glm:task --background "Write comprehensive test cases for the auth module"
/glm:status
/glm:result
```

## Options

| Flag | Commands | Description |
|------|----------|-------------|
| `--background` | ask, task, review | Run in background, returns job ID |
| `--model <model>` | ask, task, review | Override the GLM model (or use alias) |
| `--focus <area>` | review | Focus area for code review |
| `--json` | setup, status, result | JSON output |
| `--all` | status | Show full job history |

### Model Aliases

| Alias | Model | Notes |
|-------|-------|-------|
| `plus` | glm-4-plus | Default. Best quality, strong reasoning |
| `flash` | glm-4-flash | Fast and cheap, good for simple queries |
| `4` | glm-4 | Base GLM-4 model |

## Architecture

```
.claude-plugin/plugin.json          # Plugin manifest
commands/*.md                       # Slash command definitions
scripts/glm-companion.mjs          # Main entry point — routes subcommands
scripts/lib/
  glm.mjs                          # Zhipu API client, model aliases
  args.mjs                         # Argument parsing
  state.mjs                        # File-based job persistence per workspace
  tracked-jobs.mjs                 # Job lifecycle tracking
  job-control.mjs                  # Job querying, filtering, resolution
  render.mjs                       # Output formatting for status/result/cancel
  process.mjs                      # Process tree termination
  workspace.mjs                    # Git workspace root detection
scripts/session-lifecycle-hook.mjs # Session start/end cleanup
hooks/hooks.json                   # Session lifecycle hook config
prompts/*.md                       # Command-specific prompt templates
skills/                            # Reusable Claude Code skills
```

### How it works

- **No CLI dependency.** This plugin calls the Zhipu API directly via HTTP (`https://open.bigmodel.cn/api/paas/v4/chat/completions`).
- **OpenAI-compatible.** The Zhipu API follows the OpenAI chat completions format, making it straightforward to integrate.
- **Background jobs** spawn detached worker processes that write results to disk, same pattern as the Grok plugin.

## License

MIT
