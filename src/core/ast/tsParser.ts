import { Node, Project, ScriptKind, SyntaxKind } from "ts-morph";
import { createEmptyParsedFileAst, type ParsedFileAst } from "./types";

const project = new Project({
  useInMemoryFileSystem: true,
  skipAddingFilesFromTsConfig: true,
  compilerOptions: {
    allowJs: true,
    target: 7,
    module: 99,
  },
});

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function getCallName(expression: Node): string {
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }

  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }

  if (Node.isElementAccessExpression(expression)) {
    return expression.getExpression().getText();
  }

  return expression.getText();
}

export function parseTypeScriptSource(content: string, filePath = "inline.ts"): ParsedFileAst {
  const scriptKind = filePath.endsWith("x") ? ScriptKind.TSX : ScriptKind.TS;
  let sourceFile: ReturnType<typeof project.createSourceFile> | undefined;
  try {
    sourceFile = project.createSourceFile(filePath, content, { overwrite: true, scriptKind });
    const parsed = createEmptyParsedFileAst();

    parsed.functions = [
      ...sourceFile.getFunctions().map((fn) => ({
        name: fn.getName() ?? "anonymous",
        body: fn.getBodyText() ?? "",
      })),
      ...sourceFile.getVariableDeclarations()
        .filter((declaration) => {
          const initializer = declaration.getInitializer();
          return !!initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer));
        })
        .map((declaration) => ({
          name: declaration.getName(),
          body: declaration.getInitializer()?.getText() ?? "",
        })),
    ];

    parsed.classes = sourceFile.getClasses().map((cls) => ({
      name: cls.getName() ?? "AnonymousClass",
      body: cls.getText(),
    }));

    parsed.methods = sourceFile.getClasses().flatMap((cls) =>
      cls.getMembers()
        .filter(Node.isMethodDeclaration)
        .map((method) => ({
          name: method.getName(),
          className: method.getParentIfKind(SyntaxKind.ClassDeclaration)?.getName() ?? cls.getName() ?? "AnonymousClass",
          body: method.getBodyText() ?? "",
        })),
    );

    parsed.imports = sourceFile.getImportDeclarations().flatMap((declaration) => {
      try {
        const value = declaration.getModuleSpecifierValue();
        return value ? [value] : [];
      } catch {
        return [];
      }
    });

    parsed.calls = dedupe(
      sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).map((callExpression) => {
        const expression = callExpression.getExpression();
        return getCallName(expression);
      }),
    );

    return parsed;
  } catch {
    return createEmptyParsedFileAst();
  } finally {
    try { sourceFile?.forget(); } catch { /* ignore forget errors on corrupt state */ }
  }
}

export interface RuntimeAstSignals {
  hasAwaitInLoop: boolean;
  hasUnawaitedAsyncCall: boolean;
  hasAsyncWithoutErrorHandling: boolean;
}

export function detectRuntimeAstSignals(content: string, filePath = "inline.ts"): RuntimeAstSignals {
  const checkPath = `__rt_${filePath.replace(/[^a-zA-Z0-9_.]/g, "_")}`;
  const scriptKind = filePath.endsWith("x") ? ScriptKind.TSX : ScriptKind.TS;
  let sourceFile: ReturnType<typeof project.createSourceFile> | undefined;
  try {
    sourceFile = project.createSourceFile(checkPath, content, { overwrite: true, scriptKind });
  } catch {
    return { hasAwaitInLoop: false, hasUnawaitedAsyncCall: false, hasAsyncWithoutErrorHandling: false };
  }

  try {
    const loopKinds = [
      SyntaxKind.ForStatement,
      SyntaxKind.ForOfStatement,
      SyntaxKind.ForInStatement,
      SyntaxKind.WhileStatement,
      SyntaxKind.DoStatement,
    ] as const;

    const hasAwaitInLoop = loopKinds.some((kind) =>
      sourceFile.getDescendantsOfKind(kind).some((loop) =>
        loop.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0,
      ),
    );

    const ASYNC_CALL_PATTERN = /^(fetch|save|create|update|delete|remove|send|emit|dispatch|commit|post|put|patch|load|execute|run|perform|handle|submit|upload|download|connect|authenticate|authorize|publish|subscribe|notify|trigger|push|pull|sync|refresh|persist|write|insert|replace|upsert)($|[A-Z_])/;

    const hasUnawaitedAsyncCall = sourceFile
      .getDescendantsOfKind(SyntaxKind.ExpressionStatement)
      .some((stmt) => {
        const expr = stmt.getExpression();
        if (!Node.isCallExpression(expr)) return false;
        const name = getCallName(expr.getExpression());
        return ASYNC_CALL_PATTERN.test(name);
      });

    const asyncFunctions = [
      ...sourceFile.getFunctions().filter((fn) => fn.isAsync()),
      ...sourceFile.getClasses().flatMap((cls) => cls.getMethods().filter((m) => m.isAsync())),
    ];

    const asyncArrowFunctions = sourceFile.getVariableDeclarations().filter((v) => {
      const init = v.getInitializer();
      return !!init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init)) && init.isAsync();
    });

    const hasAsyncWithoutErrorHandling = [...asyncFunctions, ...asyncArrowFunctions].some((fn) => {
      const body = "getBody" in fn ? fn.getBody() : null;
      if (!body || !Node.isBlock(body)) return false;
      return body.getDescendantsOfKind(SyntaxKind.TryStatement).length === 0;
    });

    return { hasAwaitInLoop, hasUnawaitedAsyncCall, hasAsyncWithoutErrorHandling };
  } catch {
    return { hasAwaitInLoop: false, hasUnawaitedAsyncCall: false, hasAsyncWithoutErrorHandling: false };
  } finally {
    try { sourceFile?.forget(); } catch { /* ignore forget errors on corrupt state */ }
  }
}
