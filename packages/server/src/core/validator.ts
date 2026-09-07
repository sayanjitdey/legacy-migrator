import { Project, Diagnostic } from "ts-morph";
import path from "path";
import fs from "fs";

export interface ValidationResult {
  valid: boolean;
  diagnostics: string[];
  testResult: "passed" | "failed" | "skipped_no_tests";
}

/**
 * Validates generated code by asking the *real* TypeScript compiler about
 * it — not by re-running our own AST checks (that would just validate our
 * own assumptions against themselves). We write the generated code into a
 * real ts-morph Project (loaded with the repo's actual tsconfig, so it has
 * real type information — React types, etc.) and ask for diagnostics.
 */
export function validateGeneratedCode(
  originalFilePath: string,
  generatedCode: string
): ValidationResult {
  const dir = path.dirname(originalFilePath);
  const base = path.basename(originalFilePath, path.extname(originalFilePath));
  // Deliberately validated next to the original file, not in some fixed
  // scratch directory — the generated code's relative imports (./Api,
  // ./Designer, ...) only resolve correctly from here, against the real
  // sibling files. A cloned repo has no node_modules of its own for bare
  // imports like "react" to resolve against; cloneRepo() addresses that by
  // linking one in at the repo root, which this directory sits under.
  const tempFilePath = path.join(dir, `${base}.generated.tsx`);

  const project = new Project({
    tsConfigFilePath: path.join(__dirname, "..", "..", "tsconfig.json"),
    // Generated code always types its own `props` explicitly, so this
    // isn't relaxing a check on the migration itself — it's needed because
    // the generated file also carries forward whatever untyped sibling
    // code (helper components, plain JS functions) the original file had.
    // For a plain-JS source repo those were never typed to begin with, and
    // flagging that as a validation failure would reject nearly every
    // migration from a JS codebase over code the migration didn't touch.
    compilerOptions: { noImplicitAny: false },
  });

  // Overwrite: true lets us re-run this repeatedly without ts-morph
  // complaining the file already exists in the project.
  const tempSourceFile = project.createSourceFile(tempFilePath, generatedCode, {
    overwrite: true,
  });

  // getPreEmitDiagnostics() is the same check `tsc --noEmit` runs — it
  // catches BOTH syntax errors (malformed code) and type errors (using
  // `this` where it doesn't exist, wrong prop types, etc.) in one pass.
  const diagnostics: Diagnostic[] = project
    .getPreEmitDiagnostics()
    .filter((d) => d.getSourceFile()?.getFilePath() === tempSourceFile.getFilePath())
    // TS2307 "Cannot find module" on a *bare* package specifier (e.g.
    // "react-router-dom") just means this repo's dependencies were never
    // npm-installed — expected for a git-cloned target repo, not a defect
    // the migration introduced. A *relative* specifier ("./Foo") failing
    // to resolve is different: that would mean the codemod produced a
    // genuinely broken reference, so those still fail validation.
    .filter((d) => {
      if (d.getCode() !== 2307) return true;
      const message = d.getMessageText();
      const messageText = typeof message === "string" ? message : message.getMessageText();
      const specifier = messageText.match(/Cannot find module '([^']+)'/)?.[1] ?? "";
      return specifier.startsWith(".") || specifier.startsWith("/");
    });

  const diagnosticMessages = diagnostics.map((d) => {
    const lineNum = d.getLineNumber();
    const message = d.getMessageText();
    const messageText = typeof message === "string" ? message : message.getMessageText();
    return `Line ${lineNum}: ${messageText}`;
  });

  // Clean up the temp file from disk — we only needed it in-memory for
  // the type-checker; we don't want stray .generated.tsx files littering
  // the repo after every validation run.
  if (fs.existsSync(tempFilePath)) {
    fs.unlinkSync(tempFilePath);
  }

  // Test-suite step: look for a sibling <Component>.test.tsx. Actually
  // running it would require jest wired into this project (a real
  // dependency to add later, in Week 5+ when there's something worth
  // testing end-to-end). For now we honestly report that we skipped it
  // rather than pretending test coverage exists.
  const testFilePath = path.join(dir, `${base}.test.tsx`);
  const testResult: ValidationResult["testResult"] = fs.existsSync(testFilePath)
    ? "failed" // placeholder — see README limitation: not wired to jest yet
    : "skipped_no_tests";

  return {
    valid: diagnosticMessages.length === 0,
    diagnostics: diagnosticMessages,
    testResult,
  };
}
