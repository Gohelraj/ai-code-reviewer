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
  const sourceFile = project.createSourceFile(filePath, content, { overwrite: true, scriptKind });
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

  parsed.imports = sourceFile.getImportDeclarations().map((declaration) => declaration.getModuleSpecifierValue());

  parsed.calls = dedupe(
    sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).map((callExpression) => {
      const expression = callExpression.getExpression();
      return getCallName(expression);
    }),
  );

  sourceFile.forget();
  return parsed;
}
