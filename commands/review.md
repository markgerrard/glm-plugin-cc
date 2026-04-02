---
description: Code review using GLM-4 via git diff
argument-hint: '[--background] [--model <model>] [focus]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Pipe a git diff to GLM-4 for code review. The diff is sent via stdin to avoid E2BIG errors on large diffs.

After receiving the response, present it to the user with:
1. **What was reviewed** (scope of the diff)
2. **GLM's review** (verbatim)
3. **My interpretation** (agree/disagree with findings, context GLM lacks)
4. **Recommended action**

```bash
git diff | node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" review $ARGUMENTS
```
