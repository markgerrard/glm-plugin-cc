---
description: Show active and recent GLM jobs
argument-hint: '[job-id] [--all]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" status $ARGUMENTS`
