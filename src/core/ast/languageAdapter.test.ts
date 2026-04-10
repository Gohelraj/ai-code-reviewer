// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseFile } from "./languageAdapter";

describe("languageAdapter", () => {
  it("parses TypeScript functions, classes, methods, imports, and calls", async () => {
    const source = `
      import { helper } from "./helper";

      export function alpha() {
        helper();
        beta();
      }

      const beta = () => helper();

      export class Runner {
        run() {
          alpha();
        }
      }
    `;

    const parsed = await parseFile("src/example.ts", source);

    expect(parsed.imports).toContain("./helper");
    expect(parsed.functions.map((fn) => fn.name)).toEqual(expect.arrayContaining(["alpha", "beta"]));
    expect(parsed.classes.map((cls) => cls.name)).toContain("Runner");
    expect(parsed.methods.map((method) => method.name)).toContain("run");
    expect(parsed.calls).toEqual(expect.arrayContaining(["helper", "beta", "alpha"]));
  });

  it("parses Go functions, methods, imports, and calls", async () => {
    const source = `
      package sample

      import "fmt"

      type Service struct{}

      func helper() {
        fmt.Println("ok")
      }

      func (s *Service) Run() {
        helper()
      }
    `;

    const parsed = await parseFile("service.go", source);

    expect(parsed.imports).toContain("fmt");
    expect(parsed.functions.map((fn) => fn.name)).toContain("helper");
    expect(parsed.methods.map((method) => method.name)).toContain("Run");
    expect(parsed.calls).toEqual(expect.arrayContaining(["Println", "helper"]));
  });
});
