---
description: Delegate a coding task to GLM via Pi coding agent (has file access)
argument-hint: '[--model <model>] <task>'
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(pi:*)
---

Runs Pi coding agent with GLM as the model. Unlike `/glm:task`, this command gives GLM full file access — it can read, write, edit files and run bash commands in the project.

Use for implementation tasks, not analysis.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" code $ARGUMENTS
```
