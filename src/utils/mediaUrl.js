import { API_BASE } from "../services/api";

/** Absolute URL for paths stored as `/uploads/...` on the API. */
export function resolveUploadUrl(path) {
  if (!path || typeof path !== "string") return "";
  const p = path.trim();
  if (!p) return "";
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  return `${API_BASE}${p.startsWith("/") ? p : `/${p}`}`;
}
