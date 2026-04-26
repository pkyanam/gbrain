/**
 * Eval capture module tests.
 *
 * buildEvalCandidateInput: shape + scrubbing + slug/chunk extraction.
 * classifyCaptureFailure: SQLSTATE → reason mapping.
 * captureEvalCandidate: best-effort swallow, failure routing, never throws.
 *
 * Engine is mocked so this file runs in unit speed (<50ms).
 */

import { describe, expect, mock, test } from 'bun:test';
import {
  buildEvalCandidateInput,
  captureEvalCandidate,
  classifyCaptureFailure,
  isEvalCaptureEnabled,
  isEvalScrubEnabled,
  type CaptureContext,
} from '../src/core/eval-capture.ts';
import type { BrainEngine } from '../src/core/engine.ts';
import type { SearchResult } from '../src/core/types.ts';

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    slug: 'people/alice-example',
    page_id: 1,
    title: 'Alice Example',
    type: 'person',
    chunk_text: '…',
    chunk_source: 'compiled_truth',
    chunk_id: 42,
    chunk_index: 0,
    score: 0.9,
    stale: false,
    source_id: 'default',
    ...overrides,
  };
}

function makeCtx(overrides: Partial<CaptureContext> = {}): CaptureContext {
  return {
    tool_name: 'query',
    query: 'who is alice',
    results: [makeResult()],
    meta: { vector_enabled: true, detail_resolved: 'medium', expansion_applied: false },
    latency_ms: 123,
    remote: true,
    expand_enabled: true,
    detail: null,
    job_id: null,
    subagent_id: null,
    ...overrides,
  };
}

describe('buildEvalCandidateInput', () => {
  test('builds a valid row from minimal context', () => {
    const input = buildEvalCandidateInput(makeCtx());
    expect(input.tool_name).toBe('query');
    expect(input.query).toBe('who is alice');
    expect(input.retrieved_slugs).toEqual(['people/alice-example']);
    expect(input.retrieved_chunk_ids).toEqual([42]);
    expect(input.source_ids).toEqual(['default']);
    expect(input.latency_ms).toBe(123);
    expect(input.remote).toBe(true);
  });

  test('dedupes slugs across multiple chunks from the same page', () => {
    const input = buildEvalCandidateInput(
      makeCtx({
        results: [
          makeResult({ slug: 'people/alice-example', chunk_id: 1 }),
          makeResult({ slug: 'people/alice-example', chunk_id: 2 }),
          makeResult({ slug: 'companies/acme', chunk_id: 3 }),
        ],
      }),
    );
    expect(input.retrieved_slugs).toEqual(['people/alice-example', 'companies/acme']);
    // chunk ids preserve order and duplicates (each hit is distinct).
    expect(input.retrieved_chunk_ids).toEqual([1, 2, 3]);
  });

  test('dedupes source_ids', () => {
    const input = buildEvalCandidateInput(
      makeCtx({
        results: [
          makeResult({ source_id: 'default' }),
          makeResult({ source_id: 'default' }),
          makeResult({ source_id: 'wiki' }),
        ],
      }),
    );
    expect(input.retrieved_slugs).toHaveLength(1);
    expect(input.source_ids.sort()).toEqual(['default', 'wiki']);
  });

  test('omits source_id from the set when a result lacks one (pre-v0.18 rows)', () => {
    const input = buildEvalCandidateInput(
      makeCtx({ results: [makeResult({ source_id: undefined })] }),
    );
    expect(input.source_ids).toEqual([]);
  });

  test('scrubs PII by default', () => {
    const input = buildEvalCandidateInput(
      makeCtx({ query: 'email alice@example.com about the ticket' }),
    );
    expect(input.query).not.toContain('alice@example.com');
    expect(input.query).toContain('[REDACTED]');
  });

  test('preserves PII when scrub_pii is false', () => {
    const input = buildEvalCandidateInput(
      makeCtx({ query: 'email alice@example.com' }),
      { scrub_pii: false },
    );
    expect(input.query).toBe('email alice@example.com');
  });

  test('carries hybridSearch meta onto the row verbatim', () => {
    const input = buildEvalCandidateInput(
      makeCtx({
        meta: { vector_enabled: false, detail_resolved: 'high', expansion_applied: true },
      }),
    );
    expect(input.vector_enabled).toBe(false);
    expect(input.detail_resolved).toBe('high');
    expect(input.expansion_applied).toBe(true);
  });

  test('propagates jobId + subagentId when present (subagent tool-bridge path)', () => {
    const input = buildEvalCandidateInput(
      makeCtx({ job_id: 9001, subagent_id: 42 }),
    );
    expect(input.job_id).toBe(9001);
    expect(input.subagent_id).toBe(42);
  });
});

describe('classifyCaptureFailure', () => {
  test('maps Postgres 23514 to check_violation', () => {
    expect(classifyCaptureFailure({ code: '23514' })).toBe('check_violation');
  });
  test('maps Postgres 42501 to rls_reject', () => {
    expect(classifyCaptureFailure({ code: '42501' })).toBe('rls_reject');
  });
  test('maps Postgres 42P01 to db_down', () => {
    expect(classifyCaptureFailure({ code: '42P01' })).toBe('db_down');
  });
  test('maps connection SQLSTATEs to db_down', () => {
    expect(classifyCaptureFailure({ code: '08006' })).toBe('db_down');
    expect(classifyCaptureFailure({ code: '53300' })).toBe('db_down');
  });
  test('maps RegExpMatchError to scrubber_exception', () => {
    expect(classifyCaptureFailure({ name: 'RegExpMatchError' })).toBe('scrubber_exception');
  });
  test('falls back to other for unknown errors', () => {
    expect(classifyCaptureFailure(new Error('something else'))).toBe('other');
    expect(classifyCaptureFailure('just a string')).toBe('other');
    expect(classifyCaptureFailure(null)).toBe('other');
  });
});

describe('captureEvalCandidate — best-effort failure handling', () => {
  function makeMockEngine(overrides: Partial<BrainEngine> = {}): BrainEngine {
    return {
      logEvalCandidate: mock(() => Promise.resolve(1)),
      logEvalCaptureFailure: mock(() => Promise.resolve()),
      ...overrides,
    } as unknown as BrainEngine;
  }

  test('happy path: calls logEvalCandidate and does not throw', async () => {
    const engine = makeMockEngine();
    await expect(captureEvalCandidate(engine, makeCtx())).resolves.toBeUndefined();
    expect((engine.logEvalCandidate as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(1);
    expect((engine.logEvalCaptureFailure as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(0);
  });

  test('DB error: routes to logEvalCaptureFailure with classified reason, does not throw', async () => {
    const rlsErr = Object.assign(new Error('row violates row-level security'), { code: '42501' });
    const engine = makeMockEngine({
      logEvalCandidate: mock(() => Promise.reject(rlsErr)),
    });
    await expect(captureEvalCandidate(engine, makeCtx())).resolves.toBeUndefined();
    const failureCalls = (engine.logEvalCaptureFailure as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(failureCalls).toHaveLength(1);
    expect(failureCalls[0]![0]).toBe('rls_reject');
  });

  test('failure-of-failure: if the failure-log insert also rejects, still does not throw', async () => {
    const engine = makeMockEngine({
      logEvalCandidate: mock(() => Promise.reject(new Error('primary fail'))),
      logEvalCaptureFailure: mock(() => Promise.reject(new Error('secondary fail'))),
    });
    await expect(captureEvalCandidate(engine, makeCtx())).resolves.toBeUndefined();
  });

  test('sync scrubber throw lands in check path (mocked scrub would throw)', async () => {
    // We can't force the real scrubber to throw on normal input — the
    // adversarial-input test in eval-capture-scrub.test.ts covers that.
    // This smoke test proves buildEvalCandidateInput throw propagates to
    // the outer try/catch by handing an engine that throws synchronously
    // in logEvalCandidate to simulate the "anything after scrub can fail".
    const engine = makeMockEngine({
      logEvalCandidate: mock(() => {
        throw new Error('sync throw'); // not a rejection — a sync throw
      }),
    });
    await expect(captureEvalCandidate(engine, makeCtx())).resolves.toBeUndefined();
    expect(
      (engine.logEvalCaptureFailure as unknown as { mock: { calls: unknown[] } }).mock.calls,
    ).toHaveLength(1);
  });
});

describe('isEvalCaptureEnabled / isEvalScrubEnabled', () => {
  test('defaults to enabled when config is null or missing', () => {
    expect(isEvalCaptureEnabled(null)).toBe(true);
    expect(isEvalCaptureEnabled(undefined)).toBe(true);
    expect(isEvalScrubEnabled(null)).toBe(true);
  });

  test('returns false only when explicitly set to false', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const disabled: any = { engine: 'pglite', eval: { capture: false, scrub_pii: false } };
    expect(isEvalCaptureEnabled(disabled)).toBe(false);
    expect(isEvalScrubEnabled(disabled)).toBe(false);
  });

  test('defaults to enabled when the eval key exists but the flag is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const partial: any = { engine: 'pglite', eval: {} };
    expect(isEvalCaptureEnabled(partial)).toBe(true);
    expect(isEvalScrubEnabled(partial)).toBe(true);
  });
});
