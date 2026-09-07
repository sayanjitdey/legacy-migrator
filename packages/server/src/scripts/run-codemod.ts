import { Project } from "ts-morph";
import path from "path";
import { generateHooksComponent } from "../core/codemod";

const project = new Project();
const sourceFile = project.addSourceFileAtPath(
  path.join(__dirname, "..", "..", "src", "fixtures", "01-simple-counter.tsx")
);

const cls = sourceFile.getClasses()[0];
console.log(generateHooksComponent(cls));
