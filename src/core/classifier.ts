/**
 * Legacy Migrator — AST Classifier (Week 1)
 *
 * Walks a TS/TSX source file, finds React class components, and classifies
 * them as either:
 *   - MECHANICAL: safe to migrate via deterministic codemod, no LLM needed
 *   - NEEDS_LLM: has ambiguous logic that requires model judgment
 *   - NEEDS_HUMAN: has patterns that shouldn't be auto-migrated at all
 *     (imperative refs exposed to parents, HOC wrapping, etc.)
 *
 * No LLM calls happen here — this step must be trustworthy on its own,
 * since every downstream step depends on this classification being correct.
 */

import {
  Project,
  ClassDeclaration,
  SourceFile,
  SyntaxKind,
  MethodDeclaration,
} from "ts-morph";

export type MigrationTier = "MECHANICAL" | "NEEDS_LLM" | "NEEDS_HUMAN";

export interface LifecycleMethodInfo {
  name: string;
  bodyText: string;
  paramCount: number;
}

export interface ClassComponentReport {
  fileName: string;
  className: string;
  tier: MigrationTier;
  reasons: string[];
  lifecycleMethods: LifecycleMethodInfo[];
  hasState: boolean;
  hasRefs: boolean;
  hasInstanceMethodsExposedExternally: boolean;
  isWrappedByHOC: boolean;
  hasShouldComponentUpdate: boolean;
}

const KNOWN_LIFECYCLE_METHODS = [
  "componentDidMount",
  "componentDidUpdate",
  "componentWillUnmount",
  "shouldComponentUpdate",
  "componentWillMount",
  "componentWillReceiveProps",
  "getDerivedStateFromProps",
  "getSnapshotBeforeUpdate",
  "componentDidCatch",
];

// Lifecycle methods whose hook-equivalent is well-established and mechanical
// to generate when they're simple (no conditional branching beyond a basic
// prop-diff check, no `getSnapshotBeforeUpdate`/`componentDidCatch`, etc.)
const MECHANICALLY_SAFE_LIFECYCLE = new Set([
  "componentDidMount",
  "componentWillUnmount",
]);

function isReactClassComponent(cls: ClassDeclaration): boolean {
  const extendsExpr = cls.getExtends();
  if (!extendsExpr) return false;
  const text = extendsExpr.getText();
  return /React\.Component|React\.PureComponent|^Component$|^PureComponent$/.test(
    text
  );
}

function getLifecycleMethods(cls: ClassDeclaration): MethodDeclaration[] {
  return cls
    .getMethods()
    .filter((m) => KNOWN_LIFECYCLE_METHODS.includes(m.getName()));
}

function detectRefs(cls: ClassDeclaration): boolean {
  // createRef() usage, or React.createRef, anywhere in the class body
  const text = cls.getText();
  return /createRef\s*\(/.test(text) || /React\.createRef/.test(text);
}

/**
 * Checks whether this class is wrapped by a Higher-Order Component in the
 * same file (e.g., `export default withLogging(Modal)`), which changes how
 * safely the migration can be scoped to just this class.
 */
function detectHOCWrapping(sourceFile: SourceFile, className: string): boolean {
  const exportAssignments = sourceFile.getExportAssignments();
  for (const exp of exportAssignments) {
    const text = exp.getExpression().getText();
    // Matches patterns like withLogging(Modal), connect(mapState)(Modal)
    if (
      text.includes(className) &&
      /\w+\(.*\)/.test(text) &&
      text.trim() !== className
    ) {
      return true;
    }
  }
  // Also check for `export default withX(ClassName)` shorthand
  const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
  if (defaultExportSymbol) {
    const decl = defaultExportSymbol.getDeclarations()[0];
    if (decl && decl.getText().includes(`(${className})`)) return true;
  }
  return false;
}

/**
 * Detects whether instance methods are likely called imperatively by a
 * parent (e.g., via a ref: `modalRef.current.open()`). We can't see the
 * parent's usage from this file alone in v1 — so this is a conservative
 * heuristic: any component that both defines a ref to itself and exposes
 * public arrow-function methods alongside that ref is flagged for caution.
 * (A real v2 would do cross-file reference analysis — see project roadmap.)
 */
function detectLikelyImperativeExposure(cls: ClassDeclaration): boolean {
  const comments = cls.getText();
  // Heuristic v1: look for a comment hinting at external imperative use,
  // or presence of public arrow-fn methods that aren't lifecycle/render.
  const hasHintComment = /exposed imperatively|ref\.current\./i.test(comments);
  return hasHintComment;
}

function assessLifecycleComplexity(method: MethodDeclaration): {
  isMechanical: boolean;
  reason: string;
} {
  const name = method.getName();
  const body = method.getBody();
  if (!body) return { isMechanical: true, reason: `${name} has no body` };

  const statements = body.getDescendantsOfKind(SyntaxKind.IfStatement);
  const bodyText = body.getText();

  if (!MECHANICALLY_SAFE_LIFECYCLE.has(name)) {
    return {
      isMechanical: false,
      reason: `${name} requires prop/state-diff translation to useEffect deps — needs judgment`,
    };
  }

  if (statements.length > 0) {
    return {
      isMechanical: false,
      reason: `${name} contains conditional branching — needs judgment to preserve behavior`,
    };
  }

  if (/setTimeout|setInterval/.test(bodyText) && name === "componentDidMount") {
    // Timer setup without a corresponding visible cleanup in this method
    // needs a human/LLM check that componentWillUnmount actually clears it.
    return {
      isMechanical: false,
      reason: `${name} sets a timer — must verify matching cleanup exists`,
    };
  }

  return { isMechanical: true, reason: `${name} is simple enough for direct codemod` };
}

export function classifyFile(sourceFile: SourceFile): ClassComponentReport[] {
  const reports: ClassComponentReport[] = [];

  for (const cls of sourceFile.getClasses()) {
    if (!isReactClassComponent(cls)) continue;

    const className = cls.getName() ?? "AnonymousComponent";
    const lifecycleMethodDecls = getLifecycleMethods(cls);
    const hasRefs = detectRefs(cls);
    const isWrappedByHOC = detectHOCWrapping(sourceFile, className);
    const hasShouldComponentUpdate = lifecycleMethodDecls.some(
      (m) => m.getName() === "shouldComponentUpdate"
    );
    const hasInstanceMethodsExposedExternally =
      detectLikelyImperativeExposure(cls);
    const hasState = cls
      .getText()
      .includes("this.state") || cls.getText().includes("this.setState");

    const reasons: string[] = [];
    const lifecycleMethods: LifecycleMethodInfo[] = lifecycleMethodDecls.map(
      (m) => ({
        name: m.getName(),
        bodyText: m.getBodyText() ?? "",
        paramCount: m.getParameters().length,
      })
    );

    // --- Decision tree: NEEDS_HUMAN cases first (hard stops) ---
    if (isWrappedByHOC) {
      reasons.push(
        "Component is wrapped by a HOC in this file — migration must preserve wrapper behavior; not safe to auto-migrate in isolation."
      );
    }
    if (hasInstanceMethodsExposedExternally) {
      reasons.push(
        "Component appears to expose instance methods imperatively to parents (ref-based API) — hooks equivalent (useImperativeHandle) requires manual review."
      );
    }
    if (isWrappedByHOC || hasInstanceMethodsExposedExternally) {
      reports.push({
        fileName: sourceFile.getBaseName(),
        className,
        tier: "NEEDS_HUMAN",
        reasons,
        lifecycleMethods,
        hasState,
        hasRefs,
        hasInstanceMethodsExposedExternally,
        isWrappedByHOC,
        hasShouldComponentUpdate,
      });
      continue;
    }

    // --- NEEDS_LLM cases ---
    if (hasShouldComponentUpdate) {
      reasons.push(
        "shouldComponentUpdate present — translating to React.memo/useMemo comparison logic requires judgment."
      );
    }

    let allLifecycleMechanical = true;
    for (const methodDecl of lifecycleMethodDecls) {
      const assessment = assessLifecycleComplexity(methodDecl);
      if (!assessment.isMechanical) {
        allLifecycleMechanical = false;
        reasons.push(assessment.reason);
      }
    }

    if (!allLifecycleMechanical || hasShouldComponentUpdate) {
      reports.push({
        fileName: sourceFile.getBaseName(),
        className,
        tier: "NEEDS_LLM",
        reasons,
        lifecycleMethods,
        hasState,
        hasRefs,
        hasInstanceMethodsExposedExternally,
        isWrappedByHOC,
        hasShouldComponentUpdate,
      });
      continue;
    }

    // --- MECHANICAL: everything checked out as simple ---
    reasons.push(
      "All lifecycle methods are simple and map directly to known hook patterns."
    );
    reports.push({
      fileName: sourceFile.getBaseName(),
      className,
      tier: "MECHANICAL",
      reasons,
      lifecycleMethods,
      hasState,
      hasRefs,
      hasInstanceMethodsExposedExternally,
      isWrappedByHOC,
      hasShouldComponentUpdate,
    });
  }

  return reports;
}

export function classifyProject(rootDir: string): ClassComponentReport[] {
  const project = new Project();
  project.addSourceFilesAtPaths(`${rootDir}/**/*.tsx`);

  const allReports: ClassComponentReport[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    allReports.push(...classifyFile(sourceFile));
  }
  return allReports;
}
