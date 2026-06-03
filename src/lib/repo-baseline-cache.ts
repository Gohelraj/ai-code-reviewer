const CACHE_KEY_PREFIX = "repo-baseline-v1:";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CachedBaseline {
  memory: string;
  timestamp: number;
}

export function getCachedBaseline(repoKey: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + repoKey);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedBaseline;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY_PREFIX + repoKey);
      return null;
    }
    return cached.memory;
  } catch {
    return null;
  }
}

export function setCachedBaseline(repoKey: string, memory: string): void {
  try {
    localStorage.setItem(
      CACHE_KEY_PREFIX + repoKey,
      JSON.stringify({ memory, timestamp: Date.now() } satisfies CachedBaseline),
    );
  } catch { /* ignore quota errors */ }
}
