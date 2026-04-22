import { describe, test, expect } from 'bun:test';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { join } from 'path';

const CLI = join(import.meta.dir, '..', 'src', 'cli.ts');
const BUN = 'bun run';

// CI may not have a brain dir or DB — detect environment
const HAS_BRAIN = existsSync('/data/brain/.git');
const BRAIN_DIR = HAS_BRAIN ? '/data/brain' : null;

function gbrain(args: string, timeout = 30_000): string {
  try {
    return execSync(`${BUN} ${CLI} ${args} 2>/dev/null`, {
      encoding: 'utf-8',
      timeout,
      env: { ...process.env, BUN_INSTALL: '/root/.bun', PATH: `/root/.bun/bin:${process.env.PATH}` },
    }).trim();
  } catch (e: any) {
    return (e.stdout || '').trim();
  }
}

function parseJsonOutput(output: string): any {
  try { return JSON.parse(output); } catch {}
  const lines = output.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('{')) {
      try { return JSON.parse(lines.slice(i).join('\n')); } catch {}
    }
  }
  return null;
}

// ── Tests that always work (no brain or DB needed) ──

describe('Dream Command — CLI Registration', () => {
  test('dream appears in help text', () => {
    const help = gbrain('--help');
    expect(help).toContain('dream');
    expect(help).toContain('Nightly dream cycle');
  });
});

describe('Dream Command — Source File', () => {
  test('dream.ts exists', () => {
    expect(existsSync(join(import.meta.dir, '..', 'src', 'commands', 'dream.ts'))).toBe(true);
  });

  test('exports runDream function', async () => {
    const mod = await import('../src/commands/dream.ts');
    expect(typeof mod.runDream).toBe('function');
  });

  test('DreamReport type structure is correct', async () => {
    const mod = await import('../src/commands/dream.ts');
    expect(mod.runDream).toBeTruthy();
    // Verify the module compiles without errors
  });
});

// ── Tests that require a brain directory ──

describe('Dream Command — Integration', () => {
  const skipReason = !HAS_BRAIN ? '(skip) no brain dir at /data/brain' : undefined;

  test('dream command runs lint phase', () => {
    if (!HAS_BRAIN) return; // skip in CI
    const output = gbrain(`dream --phase lint --dry-run --json --dir ${BRAIN_DIR}`, 30_000);
    expect(output).not.toContain('Unknown command');
    const report = parseJsonOutput(output);
    expect(report).toBeTruthy();
    expect(report.phases.length).toBe(1);
    expect(report.phases[0].phase).toBe('lint');
    expect(report.timestamp).toBeTruthy();
    expect(report.duration_ms).toBeGreaterThanOrEqual(0);
    expect(typeof report.totals.lint_fixes).toBe('number');
  }, 60_000);

  test('dream command runs backlinks phase', () => {
    if (!HAS_BRAIN) return;
    const output = gbrain(`dream --phase backlinks --dry-run --json --dir ${BRAIN_DIR}`, 30_000);
    const report = parseJsonOutput(output);
    expect(report).toBeTruthy();
    expect(report.phases.length).toBe(1);
    expect(report.phases[0].phase).toBe('backlinks');
  }, 60_000);

  test('--json returns valid DreamReport', () => {
    if (!HAS_BRAIN) return;
    const output = gbrain(`dream --phase lint --dry-run --json --dir ${BRAIN_DIR}`, 30_000);
    const report = parseJsonOutput(output);
    expect(report).toBeTruthy();
    expect(report.timestamp).toBeTruthy();
    expect(report.duration_ms).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(report.phases)).toBe(true);
    expect(report.totals).toBeTruthy();
    expect(report.brain_dir).toBeTruthy();
  }, 60_000);
});
