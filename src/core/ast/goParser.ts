import { createEmptyParsedFileAst, type ParsedFileAst } from "./types";

export async function parseGoSource(filePath: string, content: string): Promise<ParsedFileAst> {
  try {
    const { spawn } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const goHelperPath = join(__dirname, "go-helper", "main.go");

    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn("go", ["run", goHelperPath], {
        env: {
          ...process.env,
          GO111MODULE: "off",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";

      child.stdout.on("data", (chunk: Buffer | string) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer | string) => {
        errorOutput += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0 || output.trim()) {
          resolve(output);
          return;
        }
        reject(new Error(errorOutput || `go helper exited with code ${code}`));
      });

      child.stdin.write(JSON.stringify({ filePath, content }));
      child.stdin.end();
    });

    const parsed = JSON.parse(stdout) as ParsedFileAst;
    return {
      ...createEmptyParsedFileAst(),
      ...parsed,
    };
  } catch {
    return createEmptyParsedFileAst();
  }
}
