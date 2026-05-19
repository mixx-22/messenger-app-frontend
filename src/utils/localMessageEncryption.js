const ENCRYPTION_PREFIX = "huni:v1:";
const PROJECT_SECRET = "huni-messenger-local-message-encryption-2026";
const PROJECT_SALT = "messenger-app:huni:local-only:v1";

let keyPromise = null;

function hasCrypto() {
  return Boolean(window.crypto?.subtle && window.crypto?.getRandomValues);
}

function shouldEncryptOutgoingMessages() {
  if (typeof window === "undefined") return false;
  if (window.huniDesktop) return false;
  return window.location.protocol === "https:";
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function encryptionKey() {
  if (!hasCrypto()) return null;
  if (!keyPromise) {
    const encoder = new TextEncoder();
    keyPromise = window.crypto.subtle
      .importKey("raw", encoder.encode(PROJECT_SECRET), "PBKDF2", false, [
        "deriveKey",
      ])
      .then((baseKey) =>
        window.crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: encoder.encode(PROJECT_SALT),
            iterations: 120_000,
            hash: "SHA-256",
          },
          baseKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        ),
      );
  }
  return keyPromise;
}

export function isEncryptedMessageContent(value) {
  return typeof value === "string" && value.startsWith(ENCRYPTION_PREFIX);
}

function isEmojiOnlyContent(value) {
  const compact = String(value || "")
    .replace(/\s/g, "")
    .replace(/\u200d/g, "")
    .replace(/\ufe0f/g, "");
  if (!compact) return false;

  return Array.from(compact).every((char) => {
    const code = char.codePointAt(0);
    return (
      (code >= 0x1f000 && code <= 0x1faff) ||
      (code >= 0x2600 && code <= 0x27bf) ||
      code === 0x2764
    );
  });
}

export async function encryptMessageContent(value) {
  if (typeof value !== "string" || value === "" || isEncryptedMessageContent(value)) {
    return value;
  }
  if (!shouldEncryptOutgoingMessages()) return value;
  if (isEmojiOnlyContent(value)) return value;

  const key = await encryptionKey();
  if (!key) return value;

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  return `${ENCRYPTION_PREFIX}${bytesToBase64Url(iv)}.${bytesToBase64Url(
    new Uint8Array(encrypted),
  )}`;
}

export async function decryptMessageContent(value) {
  if (!isEncryptedMessageContent(value)) return value;

  try {
    const key = await encryptionKey();
    if (!key) return "Encrypted message unavailable";

    const payload = value.slice(ENCRYPTION_PREFIX.length);
    const [ivValue, encryptedValue] = payload.split(".");
    if (!ivValue || !encryptedValue) return value;

    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivValue) },
      key,
      base64UrlToBytes(encryptedValue),
    );

    return new TextDecoder().decode(decrypted);
  } catch {
    return "Encrypted message unavailable";
  }
}

export async function decryptMessagePayload(raw) {
  if (!raw || typeof raw !== "object") return raw;

  const next = { ...raw };
  next.content = await decryptMessageContent(raw.content);

  if (raw.replyTo && typeof raw.replyTo === "object") {
    next.replyTo = {
      ...raw.replyTo,
      content: await decryptMessageContent(raw.replyTo.content),
    };
  }

  return next;
}
