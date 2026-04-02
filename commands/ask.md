---
description: Ask GLM-4 a question
argument-hint: '[--background] [--model <model>] <question>'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

General GLM-4 query. Supports model aliases: `plus` (default), `flash`, `4`.

After receiving the response, present it to the user with:
1. **Question asked** (what was sent)
2. **GLM's answer** (verbatim)
3. **My interpretation** (agree/disagree, caveats)
4. **Recommended action**

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" ask $ARGUMENTS
```
