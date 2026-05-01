---
name: article-enrichment
version: 0.1.0
description: Transform raw article text dumps in the brain into structured pages with executive summaries, verbatim quotes, key insights, why-it-matters, and cross-references.
triggers:
  - "enrich this article"
  - "enrich brain pages"
  - "batch enrich"
  - "make brain pages useful"
mutating: true
writes_pages: true
writes_to:
  - media/articles/
---

# article-enrichment

Transform raw article text dumps in the brain into structured pages with executive summaries, verbatim quotes, key insights, why-it-matters, and cross-references.

## The rule

<!-- SKILLIFY_STUB: replace before running check-resolvable --strict -->
Replace this stub with the hard rule that prevents recurrence of the failure that triggered this skill.

## How to use

Run the deterministic script: `bun scripts/article-enrichment.mjs` (or whatever your harness prefix is).
