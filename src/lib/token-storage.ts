export type TokenPersistence = "session" | "persistent";

interface StoredTokenResult {
  token: string;
  persistence: TokenPersistence;
}

const SESSION_STORAGE_KEY = "mergeai_repo_tokens_session";
const LOCAL_STORAGE_KEY = "mergeai_repo_tokens_persistent";

function readTokenMap(storage: Storage, key: string): Record<string, string> {
  try {
    const raw = storage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTokenMap(storage: Storage, key: string, value: Record<string, string>) {
  try {
    if (Object.keys(value).length === 0) {
      storage.removeItem(key);
      return;
    }
    storage.setItem(key, JSON.stringify(value));
  } catch {}
}

function removeRepoToken(storage: Storage, key: string, repoKey: string) {
  const tokens = readTokenMap(storage, key);
  if (!(repoKey in tokens)) return;
  delete tokens[repoKey];
  writeTokenMap(storage, key, tokens);
}

export function loadStoredRepoToken(repoKey?: string | null): StoredTokenResult | null {
  if (!repoKey || typeof window === "undefined") return null;

  const persistentTokens = readTokenMap(window.localStorage, LOCAL_STORAGE_KEY);
  if (persistentTokens[repoKey]) {
    return { token: persistentTokens[repoKey], persistence: "persistent" };
  }

  const sessionTokens = readTokenMap(window.sessionStorage, SESSION_STORAGE_KEY);
  if (sessionTokens[repoKey]) {
    return { token: sessionTokens[repoKey], persistence: "session" };
  }

  return null;
}

export function saveStoredRepoToken(repoKey: string, token: string, persistence: TokenPersistence) {
  if (!repoKey || typeof window === "undefined") return;

  const trimmedToken = token.trim();
  if (!trimmedToken) {
    clearStoredRepoToken(repoKey);
    return;
  }

  const targetStorage = persistence === "persistent" ? window.localStorage : window.sessionStorage;
  const targetKey = persistence === "persistent" ? LOCAL_STORAGE_KEY : SESSION_STORAGE_KEY;
  const otherStorage = persistence === "persistent" ? window.sessionStorage : window.localStorage;
  const otherKey = persistence === "persistent" ? SESSION_STORAGE_KEY : LOCAL_STORAGE_KEY;

  removeRepoToken(otherStorage, otherKey, repoKey);

  const tokens = readTokenMap(targetStorage, targetKey);
  tokens[repoKey] = trimmedToken;
  writeTokenMap(targetStorage, targetKey, tokens);
}

export function clearStoredRepoToken(repoKey?: string | null) {
  if (!repoKey || typeof window === "undefined") return;
  removeRepoToken(window.localStorage, LOCAL_STORAGE_KEY, repoKey);
  removeRepoToken(window.sessionStorage, SESSION_STORAGE_KEY, repoKey);
}
