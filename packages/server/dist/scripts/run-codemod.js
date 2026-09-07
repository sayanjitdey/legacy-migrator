"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ts_morph_1 = require("ts-morph");
const path_1 = __importDefault(require("path"));
const codemod_1 = require("../core/codemod");
const project = new ts_morph_1.Project();
const sourceFile = project.addSourceFileAtPath(path_1.default.join(__dirname, "..", "..", "src", "fixtures", "01-simple-counter.tsx"));
const cls = sourceFile.getClasses()[0];
console.log((0, codemod_1.generateHooksComponent)(cls));
