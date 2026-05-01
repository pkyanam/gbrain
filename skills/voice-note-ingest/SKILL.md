---
name: voice-note-ingest
version: 0.1.0
description: Ingest voice notes with exact-phrasing preservation (never paraphrased); routes content to originals/concepts/people/companies/ideas/personal/voice-notes/ based on a decision tree.
triggers:
  - "voice note"
  - "ingest this voice memo"
  - "transcribe and file"
  - "voice note ingest"
  - "save this audio note"
mutating: true
writes_pages: true
writes_to:
  - voice-notes/
  - originals/
  - concepts/
  - people/
  - companies/
  - ideas/
  - personal/
---

# voice-note-ingest

Ingest voice notes with exact-phrasing preservation (never paraphrased); routes content to originals/concepts/people/companies/ideas/personal/voice-notes/ based on a decision tree.

## The rule

<!-- SKILLIFY_STUB: replace before running check-resolvable --strict -->
Replace this stub with the hard rule that prevents recurrence of the failure that triggered this skill.

## How to use

Run the deterministic script: `bun scripts/voice-note-ingest.mjs` (or whatever your harness prefix is).
