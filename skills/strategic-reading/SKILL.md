---
name: strategic-reading
version: 0.1.0
description: Read a book/article/case study through the lens of a specific strategic problem; produce an applied playbook (do/avoid/watch for) with short/medium/long-term recommendations.
triggers:
  - "strategic reading"
  - "read this through the lens of"
  - "apply this to my problem"
  - "what can I learn from this about"
  - "extract a playbook from"
mutating: true
writes_pages: true
writes_to:
  - concepts/
  - projects/
---

# strategic-reading

Read a book/article/case study through the lens of a specific strategic problem; produce an applied playbook (do/avoid/watch for) with short/medium/long-term recommendations.

## The rule

<!-- SKILLIFY_STUB: replace before running check-resolvable --strict -->
Replace this stub with the hard rule that prevents recurrence of the failure that triggered this skill.

## How to use

Run the deterministic script: `bun scripts/strategic-reading.mjs` (or whatever your harness prefix is).
