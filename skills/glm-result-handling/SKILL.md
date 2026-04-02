---
name: glm-result-handling
description: Guidelines for presenting GLM output back to the user
---

# GLM Result Handling

When you receive output from any GLM command, present it using this structure:

1. **Topic/question** — What was sent to GLM (1-2 lines)
2. **GLM's response** — Present verbatim. Do not truncate or rewrite.
3. **My interpretation** — Your assessment:
   - Is the analysis sound? Are the conclusions well-supported?
   - What context does GLM lack? (codebase history, business constraints, private data)
   - Are any claims unverifiable or overly confident?
   - What's actionable vs noise?
4. **Recommended next step** — What should the user do with this?

## Key rules

- **GLM analyses, Claude interprets, user decides.** Never auto-act on GLM output.
- **Wait for user approval** before proceeding.
- **Cross-check code suggestions** — GLM may propose patterns that don't match the project's conventions.

## Watch out for

- **Confident but wrong**: GLM-4 can be confidently wrong about API details, library versions, or obscure edge cases. Verify critical claims.
- **Chinese-centric defaults**: GLM may default to Chinese-language responses or Chinese ecosystem tools. Adjust if the project context is different.
- **Missing project context**: GLM only sees what you send it. It doesn't know the project's history, CI setup, or deployment constraints.
- **Code review blind spots**: GLM reviews the diff in isolation. It can't check if changes break tests, violate conventions elsewhere, or conflict with in-flight PRs.
