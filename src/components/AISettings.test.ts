import { beforeEach, describe, expect, it } from "vitest";
import {
  loadRepoDefaults,
  loadAIConfig,
  normalizeOpenRouterModel,
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
      auxiliaryModel: "openai/gpt-5.3-mini",
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
      repoMemory: "Payments service. Prioritize idempotency.",
    });

    expect(loadRepoDefaults("github:acme/repo")).toEqual({
      defaultTab: "review",
      postingMode: "general",
      repoMemory: "Payments service. Prioritize idempotency.",
    });
  });

  it("resolves repository defaults through the saved preset when available", () => {
    saveRepoDefaults("github:acme/repo", {
      lastPresetId: "preset-security",
      postingMode: "general",
    });

    expect(resolveAIConfigForRepo(baseConfig, "github:acme/repo")).toMatchObject({
      model: "openai/gpt-5.4",
      auxiliaryModel: "openai/gpt-5.4-mini",
      customRules: "Focus on auth and secrets.",
      repoMemory: "",
      postingMode: "general",
      lastPresetId: "preset-security",
    });
  });

  it("migrates stale saved OpenAI model ids on load", () => {
    localStorage.setItem("mergeai_ai_config", JSON.stringify({
      provider: "openrouter",
      apiKey: "sk-test",
      model: "openai/gpt-5.3",
      auxiliaryModel: "openai/gpt-5.3-mini",
      presets: [
        {
          id: "preset-fast",
          name: "Fast",
          model: "openai/gpt-5.3",
          auxiliaryModel: "openai/gpt-5.3-mini",
          customRules: "",
        },
      ],
      lastPresetId: "preset-fast",
    }));

    expect(loadAIConfig()).toMatchObject({
      model: "openai/gpt-5.4",
      auxiliaryModel: "openai/gpt-5.4-mini",
      lastPresetId: "preset-fast",
    });
  });

  it("falls back to the default model for unsupported ids", () => {
    expect(normalizeOpenRouterModel("openai/not-real")).toBe("anthropic/claude-sonnet-4-6");
  });
});
