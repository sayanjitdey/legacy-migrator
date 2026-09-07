"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_morph_1 = require("ts-morph");
const path_1 = __importDefault(require("path"));
const classifier_1 = require("../core/classifier");
const retry_loop_1 = require("../llm/retry-loop");
const llm_client_anthropic_1 = require("../llm/llm-client-anthropic");
async function run() {
    const project = new ts_morph_1.Project();
    const searchBoxPath = path_1.default.join(__dirname, "..", "..", "src", "fixtures", "02-search-box.tsx");
    const sourceFile = project.addSourceFileAtPath(searchBoxPath);
    const cls = sourceFile.getClasses()[0];
    const report = (0, classifier_1.classifyFile)(sourceFile)[0];
    const classSourceText = cls.getText();
    const outcome = await (0, retry_loop_1.migrateWithRetry)(searchBoxPath, classSourceText, report, llm_client_anthropic_1.anthropicMigrationLLM);
    console.log(`status: ${outcome.status}, attempts: ${outcome.attempts}`);
    console.log("\n--- generated code ---\n");
    console.log(outcome.code);
    if (outcome.finalDiagnostics.length > 0) {
        console.log("\n--- final diagnostics ---\n", outcome.finalDiagnostics);
    }
}
run();
