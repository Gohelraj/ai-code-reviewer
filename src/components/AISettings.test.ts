import { beforeEach, describe, expect, it } from "vitest";
import {
  loadRepoDefaults,
  resolveAIConfigForRepo,
  saveRepoDefaults,
  type AIConfig,
} from "./AISettings";

const baseConfig: AIConfig = {
  provider: "openrouter",
  apiKey: "sk-test",
  model: "anthropic/claude-sonnet-4-6",
  customRules: "Prefer guards.",
  postingMode: "inline",
  presets: [
    {
      id: "preset-security",
      name: "Security",
      model: "openai/gpt-5.3",
      customRules: "Focus on auth and secrets.",
      postingMode: "general",
    },
  ],
  lastPresetId: "",
};

describe("AISettings storage helpers", () => {
  beforeEach(() => {
    const storage = new Map<string, string>();
    const storageMock = {
      clear: () => storage.clear(),
      getItem: (key: string) => storage.get(key) ?? null,
      key: (index: number) => [...storage.keys()][index] ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      get length() {
        return storage.size;
      },
    };

    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storageMock,
    });
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storageMock,
    });
  });

  it("stores and loads repository defaults", () => {
    saveRepoDefaults("github:acme/repo", {
      defaultTab: "review",
      postingMode: "general",
    });

    expect(loadRepoDefaults("github:acme/repo")).toEqual({
      defaultTab: "review",
      postingMode: "general",
    });
  });

  it("resolves repository defaults through the saved preset when available", () => {
    saveRepoDefaults("github:acme/repo", {
      lastPresetId: "preset-security",
      postingMode: "general",
    });

    expect(resolveAIConfigForRepo(baseConfig, "github:acme/repo")).toMatchObject({
      model: "openai/gpt-5.3",
      customRules: "Focus on auth and secrets.",
      postingMode: "general",
      lastPresetId: "preset-security",
    });
  });
});
