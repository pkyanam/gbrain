/**
 * gbrain dream — Nightly dream cycle orchestrator.
 *
 * Runs while you sleep. Ties together lint, backlinks, orphan detection,
 * embedding, and sync into a single command that keeps the brain healthy
 * and compounding overnight.
 *
 * Phases:
 *   1. Lint & Fix     — auto-fix LLM artifacts, placeholder dates, broken citations
 *   2. Backlinks      — detect and create missing back-links between pages
 *   3. Orphan Sweep   — surface pages with no inbound links (thin/disconnected)
 *   4. Embed          — re-embed stale content so search stays fresh
 *   5. Sync           — sync repo changes to the database index
 *
 * Usage:
 *   gbrain dream                     # full dream cycle
 *   gbrain dream --dry-run           # preview all fixes without writing
 *   gbrain dream --json              # structured JSON report
 *   gbrain dream --phase lint        # run only one phase
 *   gbrain dream --phase backlinks
 *   gbrain dream --phase orphans
 *   gbrain dream --phase embed
 *   gbrain dream --phase sync
 *   gbrain dream --skip-embed        # skip embedding (faster, for testing)
 *   gbrain dream --skip-sync         # skip sync phase
 */

import type { BrainEngine } from '../core/engine.ts';
import { createProgress, startHeartbeat, type ProgressReporter } from '../core/progress.ts';
import { getCliOptions, cliOptsToProgressOptions } from '../core/cli-options.ts';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────────────────

export interface PhaseResult {
  phase: string;
  status: 'ok' | 'warn' | 'fail' | 'skipped';
  duration_ms: number;
  summary: string;
  details?: Record<string, unknown>;
}

export interface DreamReport {
  timestamp: string;
  duration_ms: number;
  phases: PhaseResult[];
  brain_dir: string | null;
  totals: {
    lint_fixes: number;
    backlinks_added: number;
    orphans_found: number;
    pages_embedded: number;
    pages_synced: number;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function findRepoRoot(): string | null {
  // Walk up from cwd looking for a .git directory
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  // Check common locations
  for (const candidate of ['/data/brain', './brain']) {
    if (existsSync(candidate) && existsSync(join(candidate, '.git'))) {
      return candidate;
    }
  }
  return null;
}

function parseArgs(args: string[]) {
  return {
    json: args.includes('--json'),
    dryRun: args.includes('--dry-run'),
    skipEmbed: args.includes('--skip-embed'),
    skipSync: args.includes('--skip-sync'),
    phase: (() => {
      const idx = args.indexOf('--phase');
      return idx !== -1 ? args[idx + 1] : null;
    })(),
    dir: (() => {
      const idx = args.indexOf('--dir');
      return idx !== -1 ? args[idx + 1] : null;
    })(),
  };
}

async function timePhase<T>(
  name: string,
  fn: () => Promise<T>,
  progress: ProgressReporter,
): Promise<{ result: T; duration_ms: number }> {
  progress.start(name);
  const start = performance.now();
  const result = await fn();
  const duration_ms = Math.round(performance.now() - start);
  progress.finish(`${name} done (${(duration_ms / 1000).toFixed(1)}s)`);
  return { result, duration_ms };
}

// ── Phase Runners ───────────────────────────────────────────────────

async function runLintPhase(brainDir: string, dryRun: boolean): Promise<PhaseResult> {
  try {
    // Use the library-level lint function
    const { runLintCore } = await import('./lint.ts');
    const result = await runLintCore({
      target: brainDir,
      fix: !dryRun,
      dryRun,
    });
    const fixed = result.total_fixed ?? 0;
    const issues = result.total_issues ?? 0;
    return {
      phase: 'lint',
      status: issues > 0 ? 'warn' : 'ok',
      duration_ms: 0,
      summary: dryRun
        ? `${issues} issues found (dry run, no fixes applied)`
        : `${fixed} fixes applied, ${Math.max(0, issues - fixed)} remaining`,
      details: { issues, fixed, pages_scanned: result.pages_scanned },
    };
  } catch {
    // Fallback: shell out to the lint CLI
    const { execSync } = await import('child_process');
    try {
      const fixFlag = dryRun ? '--fix --dry-run' : '--fix';
      const output = execSync(
        `bun run ${join(import.meta.dir, '..', 'cli.ts')} lint "${brainDir}" ${fixFlag} --json`,
        { encoding: 'utf-8', timeout: 120_000 },
      );
      const data = JSON.parse(output);
      const issues = data.totalIssues ?? data.issues?.length ?? 0;
      const fixed = data.totalFixed ?? data.fixed ?? 0;
      return {
        phase: 'lint',
        status: issues > 0 ? 'warn' : 'ok',
        duration_ms: 0,
        summary: dryRun
          ? `${issues} issues found (dry run)`
          : `${fixed} fixes applied, ${Math.max(0, issues - fixed)} remaining`,
        details: { issues, fixed },
      };
    } catch (e: any) {
      // lint exits non-zero when issues found — parse stdout
      const stdout = e.stdout || '';
      try {
        const data = JSON.parse(stdout);
        const issues = data.totalIssues ?? data.issues?.length ?? 0;
        const fixed = data.totalFixed ?? data.fixed ?? 0;
        return {
          phase: 'lint',
          status: 'warn',
          duration_ms: 0,
          summary: `${fixed} fixes, ${Math.max(0, issues - fixed)} remaining`,
          details: { issues, fixed },
        };
      } catch {
        return {
          phase: 'lint',
          status: 'fail',
          duration_ms: 0,
          summary: `Lint failed: ${e.message?.slice(0, 100)}`,
        };
      }
    }
  }
}

async function runBacklinksPhase(brainDir: string, dryRun: boolean): Promise<PhaseResult> {
  const { execSync } = await import('child_process');
  const subcmd = dryRun ? 'fix --dry-run' : 'fix';
  try {
    const output = execSync(
      `bun run ${join(import.meta.dir, '..', 'cli.ts')} check-backlinks ${subcmd} --dir "${brainDir}" --json`,
      { encoding: 'utf-8', timeout: 120_000 },
    );
    const data = JSON.parse(output);
    const added = data.fixed ?? data.created ?? data.added ?? 0;
    const gaps = data.gaps ?? data.total ?? 0;
    return {
      phase: 'backlinks',
      status: gaps > 0 ? 'warn' : 'ok',
      duration_ms: 0,
      summary: dryRun
        ? `${gaps} missing back-links found (dry run)`
        : `${added} back-links created, ${Math.max(0, gaps - added)} remaining`,
      details: { gaps, added },
    };
  } catch (e: any) {
    const stdout = e.stdout || '';
    try {
      const data = JSON.parse(stdout);
      const added = data.fixed ?? data.created ?? data.added ?? 0;
      const gaps = data.gaps ?? data.total ?? 0;
      return {
        phase: 'backlinks',
        status: 'warn',
        duration_ms: 0,
        summary: `${added} back-links created, ${Math.max(0, gaps - added)} gaps`,
        details: { gaps, added },
      };
    } catch {
      return {
        phase: 'backlinks',
        status: 'fail',
        duration_ms: 0,
        summary: `Backlinks failed: ${(e.message || '').slice(0, 100)}`,
      };
    }
  }
}

async function runOrphansPhase(): Promise<PhaseResult> {
  try {
    const { findOrphans } = await import('./orphans.ts');
    const result = await findOrphans(false);
    const count = result?.total_orphans ?? 0;
    // Group by domain
    const domains: Record<string, number> = {};
    for (const o of result?.orphans ?? []) {
      const d = o.domain || 'unknown';
      domains[d] = (domains[d] || 0) + 1;
    }
    return {
      phase: 'orphans',
      status: count > 20 ? 'warn' : 'ok',
      duration_ms: 0,
      summary: `${count} orphan pages (no inbound links)`,
      details: { count, by_domain: domains },
    };
  } catch (e: any) {
    // Fallback: shell out
    const { execSync } = await import('child_process');
    try {
      const output = execSync(
        `bun run ${join(import.meta.dir, '..', 'cli.ts')} orphans --json`,
        { encoding: 'utf-8', timeout: 60_000 },
      );
      const data = JSON.parse(output);
      const count = data.total ?? data.orphans?.length ?? 0;
      return {
        phase: 'orphans',
        status: count > 20 ? 'warn' : 'ok',
        duration_ms: 0,
        summary: `${count} orphan pages`,
        details: { count },
      };
    } catch {
      return {
        phase: 'orphans',
        status: 'fail',
        duration_ms: 0,
        summary: `Orphan check failed: ${(e.message || '').slice(0, 100)}`,
      };
    }
  }
}

async function runEmbedPhase(engine: BrainEngine): Promise<PhaseResult> {
  const { execSync } = await import('child_process');
  try {
    const output = execSync(
      `bun run ${join(import.meta.dir, '..', 'cli.ts')} embed --stale --json`,
      { encoding: 'utf-8', timeout: 300_000 },
    );
    const data = JSON.parse(output);
    const embedded = data.embedded ?? data.count ?? 0;
    return {
      phase: 'embed',
      status: 'ok',
      duration_ms: 0,
      summary: `${embedded} stale pages re-embedded`,
      details: { embedded },
    };
  } catch (e: any) {
    const stdout = e.stdout || '';
    try {
      const data = JSON.parse(stdout);
      const embedded = data.embedded ?? data.count ?? 0;
      return {
        phase: 'embed',
        status: 'ok',
        duration_ms: 0,
        summary: `${embedded} pages re-embedded`,
        details: { embedded },
      };
    } catch {
      return {
        phase: 'embed',
        status: 'fail',
        duration_ms: 0,
        summary: `Embed failed: ${(e.message || '').slice(0, 100)}`,
      };
    }
  }
}

async function runSyncPhase(engine: BrainEngine, brainDir: string): Promise<PhaseResult> {
  const { execSync } = await import('child_process');
  try {
    const output = execSync(
      `bun run ${join(import.meta.dir, '..', 'cli.ts')} sync --repo "${brainDir}" --no-pull`,
      { encoding: 'utf-8', timeout: 300_000 },
    );
    // Parse sync output for page count
    const match = output.match(/(\d+)\s+page/);
    const pages = match ? parseInt(match[1], 10) : 0;
    return {
      phase: 'sync',
      status: 'ok',
      duration_ms: 0,
      summary: `Synced${pages ? ` (${pages} pages)` : ''}`,
      details: { pages },
    };
  } catch (e: any) {
    return {
      phase: 'sync',
      status: 'fail',
      duration_ms: 0,
      summary: `Sync failed: ${(e.message || '').slice(0, 100)}`,
    };
  }
}

// ── Main ────────────────────────────────────────────────────────────

export async function runDream(engine: BrainEngine | null, args: string[]) {
  const opts = parseArgs(args);
  const progress = createProgress(cliOptsToProgressOptions(getCliOptions()));
  const heartbeat = startHeartbeat(progress, 5_000);

  const brainDir = opts.dir ?? findRepoRoot();
  const phases: PhaseResult[] = [];
  const start = performance.now();

  if (!opts.json) {
    console.log('🌙 Dream cycle starting...\n');
  }

  const shouldRun = (phase: string) => !opts.phase || opts.phase === phase;

  try {
    // Phase 1: Lint & Fix
    if (shouldRun('lint') && brainDir) {
      const { result, duration_ms } = await timePhase('lint', () => runLintPhase(brainDir, opts.dryRun), progress);
      result.duration_ms = duration_ms;
      phases.push(result);
      if (!opts.json) {
        const icon = result.status === 'ok' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
        console.log(`${icon} Lint: ${result.summary} (${(duration_ms / 1000).toFixed(1)}s)`);
      }
    }

    // Phase 2: Backlinks
    if (shouldRun('backlinks') && brainDir) {
      const { result, duration_ms } = await timePhase('backlinks', () => runBacklinksPhase(brainDir, opts.dryRun), progress);
      result.duration_ms = duration_ms;
      phases.push(result);
      if (!opts.json) {
        const icon = result.status === 'ok' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
        console.log(`${icon} Backlinks: ${result.summary} (${(duration_ms / 1000).toFixed(1)}s)`);
      }
    }

    // Phase 3: Orphan Sweep (requires DB)
    if (shouldRun('orphans') && engine) {
      const { result, duration_ms } = await timePhase('orphans', () => runOrphansPhase(), progress);
      result.duration_ms = duration_ms;
      phases.push(result);
      if (!opts.json) {
        const icon = result.status === 'ok' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
        console.log(`${icon} Orphans: ${result.summary} (${(duration_ms / 1000).toFixed(1)}s)`);
      }
    }

    // Phase 4: Embed stale content (requires DB)
    if (shouldRun('embed') && !opts.skipEmbed && engine) {
      const { result, duration_ms } = await timePhase('embed', () => runEmbedPhase(engine), progress);
      result.duration_ms = duration_ms;
      phases.push(result);
      if (!opts.json) {
        const icon = result.status === 'ok' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
        console.log(`${icon} Embed: ${result.summary} (${(duration_ms / 1000).toFixed(1)}s)`);
      }
    } else if (shouldRun('embed') && opts.skipEmbed) {
      phases.push({ phase: 'embed', status: 'skipped', duration_ms: 0, summary: 'Skipped (--skip-embed)' });
    }

    // Phase 5: Sync
    if (shouldRun('sync') && !opts.skipSync && brainDir) {
      const { result, duration_ms } = await timePhase('sync', () => runSyncPhase(engine, brainDir), progress);
      result.duration_ms = duration_ms;
      phases.push(result);
      if (!opts.json) {
        const icon = result.status === 'ok' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
        console.log(`${icon} Sync: ${result.summary} (${(duration_ms / 1000).toFixed(1)}s)`);
      }
    } else if (shouldRun('sync') && opts.skipSync) {
      phases.push({ phase: 'sync', status: 'skipped', duration_ms: 0, summary: 'Skipped (--skip-sync)' });
    }

    const totalMs = Math.round(performance.now() - start);

    // Build report
    const report: DreamReport = {
      timestamp: new Date().toISOString(),
      duration_ms: totalMs,
      phases,
      brain_dir: brainDir,
      totals: {
        lint_fixes: (phases.find(p => p.phase === 'lint')?.details?.fixed as number) ?? 0,
        backlinks_added: (phases.find(p => p.phase === 'backlinks')?.details?.added as number) ?? 0,
        orphans_found: (phases.find(p => p.phase === 'orphans')?.details?.count as number) ?? 0,
        pages_embedded: (phases.find(p => p.phase === 'embed')?.details?.embedded as number) ?? 0,
        pages_synced: (phases.find(p => p.phase === 'sync')?.details?.pages as number) ?? 0,
      },
    };

    if (opts.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const failed = phases.filter(p => p.status === 'fail').length;
      const warned = phases.filter(p => p.status === 'warn').length;
      console.log(`\n🌙 Dream cycle complete in ${(totalMs / 1000).toFixed(1)}s`);
      if (failed > 0) {
        console.log(`   ${failed} phase(s) failed — check output above`);
      } else if (warned > 0) {
        console.log(`   ${warned} phase(s) have warnings — brain is getting healthier`);
      } else {
        console.log('   All phases clean — brain is healthy 🧠');
      }
    }

    return report;
  } finally {
    clearInterval(heartbeat);
  }
}
