import simpleGit, { SimpleGit } from "simple-git";
import fs from "fs";
import path from "path";

const MIGRATION_BRANCH_PREFIX = "legacy-migrator";

function getGit(repoRoot: string): SimpleGit {
  return simpleGit({ baseDir: repoRoot });
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