function resolveApiBase() {
  const fallback = "http://localhost:4000";

  if (typeof window === "undefined") return fallback;

  const configured = import.meta.env.VITE_API_BASE;
  const browserHost = window.location.hostname;
  const browserProtocol = window.location.protocol || "http:";

  if (configured) {
    try {
      const url = new URL(configured);
      const isLocalConfiguredHost =
        url.hostname === "localhost" || url.hostname === "127.0.0.1";
      const isLanBrowserHost =
        browserHost !== "localhost" && browserHost !== "127.0.0.1";

      if (isLocalConfiguredHost && isLanBrowserHost) {
        url.hostname = browserHost;
        return url.origin;
      }

      return url.origin;
    } catch {
      return configured;
    }
  }

  if (browserProtocol === "file:") {
    return fallback;
  }

  if (window.location.port === "4000") {
    return window.location.origin;
  }

  return `${browserProtocol}//${browserHost}:4000`;
}

export const API_BASE = resolveApiBase();

export function authHeadersJSON(token) {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function authHeaders(token) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
