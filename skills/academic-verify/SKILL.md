---
name: academic-verify
version: 0.1.0
description: Verify academic citations and research claims against current literature; routes through perplexity-research for the actual web search and formats results as a citation-checked brain page.
triggers:
  - "verify this academic claim"
  - "check this study"
  - "academic verify"
  - "validate citation"
  - "is this study real"
mutating: true
writes_pages: true
writes_to:
  - concepts/
---

# academic-verify

Verify academic citations and research claims against current literature; routes through perplexity-research for the actual web search and formats results as a citation-checked brain page.

## The rule

<!-- SKILLIFY_STUB: replace before running check-resolvable --strict -->
Replace this stub with the hard rule that prevents recurrence of the failure that triggered this skill.

## How to use

Run the deterministic script: `bun scripts/academic-verify.mjs` (or whatever your harness prefix is).
