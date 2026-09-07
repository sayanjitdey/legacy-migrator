import simpleGit from "simple-git";
import { Project } from "ts-morph";
import path from "path";
import fs from "fs";

const WORKSPACE_DIR = path.join(__dirname, "..", "..", "workspace");

export interface IngestRepoInput {
  repoUrl?: string;
  localPath?: string;
}

export async function ingestRepo(input: IngestRepoInput): Promise<string> {
  if (input.localPath) {
    const resolved = path.resolve(input.localPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Local path does not exist: ${resolved}`);
    }
    if (!fs.existsSync(path.join(resolved, ".git"))) {
      throw new Error(
        `${resolved} is not a git repository (no .git folder found) — ` +
          `the approve workflow needs real git history to branch and commit into.`
      );
    }
    return resolved;
  }

  if (input.repoUrl) {
    if (!fs.existsSync(WORKSPACE_DIR)) {
      fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    }
    const repoName = input.repoUrl.split("/").pop()?.replace(/\.git$/, "") ?? "repo";
    const destination = path.join(WORKSPACE_DIR, `${repoName}-${Date.now()}`);
    const git = simpleGit();
    await git.clone(input.repoUrl, destination);
    return destination;
  }

  throw new Error("ingestRepo requires either repoUrl or localPath");
}

export function discoverCandidateFiles(repoRoot: string): string[] {
  const project = new Project({
    compilerOptions: { allowJs: true, jsx: 4 },
  });

  project.addSourceFilesAtPaths([
    `${repoRoot}/**/*.{ts,tsx,js,jsx}`,
    `!${repoRoot}/**/node_modules/**`,
    `!${repoRoot}/**/dist/**`,
    `!${repoRoot}/**/build/**`,
    `!${repoRoot}/**/*.test.{ts,tsx,js,jsx}`,
    `!${repoRoot}/**/*.spec.{ts,tsx,js,jsx}`,
  ]);

  return project.getSourceFiles().map((sf) => sf.getFilePath().toString());
}