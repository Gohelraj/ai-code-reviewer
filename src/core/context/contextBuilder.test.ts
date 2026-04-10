// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildStructuredContext, buildStructuredContextText } from "./contextBuilder";

describe("contextBuilder", () => {
  it("builds graph-aware context for changed files", async () => {
    const allFiles = [
      {
        filename: "src/service.ts",
        status: "modified",
        additions: 3,
        deletions: 0,
        changes: 3,
        patch: "@@ createUser @@\n+validateUser();\n+saveUser();",
        blobUrl: null,
        fullContent: `
          import { saveUser } from "./repo";

          export function createUser() {
            validateUser();
            saveUser();
          }

          export function validateUser() {
            return "ok";
          }
        `,
      },
      {
        filename: "src/controller.ts",
        status: "context",
        additions: 0,
        deletions: 0,
        changes: 0,
        patch: null,
        blobUrl: null,
        fullContent: `
          export function submit() {
            createUser();
          }
        `,
      },
      {
        filename: "src/repo.ts",
        status: "context",
        additions: 0,
        deletions: 0,
        changes: 0,
        patch: null,
        blobUrl: null,
        fullContent: `
          export function saveUser() {
            return true;
          }
        `,
      },
    ];

    const context = await buildStructuredContext(
      [allFiles[0]],
      allFiles,
      [
        {
          file: "src/repo.ts",
          reason: "Imported by src/service.ts",
          source: "import",
          excerpt: "saveUser",
        },
      ],
    );

    expect(context.files[0].changedFunctions).toContain("createUser");
    expect(context.files[0].callers).toEqual(expect.arrayContaining([{ function: "submit", file: "src/controller.ts" }]));
    expect(context.files[0].callees).toEqual(expect.arrayContaining([{ function: "saveUser", file: "src/repo.ts" }]));
    expect(context.files[0].imports).toContain("./repo");
    expect(context.files[0].relatedFiles).toContain("src/repo.ts");
    expect(buildStructuredContextText(context)).toContain("CHANGED FUNCTIONS:");
    expect(buildStructuredContextText(context)).toContain("CALLERS:");
    expect(buildStructuredContextText(context)).toContain("CALLEES:");
  });

  it("limits structured context size for larger bodies", async () => {
    const largeBody = "x".repeat(2_000);
    const context = await buildStructuredContext(
      [{
        filename: "src/big.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: "@@ huge @@\n+hugeFunction",
        blobUrl: null,
        fullContent: `export function hugeFunction() { return "${largeBody}"; }`,
      }],
      [{
        filename: "src/big.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        changes: 1,
        patch: "@@ huge @@\n+hugeFunction",
        blobUrl: null,
        fullContent: `export function hugeFunction() { return "${largeBody}"; }`,
      }],
      [],
    );

    const text = buildStructuredContextText(context);
    expect(text.length).toBeLessThanOrEqual(8_030);
  });
});
