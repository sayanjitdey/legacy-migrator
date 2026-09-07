import path from "path";
import { ollamaMigrationLLM } from "../llm/llm-client-ollama";
import { runEvalTrials, printSummary } from "../pipeline/eval-harness";

const NUM_TRIALS = Number(process.env.EVAL_TRIALS ?? 5);

async function run() {
  console.log(`Using Ollama model: ${process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b"}`);
  console.log(`Running ${NUM_TRIALS} trials against 02-search-box.tsx...\n`);

  const fixturePath = path.join(__dirname, "..", "..", "src", "fixtures", "02-search-box.tsx");
  const results = await runEvalTrials(fixturePath, ollamaMigrationLLM, NUM_TRIALS);
  printSummary(results);
}

run();
