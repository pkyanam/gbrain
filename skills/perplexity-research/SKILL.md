---
name: perplexity-research
version: 0.1.0
description: Brain-augmented web research via Perplexity plus Opus; surfaces what is NEW vs already-known about a topic by cross-referencing against the brain first.
triggers:
  - "perplexity research"
  - "what's new about"
  - "current state of"
  - "web research"
  - "what changed about"
mutating: true
writes_pages: true
writes_to:
  - research/
---

# perplexity-research

Brain-augmented web research via Perplexity plus Opus; surfaces what is NEW vs already-known about a topic by cross-referencing against the brain first.

## The rule

<!-- SKILLIFY_STUB: replace before running check-resolvable --strict -->
Replace this stub with the hard rule that prevents recurrence of the failure that triggered this skill.

## How to use

Run the deterministic script: `bun scripts/perplexity-research.mjs` (or whatever your harness prefix is).
