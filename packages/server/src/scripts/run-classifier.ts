import path from "path";
import { classifyProject } from "../core/classifier";

const fixturesDir = path.join(__dirname, "..", "..", "src", "fixtures");
const reports = classifyProject(fixturesDir);

const tierColor: Record<string, string> = {
  MECHANICAL: "\x1b[32m", // green
  NEEDS_LLM: "\x1b[33m", // yellow
  NEEDS_HUMAN: "\x1b[31m", // red
};
const reset = "\x1b[0m";

console.log(`\nClassified ${reports.length} class component(s):\n`);

for (const report of reports) {
  const color = tierColor[report.tier] ?? "";
  console.log(
    `${color}[${report.tier}]${reset} ${report.fileName} → ${report.className}`
  );
  console.log(`  Lifecycle methods: ${report.lifecycleMethods.map((m) => m.name).join(", ") || "none"}`);
  console.log(`  Has refs: ${report.hasRefs} | HOC-wrapped: ${report.isWrappedByHOC} | shouldComponentUpdate: ${report.hasShouldComponentUpdate}`);
  console.log(`  Reasons:`);
  for (const r of report.reasons) {
    console.log(`    - ${r}`);
  }
  console.log("");
}

const summary = reports.reduce<Record<string, number>>((acc, r) => {
  acc[r.tier] = (acc[r.tier] ?? 0) + 1;
  return acc;
}, {});
console.log("Summary:", summary);
