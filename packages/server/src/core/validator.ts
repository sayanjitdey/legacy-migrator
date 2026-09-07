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
  const tempFilePath = path.join(dir, `${base}.generated.tsx`);

  const project = new Project({
    tsConfigFilePath: path.join(__dirname, "..", "..", "tsconfig.json"),
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
    .filter((d) => d.getSourceFile()?.getFilePath() === tempSourceFile.getFilePath());

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
