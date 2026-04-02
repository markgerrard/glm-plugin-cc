---
description: Delegate a structured task to GLM-4
argument-hint: '[--background] [--model <model>] <prompt>'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Structured task delegation to GLM-4. The model receives a system prompt that encourages organized, thorough output.

After receiving the response, present it to the user with:
1. **Task delegated** (what was sent)
2. **GLM's output** (verbatim)
3. **My interpretation** (quality assessment, anything missing)
4. **Recommended action**

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/glm-companion.mjs" task $ARGUMENTS
```
