"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const classifier_1 = require("../core/classifier");
const fixturesDir = path_1.default.join(__dirname, "..", "..", "src", "fixtures");
const reports = (0, classifier_1.classifyProject)(fixturesDir);
const tierColor = {
    MECHANICAL: "\x1b[32m", // green
    NEEDS_LLM: "\x1b[33m", // yellow
    NEEDS_HUMAN: "\x1b[31m", // red
};
const reset = "\x1b[0m";
console.log(`\nClassified ${reports.length} class component(s):\n`);
for (const report of reports) {
    const color = tierColor[report.tier] ?? "";
    console.log(`${color}[${report.tier}]${reset} ${report.fileName} → ${report.className}`);
    console.log(`  Lifecycle methods: ${report.lifecycleMethods.map((m) => m.name).join(", ") || "none"}`);
    console.log(`  Has refs: ${report.hasRefs} | HOC-wrapped: ${report.isWrappedByHOC} | shouldComponentUpdate: ${report.hasShouldComponentUpdate}`);
    console.log(`  Reasons:`);
    for (const r of report.reasons) {
        console.log(`    - ${r}`);
    }
    console.log("");
}
const summary = reports.reduce((acc, r) => {
    acc[r.tier] = (acc[r.tier] ?? 0) + 1;
    return acc;
}, {});
console.log("Summary:", summary);
