import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

beforeAll(() => {
  const localStorageMock = createMemoryStorage();
  const sessionStorageMock = createMemoryStorage();

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: sessionStorageMock,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: sessionStorageMock,
  });

  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }

  if (!window.CSS) {
    vi.stubGlobal("CSS", { escape: (value: string) => value });
  } else if (!window.CSS.escape) {
    window.CSS.escape = (value: string) => value;
  }

  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }

  if (!navigator.clipboard) {
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});
