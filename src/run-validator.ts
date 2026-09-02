import { Project } from "ts-morph";
import path from "path";
import { generateHooksComponent } from "./codemod";
import { validateGeneratedCode } from "./validator";

const project = new Project();
const originalPath = path.join(__dirname, "..", "src", "fixtures", "01-simple-counter.tsx");
const sourceFile = project.addSourceFileAtPath(originalPath);
const cls = sourceFile.getClasses()[0];

console.log("=== Case 1: correct codemod output ===");
const goodCode = generateHooksComponent(cls);
const goodResult = validateGeneratedCode(originalPath, goodCode);
console.log(JSON.stringify(goodResult, null, 2));

console.log("\n=== Case 2: deliberately broken output (this.increment left unrewritten) ===");
const brokenCode = goodCode.replace("onClick={increment}", "onClick={this.increment}");
const brokenResult = validateGeneratedCode(originalPath, brokenCode);
console.log(JSON.stringify(brokenResult, null, 2));
