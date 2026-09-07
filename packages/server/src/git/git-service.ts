import simpleGit, { SimpleGit } from "simple-git";
import fs from "fs";
import os from "os";
import path from "path";

const MIGRATION_BRANCH_PREFIX = "legacy-migrator";

// Only allow real remote git URLs — blocks local path/file:// clone
// targets that could otherwise be used to read arbitrary filesystem
// paths back out through the cloned working copy.
const ALLOWED_REPO_URL = /^(https:\/\/[\w.-]+\/[\w.\-/]+?(?:\.git)?|git@[\w.-]+:[\w.\-/]+?(?:\.git)?)$/;

function getGit(repoRoot: string): SimpleGit {
  return simpleGit({ baseDir: repoRoot });
}

// A cloned repo is never npm-installed (we only ever read/parse it), so it
// has no node_modules of its own — bare imports like "react" would fail to
// resolve from anywhere inside it. Linking our own node_modules in at the
// repo root fixes that for react/react-dom (the packages every migration
// actually needs) via ordinary up-tree module resolution, without touching
// how the target repo's *own* relative imports resolve (those already work
// correctly against the real cloned files). A junction on Windows, a
// symlink elsewhere — neither requires elevated privileges. Best-effort:
// if it fails, bare-import diagnostics just fall back to being suppressed
// as "unresolvable third-party dependency" like any other missing package.
function linkNodeModules(targetDir: string): void {
  try {
    const ourNodeModules = path.dirname(path.dirname(require.resolve("react/package.json")));
    const linkPath = path.join(targetDir, "node_modules");
    if (fs.existsSync(linkPath)) return;
    fs.symlinkSync(ourNodeModules, linkPath, process.platform === "win32" ? "junction" : "dir");
  } catch (err) {
    console.warn(
      `[git-service] Could not link node_modules into cloned repo — react type resolution will be unavailable during validation: ${(err as Error).message}`
    );
  }
}

export async function cloneRepo(repoUrl: string): Promise<string> {
  if (!ALLOWED_REPO_URL.test(repoUrl)) {
    throw new Error(`Refusing to clone '${repoUrl}' — only https:// or git@ remote URLs are allowed.`);
  }

  const targetDir = path.join(os.tmpdir(), `legacy-migrator-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(targetDir, { recursive: true });

  const git = simpleGit();
  await git.clone(repoUrl, targetDir, ["--depth", "1"]);
  linkNodeModules(targetDir);

  return targetDir;
}

export async function ensureMigrationBranch(repoRoot: string): Promise<string> {
  const git = getGit(repoRoot);
  const status = await git.status();

  if (status.current?.startsWith(MIGRATION_BRANCH_PREFIX)) {
    return status.current;
  }

  const branchName = `${MIGRATION_BRANCH_PREFIX}/run-${Date.now()}`;
  await git.checkoutLocalBranch(branchName);
  return branchName;
}

export interface CommitResult {
  branch: string;
  commitHash: string;
}

function assertPathWithinRepo(repoRoot: string, filePath: string): string {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedPath = path.resolve(repoRoot, filePath);
  const relative = path.relative(resolvedRoot, resolvedPath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside repo root: '${filePath}'`);
  }

  return resolvedPath;
}

export async function commitApprovedMigration(
  repoRoot: string,
  filePath: string,
  className: string,
  generatedCode: string
): Promise<CommitResult> {
  const resolvedPath = assertPathWithinRepo(repoRoot, filePath);
  const git = getGit(repoRoot);
  const branch = await ensureMigrationBranch(repoRoot);

  const status = await git.status();
  if (status.current === "main" || status.current === "master") {
    throw new Error(
      `Refusing to commit migration to '${status.current}' — this should never happen. ` +
        `ensureMigrationBranch() should have switched to a legacy-migrator/* branch first.`
    );
  }

  fs.writeFileSync(resolvedPath, generatedCode, "utf-8");

  const relativePath = path.relative(repoRoot, resolvedPath);
  await git.add(relativePath);
  const commitSummary = await git.commit(
    `Migrate ${className} to hooks\n\nAutomated migration, approved via review UI.`
  );

  return { branch, commitHash: commitSummary.commit };
}

export function logRejection(filePath: string, className: string, reason?: string): void {
  console.log(
    `[rejected] ${className} in ${filePath}${reason ? ` — ${reason}` : ""} (no git action taken)`
  );
}