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
    const importLine = hooksUsed.length > 0
        ? `import React, { ${hooksUsed.join(", ")} } from "react";`
        : `import React from "react";`;
    return [
        importLine,
        "",
        `function ${className}(props: any) {`,
        useStateLines,
        effectBlock,
        ...methodBlocks,
        "",
        `  return (`,
        `    ${jsxText}`,
        `  );`,
        `}`,
        "",
        `export default ${className};`,
    ]
        .filter((line) => line !== "")
        .join("\n");
}
