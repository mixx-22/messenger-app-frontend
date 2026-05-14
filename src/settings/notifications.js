const MUTED_THREADS_KEY = "mutedThreads";

export const MUTE_OPTIONS = [
  { id: "1h", label: "Mute for 1 hour", ms: 60 * 60 * 1000 },
  { id: "8h", label: "Mute for 8 hours", ms: 8 * 60 * 60 * 1000 },
  { id: "tomorrow", label: "Mute until tomorrow", untilTomorrow: true },
  { id: "always", label: "Mute always", ms: null },
];

function normalizeMuteEntry(value) {
  if (value === true) return { until: null };
  if (value && typeof value === "object") {
    return { until: value.until ?? null };
  }
  return null;
}

export function loadMutedThreads() {
  try {
    const raw = localStorage.getItem(MUTED_THREADS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};

    const now = Date.now();
    const next = {};
    let changed = false;

    Object.entries(parsed).forEach(([key, value]) => {
      const entry = normalizeMuteEntry(value);
      if (!entry) return;

      if (entry.until && Number(entry.until) <= now) {
        changed = true;
        return;
      }

      next[key] = entry;
    });

    if (changed) {
      localStorage.setItem(MUTED_THREADS_KEY, JSON.stringify(next));
    }

    return next;
  } catch {
    return {};
  }
}

export function isThreadMuted(threadId) {
  if (!threadId) return false;
  return Boolean(loadMutedThreads()[String(threadId)]);
}

export function muteThread(threadId, optionId) {
  if (!threadId) return null;
  const option = MUTE_OPTIONS.find((item) => item.id === optionId);
  if (!option) return null;

  let until = null;
  if (option.untilTomorrow) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    until = tomorrow.getTime();
  } else if (typeof option.ms === "number") {
    until = Date.now() + option.ms;
  }

  const next = {
    ...loadMutedThreads(),
    [String(threadId)]: { until },
  };
  localStorage.setItem(MUTED_THREADS_KEY, JSON.stringify(next));
  return next[String(threadId)];
}

export function unmuteThread(threadId) {
  const key = String(threadId || "");
  if (!key) return;
  const next = { ...loadMutedThreads() };
  delete next[key];
  localStorage.setItem(MUTED_THREADS_KEY, JSON.stringify(next));
}

export function muteLabel(threadId) {
  const entry = loadMutedThreads()[String(threadId || "")];
  if (!entry) return "";
  if (!entry.until) return "Muted always";
  return `Muted until ${new Date(entry.until).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
