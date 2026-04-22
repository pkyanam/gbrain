import { existsSync } from 'fs';
import { isAbsolute, join, resolve as resolvePath } from 'path';

/**
 * Walk up from `startDir` looking for `skills/RESOLVER.md` — the marker of a
 * gbrain repo root. Returns the absolute directory containing `skills/` or
 * null if no such directory is found within 10 levels.
 *
 * `startDir` is parameterized so tests can run hermetically against fixtures.
 * Default matches the prior `doctor.ts`-private implementation.
 */
export function findRepoRoot(startDir: string = process.cwd()): string | null {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'skills', 'RESOLVER.md'))) return dir;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export type SkillsDirSource =
  | 'repo_root'
  | 'openclaw_workspace_env'
  | 'openclaw_workspace_home'
  | 'cwd_skills';

export interface SkillsDirDetection {
  dir: string | null;
  source: SkillsDirSource | null;
}

function hasResolver(skillsDir: string): boolean {
  return existsSync(join(skillsDir, 'RESOLVER.md'));
}

function isGbrainRepoRoot(dir: string): boolean {
  return existsSync(join(dir, 'src', 'cli.ts')) && existsSync(join(dir, 'skills', 'RESOLVER.md'));
}

export function autoDetectSkillsDir(
  startDir: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): SkillsDirDetection {
  const repoRoot = findRepoRoot(startDir);
  if (repoRoot && isGbrainRepoRoot(repoRoot)) {
    return { dir: join(repoRoot, 'skills'), source: 'repo_root' };
  }

  if (env.OPENCLAW_WORKSPACE) {
    const workspace = isAbsolute(env.OPENCLAW_WORKSPACE)
      ? env.OPENCLAW_WORKSPACE
      : resolvePath(startDir, env.OPENCLAW_WORKSPACE);
    const openclawEnvSkills = join(workspace, 'skills');
    if (hasResolver(openclawEnvSkills)) {
      return { dir: openclawEnvSkills, source: 'openclaw_workspace_env' };
    }
  }

  if (env.HOME) {
    const openclawHomeSkills = join(env.HOME, '.openclaw', 'workspace', 'skills');
    if (hasResolver(openclawHomeSkills)) {
      return { dir: openclawHomeSkills, source: 'openclaw_workspace_home' };
    }
  }

  const cwdSkills = join(startDir, 'skills');
  if (hasResolver(cwdSkills)) {
    return { dir: cwdSkills, source: 'cwd_skills' };
  }

  return { dir: null, source: null };
}
