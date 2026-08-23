---
name: consult-browser-reviewer
description: Consult the signed-in ChatGPT browser reviewer about Museum Editor product, UX, plan, or architecture decisions. Invoke when the user says “consult with browser reviewer,” “ask the reviewer,” or equivalent.
---

# Consult Browser Reviewer

Use the in-app Browser and the **Museum Editor — Product, UX & Architecture** ChatGPT project.

1. Read only the local docs/code needed for the question, following `docs/README.md` routing and repository truth precedence.
2. Send a self-contained brief: objective, current behavior, constraints, exact evidence, short code excerpts, decisions already locked, and the specific review requested.
3. Prefer summaries and focused snippets over uploading the repository or broad context bundles. Supply another file/snippet only when the reviewer identifies a concrete gap.
4. Wait for the response when requested. Treat reviewer output as advice: verify factual claims against local code/tests before editing.
5. Report the conclusion, disagreements, and any unresolved owner decision. Keep the reviewer tab open for handoff.

Do not expose secrets, unrelated files, or visitor data. Do not let reviewer advice override source code, tests, or explicit owner decisions.
