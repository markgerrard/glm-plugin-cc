---
description: Show the stored output for a finished GLM job
argument-hint: '[job-id]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" result $ARGUMENTS`

Present the full output to the user. Do not summarize or condense it.
