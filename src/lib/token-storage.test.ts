import { beforeEach, describe, expect, it } from "vitest";
import { clearStoredRepoToken, loadStoredRepoToken, saveStoredRepoToken } from "./token-storage";

describe("token-storage", () => {
  const repoKey = "gitlab:group/project";

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("stores session tokens in sessionStorage", () => {
    saveStoredRepoToken(repoKey, "glpat-session", "session");

    expect(loadStoredRepoToken(repoKey)).toEqual({
      token: "glpat-session",
      persistence: "session",
    });
    expect(window.sessionStorage.getItem("mergeai_repo_tokens_session")).toContain("glpat-session");
    expect(window.localStorage.getItem("mergeai_repo_tokens_persistent")).toBeNull();
  });

  it("stores persistent tokens in localStorage", () => {
    saveStoredRepoToken(repoKey, "glpat-persist", "persistent");

    expect(loadStoredRepoToken(repoKey)).toEqual({
      token: "glpat-persist",
      persistence: "persistent",
    });
    expect(window.localStorage.getItem("mergeai_repo_tokens_persistent")).toContain("glpat-persist");
    expect(window.sessionStorage.getItem("mergeai_repo_tokens_session")).toBeNull();
  });

  it("moves tokens between storage types for the same repo", () => {
    saveStoredRepoToken(repoKey, "glpat-session", "session");
    saveStoredRepoToken(repoKey, "glpat-persist", "persistent");

    expect(loadStoredRepoToken(repoKey)).toEqual({
      token: "glpat-persist",
      persistence: "persistent",
    });
    expect(window.sessionStorage.getItem("mergeai_repo_tokens_session")).toBeNull();
  });

  it("clears saved tokens for a repo", () => {
    saveStoredRepoToken(repoKey, "glpat-token", "persistent");

    clearStoredRepoToken(repoKey);

    expect(loadStoredRepoToken(repoKey)).toBeNull();
  });
});
