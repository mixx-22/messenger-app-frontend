/** UI helpers shared with chat; server is source of truth for limits. */

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 ? 0 : v < 10 ? 1 : v < 100 ? 1 : 0;
  return `${v.toFixed(digits)} ${units[i]}`;
}

export const FALLBACK_MAX_ATTACHMENT_BYTES = 200 * 1024 * 1024;
