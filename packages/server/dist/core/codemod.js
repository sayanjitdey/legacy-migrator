"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateHooksComponent = generateHooksComponent;
const ts_morph_1 = require("ts-morph");
function extractStateFields(cls) {
    const ctor = cls.getConstructors()[0];
    if (!ctor)
        return [];
    const body = ctor.getBody()?.asKind(ts_morph_1.SyntaxKind.Block);
    if (!body)
        return [];
    const fields = [];
    for (const stmt of body.getStatements()) {
        const expr = stmt.asKind(ts_morph_1.SyntaxKind.ExpressionStatement)?.getExpression();
        const binExpr = expr?.asKind(ts_morph_1.SyntaxKind.BinaryExpression);
        if (!binExpr)
            continue;
        const left = binExpr.getLeft().getText();
        if (left !== "this.state")
            continue;
        const right = binExpr.getRight().asKind(ts_morph_1.SyntaxKind.ObjectLiteralExpression);
        if (!right)
            continue;
        for (const prop of right.getProperties()) {
            const assignment = prop.asKind(ts_morph_1.SyntaxKind.PropertyAssignment);
            if (!assignment)
                continue;
            fields.push({
                name: assignment.getName(),
                initialValue: assignment.getInitializer()?.getText() ?? "undefined",
            });
        }
    }
    return fields;
}
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}
/**
 * Adds whichever hooks (useState, useEffect, ...) the migration needs to
 * the file's existing `react` import, instead of emitting a second,
 * conflicting one. Files with no `react` import yet (unusual, but possible
 * for automatic-JSX-runtime codebases) get one inserted at the top.
 */
function mergeReactImport(sourceFile, hooksUsed) {
    const reactImport = sourceFile
        .getImportDeclarations()
        .find((imp) => imp.getModuleSpecifierValue() === "react");
    if (!reactImport) {
        const named = hooksUsed.length > 0 ? `, { ${hooksUsed.join(", ")} }` : "";
        sourceFile.insertStatements(0, `import React${named} from "react";`);
        return;
    }
    if (!reactImport.getDefaultImport()) {
        reactImport.setDefaultImport("React");
    }
    const existingNamed = new Set(reactImport.getNamedImports().map((ni) => ni.getName()));
    const missingHooks = hooksUsed.filter((h) => !existingNamed.has(h));
    if (missingHooks.length > 0) {
        reactImport.addNamedImports(missingHooks);
    }
}
/**
 * Rewrites `this.state.x` -> `x` and `this.props.y` -> `props.y` throughout
 * a chunk of text-derived AST (we operate on cloned statement text, not the
 * live tree, to keep this pass simple for v1 — see limitations).
 */
function rewriteThisReferences(text, stateFieldNames, methodNames = []) {
    let result = text;
    for (const name of stateFieldNames) {
        // this.state.count -> count
        result = result.replaceAll(`this.state.${name}`, name);
    }
    for (const name of methodNames) {
        // this.increment -> increment
        result = result.replaceAll(`this.${name}`, name);
    }
    // this.props.step -> props.step
    result = result.replaceAll(/this\.props\./g, "props.");
    return result;
}
/**
 * Rewrites a single-key `this.setState({ count: this.state.count + 1 })`
 * call into `setCount(count + 1)`. This is intentionally narrow: v1 only
 * handles single-key setState calls with a plain object literal argument.
 * Anything else should have been caught by the classifier as NEEDS_LLM.
 */
function rewriteSetStateCalls(text, stateFieldNames) {
    let result = text;
    for (const name of stateFieldNames) {
        // Matches: this.setState({ count: <expr> })  (single key only)
        const pattern = new RegExp(`this\\.setState\\(\\{\\s*${name}\\s*:\\s*([^}]+)\\}\\)`, "g");
        result = result.replace(pattern, (_match, exprText) => {
            const rewrittenExpr = rewriteThisReferences(exprText.trim(), stateFieldNames);
            return `set${capitalize(name)}(${rewrittenExpr})`;
        });
    }
    return result;
}
function generateHooksComponent(cls) {
    const className = cls.getName() ?? "Component";
    const stateFields = extractStateFields(cls);
    const stateFieldNames = stateFields.map((f) => f.name);
    // --- useState lines ---
    const useStateLines = stateFields
        .map((f) => `  const [${f.name}, set${capitalize(f.name)}] = useState(${f.initialValue});`)
        .join("\n");
    // --- non-lifecycle, non-render instance methods become plain functions ---
    const lifecycleNames = [
        "componentDidMount",
        "componentDidUpdate",
        "componentWillUnmount",
        "render",
    ];
    const otherMethods = cls
        .getMethods()
        .filter((m) => !lifecycleNames.includes(m.getName()));
    const otherProperties = cls
        .getProperties()
        .filter((p) => p.getInitializer()?.getKind() === ts_morph_1.SyntaxKind.ArrowFunction);
    const methodBlocks = [];
    // class-field arrow functions (e.g. `increment = () => {...}`)
    for (const prop of otherProperties) {
        const name = prop.getName();
        const arrowFn = prop.getInitializer();
        if (!arrowFn)
            continue;
        const params = arrowFn.asKind(ts_morph_1.SyntaxKind.ArrowFunction)?.getParameters()
            .map((p) => p.getText()).join(", ") ?? "";
        const bodyText = arrowFn.asKind(ts_morph_1.SyntaxKind.ArrowFunction)?.getBody().getText() ?? "";
        let rewritten = rewriteSetStateCalls(bodyText, stateFieldNames);
        rewritten = rewriteThisReferences(rewritten, stateFieldNames);
        methodBlocks.push(`  const ${name} = (${params}) => ${rewritten};`);
    }
    // --- componentDidMount / componentWillUnmount -> useEffect ---
    const didMount = cls.getMethods().find((m) => m.getName() === "componentDidMount");
    const willUnmount = cls.getMethods().find((m) => m.getName() === "componentWillUnmount");
    let effectBlock = "";
    if (didMount) {
        const mountBody = didMount.getBodyText() ?? "";
        let rewrittenMount = rewriteThisReferences(mountBody, stateFieldNames);
        const cleanupBody = willUnmount?.getBodyText() ?? "";
        const rewrittenCleanup = rewriteThisReferences(cleanupBody, stateFieldNames);
        effectBlock = `  useEffect(() => {\n    ${rewrittenMount}\n${willUnmount ? `    return () => {\n      ${rewrittenCleanup}\n    };\n` : ""}  }, []);`;
    }
    // --- render() -> return statement ---
    const renderMethod = cls.getMethods().find((m) => m.getName() === "render");
    const renderBody = renderMethod?.getBody()?.asKind(ts_morph_1.SyntaxKind.Block);
    const returnStmt = renderBody
        ?.getStatements()
        .find((s) => s.getKind() === ts_morph_1.SyntaxKind.ReturnStatement);
    const methodNames = [
        ...otherMethods.map((m) => m.getName()),
        ...otherProperties.map((p) => p.getName()),
    ];
    let jsxText = returnStmt?.asKind(ts_morph_1.SyntaxKind.ReturnStatement)?.getExpression()?.getText() ?? "null";
    jsxText = rewriteThisReferences(jsxText, stateFieldNames, methodNames);
    const hooksUsed = [];
    if (stateFields.length > 0)
        hooksUsed.push("useState");
    if (effectBlock)
        hooksUsed.push("useEffect");
    // Match however the class itself was exported, so we don't add a
    // duplicate `export default` when the file already has a separate
    // `export default Foo;` statement further down. Checked as literal
    // modifiers on the class node (not ts-morph's semantic isDefaultExport,
    // which also matches — and would double up with — that separate
    // statement).
    const hasExportModifier = cls.hasModifier(ts_morph_1.SyntaxKind.ExportKeyword);
    const hasDefaultModifier = cls.hasModifier(ts_morph_1.SyntaxKind.DefaultKeyword);
    const exportPrefix = hasExportModifier ? (hasDefaultModifier ? "export default " : "export ") : "";
    const functionText = [
        `${exportPrefix}function ${className}(props: any) {`,
        useStateLines,
        effectBlock,
        ...methodBlocks,
        "",
        `  return (`,
        `    ${jsxText}`,
        `  );`,
        `}`,
    ]
        .filter((line) => line !== "")
        .join("\n");
    const sourceFile = cls.getSourceFile();
    // Replace only the class's own text — every other top-level declaration
    // in the file (imports, sibling components, helper functions, types)
    // stays exactly as it was, instead of being silently dropped.
    cls.replaceWithText(functionText);
    mergeReactImport(sourceFile, hooksUsed);
    return sourceFile.getFullText();
}
