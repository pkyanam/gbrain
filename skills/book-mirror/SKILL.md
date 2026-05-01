---
name: book-mirror
version: 0.1.0
description: Take any book (EPUB/PDF), produce a personalized chapter-by-chapter analysis with two-column tables: left = chapter summary, right = how it applies to you based on brain context. Output: brain page + PDF.
triggers:
  - "personalized version of this book"
  - "mirror this book"
  - "two-column book analysis"
  - "apply this book to my life"
  - "how does this book apply to me"
mutating: true
writes_pages: true
writes_to:
  - media/books/
---

# book-mirror

Take any book (EPUB/PDF), produce a personalized chapter-by-chapter analysis with two-column tables: left = chapter summary, right = how it applies to you based on brain context. Output: brain page + PDF.

## The rule

<!-- SKILLIFY_STUB: replace before running check-resolvable --strict -->
Replace this stub with the hard rule that prevents recurrence of the failure that triggered this skill.

## How to use

Run the deterministic script: `bun scripts/book-mirror.mjs` (or whatever your harness prefix is).
