/**
 * Base URL for the live tracker API (Azure Container App).
 * In local dev, falls back to same-origin `/api/*` (Next route reads tracker files).
 */
export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "";
}

export function apiUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  return base ? `${base}${p}` : p;
}

/** Same-origin or worker API + disable caching (fixes stale dashboard on SWA/CDN). */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), { ...init, cache: "no-store" });
}

/** Numeric score from tracker cells like "4/5", "3.4/5", "4" */
export function parseScore(score: string): number {
  const m = String(score).match(/(\d+\.?\d*)/);
  return m ? parseFloat(m[1]) : 0;
}

export function extractUrlFromNotes(notes: string): string | null {
  const m = notes?.match(/https?:\/\/[^\s)]+/);
  return m ? m[0].replace(/[,;.]$/, "") : null;
}
