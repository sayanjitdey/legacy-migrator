import { Project } from "ts-morph";
import path from "path";
import { classifyFile } from "../core/classifier";
import { migrateWithRetry } from "../llm/retry-loop";
import { ollamaMigrationLLM } from "../llm/llm-client-ollama";

async function run() {
  const project = new Project();
  const searchBoxPath = path.join(__dirname, "..", "..", "src", "fixtures", "02-search-box.tsx");
  const sourceFile = project.addSourceFileAtPath(searchBoxPath);
  const cls = sourceFile.getClasses()[0];
  const report = classifyFile(sourceFile)[0];
  const classSourceText = cls.getText();

  const outcome = await migrateWithRetry(
    searchBoxPath,
    classSourceText,
    report,
    ollamaMigrationLLM,
    ""
  );

  console.log(`status: ${outcome.status}, attempts: ${outcome.attempts}`);
  console.log("\n--- generated code ---\n");
  console.log(outcome.code);
  if (outcome.finalDiagnostics.length > 0) {
    console.log("\n--- final diagnostics ---\n", outcome.finalDiagnostics);
  }
}

run();