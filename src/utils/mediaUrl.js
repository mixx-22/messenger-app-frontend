import { API_BASE } from "../services/api";

/** Absolute URL for paths stored as `/uploads/...` on the API. */
export function resolveUploadUrl(path) {
  if (!path || typeof path !== "string") return "";
  const p = path.trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (p.startsWith("/gifs/")) {
    return `${API_BASE}/api/gifs/file/${p.slice("/gifs/".length)}`;
  }
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}
