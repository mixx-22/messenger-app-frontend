export const APPEARANCE_STORAGE_KEY = "huniAppearanceMode";

export const APPEARANCE_MODES = {
  light: {
    id: "light",
    label: "Light mode",
    shellBg: "#dfe5ec",
    panelBg: "#ffffff",
    panelMutedBg: "#f5f5f5",
    surfaceBg: "#ffffff",
    surfaceMutedBg: "#f7f7fb",
    cardBg: "#ffffff",
    inputBg: "#f3f4f6",
    inputStrongBg: "#ffffff",
    border: "#e5e7eb",
    borderStrong: "#d8d8d8",
    text: "#17111f",
    textMuted: "#6b7280",
    textSubtle: "#9ca3af",
    hoverBg: "#f3f4f6",
    selectedBg: "#dbeafe",
    selectedText: "#1e3a8a",
    modalOverlay: "blackAlpha.400",
    modalBg: "#ffffff",
    emptyBg: "#f9fafb",
    heroBg: "#f7f4fb",
    chatFallbackBg:
      "linear-gradient(135deg, #b6d68f 0%, #7dc4a0 55%, #d7dbc0 100%)",
  },
  dark: {
    id: "dark",
    label: "Dark mode",
    shellBg: "#0b1020",
    panelBg: "#101827",
    panelMutedBg: "#0f172a",
    surfaceBg: "#111827",
    surfaceMutedBg: "#0b1220",
    cardBg: "#172033",
    inputBg: "#1f2937",
    inputStrongBg: "#111827",
    border: "#263244",
    borderStrong: "#334155",
    text: "#f8fafc",
    textMuted: "#cbd5e1",
    textSubtle: "#94a3b8",
    hoverBg: "#1e293b",
    selectedBg: "#312e81",
    selectedText: "#eef2ff",
    modalOverlay: "blackAlpha.700",
    modalBg: "#111827",
    emptyBg: "#0f172a",
    heroBg: "#0b1020",
    chatFallbackBg:
      "linear-gradient(135deg, #111827 0%, #1e293b 54%, #0f172a 100%)",
  },
};

export function loadAppearanceMode() {
  try {
    const saved = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return saved === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function saveAppearanceMode(mode) {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
  } catch {
    /* ignore unavailable storage */
  }
}

export function withAppearanceChatTheme(theme, appearance) {
  if (appearance.id !== "dark") return theme;

  return {
    ...theme,
    soft: "#334155",
    headerBg: "rgba(15,23,42,0.94)",
    inputBg: "#101827",
    listBg: "#0f172a",
    windowBg: "linear-gradient(135deg, #0f172a 0%, #111827 100%)",
  };
}
