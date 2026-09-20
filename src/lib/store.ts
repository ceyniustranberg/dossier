import type { Dossier } from "./types";

/**
 * Persistence boundary. The prototype keeps files in this browser's localStorage;
 * swap this module for API calls backed by a database when accounts arrive.
 */
const KEY = "dossier.files.v1";
const LAST = "dossier.last";

function read(): Record<string, Dossier> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; }
}
function write(m: Record<string, Dossier>) {
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ }
}

export const store = {
  list(): Dossier[] { return Object.values(read()).sort((a, b) => b.createdAt - a.createdAt); },
  get(id: string): Dossier | null { return read()[id] ?? null; },
  save(d: Dossier) { const m = read(); m[d.id] = d; write(m); },
  remove(id: string) { const m = read(); delete m[id]; write(m); },
  lastId(): string | null { try { return localStorage.getItem(LAST); } catch { return null; } },
  remember(id: string) { try { localStorage.setItem(LAST, id); } catch { /* ignore */ } },
};
