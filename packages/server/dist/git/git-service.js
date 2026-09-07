"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureMigrationBranch = ensureMigrationBranch;
exports.commitApprovedMigration = commitApprovedMigration;
exports.logRejection = logRejection;
const simple_git_1 = __importDefault(require("simple-git"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const MIGRATION_BRANCH_PREFIX = "legacy-migrator";
function getGit(repoRoot) {
    return (0, simple_git_1.default)({ baseDir: repoRoot });
}
async function ensureMigrationBranch(repoRoot) {
    const git = getGit(repoRoot);
    const status = await git.status();
    if (status.current?.startsWith(MIGRATION_BRANCH_PREFIX)) {
        return status.current;
    }
    const branchName = `${MIGRATION_BRANCH_PREFIX}/run-${Date.now()}`;
    await git.checkoutLocalBranch(branchName);
    return branchName;
}
function assertPathWithinRepo(repoRoot, filePath) {
    const resolvedRoot = path_1.default.resolve(repoRoot);
    const resolvedPath = path_1.default.resolve(repoRoot, filePath);
    const relative = path_1.default.relative(resolvedRoot, resolvedPath);
    if (relative.startsWith("..") || path_1.default.isAbsolute(relative)) {
        throw new Error(`Refusing to write outside repo root: '${filePath}'`);
    }
    return resolvedPath;
}
async function commitApprovedMigration(repoRoot, filePath, className, generatedCode) {
    const resolvedPath = assertPathWithinRepo(repoRoot, filePath);
    const git = getGit(repoRoot);
    const branch = await ensureMigrationBranch(repoRoot);
    const status = await git.status();
    if (status.current === "main" || status.current === "master") {
        throw new Error(`Refusing to commit migration to '${status.current}' — this should never happen. ` +
            `ensureMigrationBranch() should have switched to a legacy-migrator/* branch first.`);
    }
    fs_1.default.writeFileSync(resolvedPath, generatedCode, "utf-8");
    const relativePath = path_1.default.relative(repoRoot, resolvedPath);
    await git.add(relativePath);
    const commitSummary = await git.commit(`Migrate ${className} to hooks\n\nAutomated migration, approved via review UI.`);
    return { branch, commitHash: commitSummary.commit };
}
function logRejection(filePath, className, reason) {
    console.log(`[rejected] ${className} in ${filePath}${reason ? ` — ${reason}` : ""} (no git action taken)`);
}
