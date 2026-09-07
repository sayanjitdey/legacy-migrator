"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloneRepo = cloneRepo;
exports.ensureMigrationBranch = ensureMigrationBranch;
exports.commitApprovedMigration = commitApprovedMigration;
exports.logRejection = logRejection;
const simple_git_1 = __importDefault(require("simple-git"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const MIGRATION_BRANCH_PREFIX = "legacy-migrator";
// Only allow real remote git URLs — blocks local path/file:// clone
// targets that could otherwise be used to read arbitrary filesystem
// paths back out through the cloned working copy.
const ALLOWED_REPO_URL = /^(https:\/\/[\w.-]+\/[\w.\-/]+?(?:\.git)?|git@[\w.-]+:[\w.\-/]+?(?:\.git)?)$/;
function getGit(repoRoot) {
    return (0, simple_git_1.default)({ baseDir: repoRoot });
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
function linkNodeModules(targetDir) {
    try {
        const ourNodeModules = path_1.default.dirname(path_1.default.dirname(require.resolve("react/package.json")));
        const linkPath = path_1.default.join(targetDir, "node_modules");
        if (fs_1.default.existsSync(linkPath))
            return;
        fs_1.default.symlinkSync(ourNodeModules, linkPath, process.platform === "win32" ? "junction" : "dir");
    }
    catch (err) {
        console.warn(`[git-service] Could not link node_modules into cloned repo — react type resolution will be unavailable during validation: ${err.message}`);
    }
}
async function cloneRepo(repoUrl) {
    if (!ALLOWED_REPO_URL.test(repoUrl)) {
        throw new Error(`Refusing to clone '${repoUrl}' — only https:// or git@ remote URLs are allowed.`);
    }
    const targetDir = path_1.default.join(os_1.default.tmpdir(), `legacy-migrator-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs_1.default.mkdirSync(targetDir, { recursive: true });
    const git = (0, simple_git_1.default)();
    await git.clone(repoUrl, targetDir, ["--depth", "1"]);
    linkNodeModules(targetDir);
    return targetDir;
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
