// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildCallGraph, getFunctionCallees, getFunctionCallers } from "./callGraph";
import { buildFunctionIndex } from "./functionIndex";

describe("callGraph", () => {
  it("maps direct callers and callees from the function index", async () => {
    const functionIndex = await buildFunctionIndex([
      {
        filename: "src/service.ts",
        fullContent: `
          export function createUser() {
            validateUser();
            saveUser();
          }

          export function validateUser() {
            formatUser();
          }

          export function formatUser() {
            return "ok";
          }

          export class UserService {
            persist() {
              createUser();
            }
          }
        `,
        patch: null,
      },
    ]);

    const callGraph = buildCallGraph(functionIndex);

    expect(getFunctionCallees(callGraph, "createUser")).toEqual(expect.arrayContaining(["validateUser"]));
    expect(getFunctionCallers(callGraph, "validateUser")).toEqual(expect.arrayContaining(["createUser"]));
    expect(getFunctionCallers(callGraph, "createUser")).toEqual(expect.arrayContaining(["UserService.persist"]));
    expect(getFunctionCallees(callGraph, "UserService.persist")).toEqual(expect.arrayContaining(["createUser"]));
  });

  it("returns empty results for unknown functions", () => {
    const callGraph = buildCallGraph({});

    expect(getFunctionCallers(callGraph, "missingFn")).toEqual([]);
    expect(getFunctionCallees(callGraph, "missingFn")).toEqual([]);
  });
});
