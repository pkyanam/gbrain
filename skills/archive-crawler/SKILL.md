---
name: archive-crawler
version: 0.1.0
description: Universal archivist for personal file archives (Dropbox/B2/email exports). Filters for high-value content within an explicit gbrain.yml allow-list scan_paths gate.
triggers:
  - "crawl my archive"
  - "find gold in my archive"
  - "archive crawler"
  - "scan my dropbox for"
  - "mine my old files for"
mutating: true
writes_pages: true
writes_to:
  - originals/
  - personal/
  - ideas/
---

# archive-crawler

Universal archivist for personal file archives (Dropbox/B2/email exports). Filters for high-value content within an explicit gbrain.yml allow-list scan_paths gate.

## The rule

<!-- SKILLIFY_STUB: replace before running check-resolvable --strict -->
Replace this stub with the hard rule that prevents recurrence of the failure that triggered this skill.

## How to use

Run the deterministic script: `bun scripts/archive-crawler.mjs` (or whatever your harness prefix is).
