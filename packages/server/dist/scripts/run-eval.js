"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const llm_client_ollama_1 = require("../llm/llm-client-ollama");
const eval_harness_1 = require("../pipeline/eval-harness");
const NUM_TRIALS = Number(process.env.EVAL_TRIALS ?? 5);
async function run() {
    console.log(`Using Ollama model: ${process.env.OLLAMA_MODEL ?? "qwen2.5-coder:7b"}`);
    console.log(`Running ${NUM_TRIALS} trials against 02-search-box.tsx...\n`);
    const fixturePath = path_1.default.join(__dirname, "..", "..", "src", "fixtures", "02-search-box.tsx");
    const results = await (0, eval_harness_1.runEvalTrials)(fixturePath, llm_client_ollama_1.ollamaMigrationLLM, NUM_TRIALS);
    (0, eval_harness_1.printSummary)(results);
}
run();
