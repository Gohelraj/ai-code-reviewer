// @vitest-environment node

import { describe, expect, it } from "vitest";
import { analyzeImpact, buildImpactAnalysisText } from "./impactAnalyzer";

describe("impactAnalyzer", () => {
  it("classifies cross-layer changes as higher risk", () => {
    const impact = analyzeImpact(
      [
        {
          filename: "src/controllers/userController.ts",
          status: "modified",
          additions: 10,
          deletions: 2,
          changes: 12,
          patch: "@@ createUser @@",
          blobUrl: null,
          fullContent: null,
        },
      ],
      {
        files: [
          {
            file: "src/controllers/userController.ts",
            changedFunctions: ["createUser"],
            functionBodies: [{ name: "createUser", body: "..." }],
            callers: [],
            callees: [
              { function: "saveUser", file: "src/services/userService.ts" },
              { function: "insertUser", file: "src/repository/userRepo.ts" },
            ],
            imports: [],
            relatedFiles: ["src/services/userService.ts", "src/repository/userRepo.ts"],
          },
        ],
      },
    );

    expect(impact.risk).toBe("high");
    expect(impact.touchedLayers).toEqual(expect.arrayContaining(["controller / route", "service", "DB layer"]));
    expect(buildImpactAnalysisText(impact)).toContain("Risk: high");
  });
});
