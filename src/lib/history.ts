import type { AnalysisState } from "../types";
import type { AIConfig } from "../components/AISettings";

export interface HistoryEntry {
  id: string;
  url: string;
  prTitle: string;
  platform: "github" | "gitlab";
  model: string;
  timestamp: number;
  state: AnalysisState;
  aiConfig: AIConfig;
}

const DB_NAME = "mergeai_history";
const STORE_NAME = "analyses";
const DB_VERSION = 1;
const MAX_ENTRIES = 20;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAnalysis(
  url: string,
  state: AnalysisState,
  aiConfig: AIConfig,
): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      prTitle: state.mrData?.pr.title ?? "Unknown PR",
      platform: state.mrData?.platform ?? "github",
      model: aiConfig.model,
      timestamp: Date.now(),
      state,
      aiConfig,
    };

    store.add(entry);

    // Prune old entries beyond MAX_ENTRIES
    const index = store.index("timestamp");
    const countReq = store.count();
    countReq.onsuccess = () => {
      if (countReq.result > MAX_ENTRIES) {
        const deleteCount = countReq.result - MAX_ENTRIES;
        let deleted = 0;
        const cursor = index.openCursor();
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (c && deleted < deleteCount) {
            c.delete();
            deleted++;
            c.continue();
          }
        };
      }
    };

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — history is a nice-to-have
  }
}

export async function getHistory(): Promise<HistoryEntry[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("timestamp");

    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => {
        const entries = request.result as HistoryEntry[];
        // Return newest first
        resolve(entries.reverse());
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

export async function deleteAnalysis(id: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail
  }
}

export async function loadAnalysis(id: string): Promise<HistoryEntry | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result as HistoryEntry | null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}
