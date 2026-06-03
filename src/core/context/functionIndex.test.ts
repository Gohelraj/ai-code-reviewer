// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildFunctionIndex, findFunctionDefinition } from "./functionIndex";

describe("functionIndex", () => {
  it("indexes functions and methods across review files", async () => {
    const index = await buildFunctionIndex([
      {
        filename: "src/service.ts",
        fullContent: `
          import { saveUser } from "./repo";

          export async function createUser() {
            await saveUser();
            return formatUser();
          }

          function formatUser() {
            return "ok";
          }

          export class UserService {
            validate() {
              return formatUser();
            }
          }
        `,
        patch: null,
      },
      {
        filename: "user.go",
        fullContent: `
          package sample

          func helper() string {
            return "ok"
          }

          type Service struct{}

          func (s *Service) Run() string {
            return helper()
          }
        `,
        patch: null,
      },
    ]);

    expect(findFunctionDefinition(index, "createUser")).toMatchObject({
      file: "src/service.ts",
    });
    expect(findFunctionDefinition(index, "createUser")?.calls).toEqual(expect.arrayContaining(["saveUser", "formatUser"]));
    expect(findFunctionDefinition(index, "UserService.validate")).toMatchObject({
      file: "src/service.ts",
    });
    expect(findFunctionDefinition(index, "Service.Run")).toMatchObject({
      file: "user.go",
    });
  });

  it("returns null when a function name is absent", () => {
    expect(findFunctionDefinition({}, "missingFn")).toBeNull();
  });
});
