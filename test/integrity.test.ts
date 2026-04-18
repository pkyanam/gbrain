/**
 * gbrain integrity tests — pure regex + frontmatter-extract paths.
 *
 * The three-bucket auto path runs end-to-end in a manual smoke script
 * against a real brain; the unit tests here focus on the pure detection
 * logic (bare-tweet regex, external-link extraction, frontmatter handle
 * extraction) that determines what reaches the resolver.
 */

import { describe, test, expect } from 'bun:test';
import {
  findBareTweetHits,
  findExternalLinks,
  extractXHandleFromFrontmatter,
} from '../src/commands/integrity.ts';

// ---------------------------------------------------------------------------
// Bare-tweet regex
// ---------------------------------------------------------------------------

describe('findBareTweetHits', () => {
  test('catches "tweeted about X" without URL', () => {
    const hits = findBareTweetHits('Garry tweeted about AI safety last week.', 'people/garrytan');
    expect(hits).toHaveLength(1);
    expect(hits[0].phrase).toMatch(/tweeted about/i);
    expect(hits[0].line).toBe(1);
  });

  test('catches "in a tweet" style phrasing', () => {
    const compiled = [
      'Some other content.',
      '',
      'He said in a recent tweet that the market was shifting.',
    ].join('\n');
    const hits = findBareTweetHits(compiled, 'people/x');
    expect(hits).toHaveLength(1);
    expect(hits[0].line).toBe(3);
  });

  test('skips line that already has a tweet URL', () => {
    const line = 'As he tweeted about YC (https://x.com/garrytan/status/123456).';
    const hits = findBareTweetHits(line, 'people/x');
    expect(hits).toEqual([]);
  });

  test('skips fenced code blocks entirely', () => {
    const compiled = [
      '```',
      'He tweeted about the fix.',
      '```',
    ].join('\n');
    const hits = findBareTweetHits(compiled, 'people/x');
    expect(hits).toEqual([]);
  });

  test('detects twitter.com URLs as already-cited too', () => {
    const line = 'She wrote (https://twitter.com/someuser/status/999) about it.';
    const hits = findBareTweetHits(line, 'people/x');
    expect(hits).toEqual([]);
  });

  test('catches "posted on X"', () => {
    const hits = findBareTweetHits('They posted on X yesterday.', 'people/x');
    expect(hits).toHaveLength(1);
  });

  test('catches possessive phrasing ("his recent tweet")', () => {
    const hits = findBareTweetHits('His recent tweet said as much.', 'people/x');
    expect(hits).toHaveLength(1);
  });

  test('does NOT trigger on already-cited "via X/handle" form', () => {
    const hits = findBareTweetHits('Mentioned via X/garrytan earlier.', 'people/x');
    expect(hits).toEqual([]);
  });

  test('only one hit per line even if multiple phrases match', () => {
    const hits = findBareTweetHits('He tweeted about it in a tweet later.', 'people/x');
    expect(hits).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// External-link extraction
// ---------------------------------------------------------------------------

describe('findExternalLinks', () => {
  test('extracts http+https URLs', () => {
    const compiled = 'See [the essay](https://example.com/essay) or [legacy](http://old.example/).';
    const hits = findExternalLinks(compiled, 'concepts/x');
    expect(hits.map(h => h.url)).toEqual([
      'https://example.com/essay',
      'http://old.example/',
    ]);
  });

  test('ignores wikilinks without scheme', () => {
    const compiled = 'See [Alice](../people/alice.md) for context.';
    const hits = findExternalLinks(compiled, 'concepts/x');
    expect(hits).toEqual([]);
  });

  test('ignores links inside fenced code', () => {
    const compiled = '```\n[url](https://example.com)\n```';
    const hits = findExternalLinks(compiled, 'concepts/x');
    expect(hits).toEqual([]);
  });

  test('line numbers are 1-based and accurate', () => {
    const compiled = 'line 1\n\n[link](https://example.com) on line 3';
    const hits = findExternalLinks(compiled, 'x/y');
    expect(hits[0].line).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter handle extraction
// ---------------------------------------------------------------------------

describe('extractXHandleFromFrontmatter', () => {
  test('reads x_handle', () => {
    expect(extractXHandleFromFrontmatter({ x_handle: 'garrytan' })).toBe('garrytan');
  });

  test('reads twitter', () => {
    expect(extractXHandleFromFrontmatter({ twitter: 'garrytan' })).toBe('garrytan');
  });

  test('reads twitter_handle', () => {
    expect(extractXHandleFromFrontmatter({ twitter_handle: 'garrytan' })).toBe('garrytan');
  });

  test('strips leading @', () => {
    expect(extractXHandleFromFrontmatter({ x_handle: '@garrytan' })).toBe('garrytan');
  });

  test('returns null on undefined frontmatter', () => {
    expect(extractXHandleFromFrontmatter(undefined)).toBeNull();
  });

  test('returns null when no handle key is present', () => {
    expect(extractXHandleFromFrontmatter({ name: 'Garry Tan' })).toBeNull();
  });

  test('returns null on empty string', () => {
    expect(extractXHandleFromFrontmatter({ x_handle: '' })).toBeNull();
  });

  test('preference order: x_handle > twitter > twitter_handle > x', () => {
    expect(extractXHandleFromFrontmatter({
      x_handle: 'primary',
      twitter: 'secondary',
      twitter_handle: 'tertiary',
      x: 'quaternary',
    })).toBe('primary');
  });
});
