import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { connectSocket, getSocket } from "../services/socket";
import { API_BASE, authHeadersJSON } from "../services/api";
import { toaster } from "../toaster";
import { playMessageSound } from "../services/notificationSound";
import {
  ANNOUNCEMENT_THREAD_ID,
  groupIdFromThreadId,
  groupThreadId,
  normalizeMessage,
  organizationIdFromThreadId,
  organizationThreadId,
  pairThreadKey,
} from "../utils/messageUtils";
import { FALLBACK_MAX_ATTACHMENT_BYTES } from "../settings/appSettings";
import { isThreadMuted } from "../settings/notifications";
import { decryptMessagePayload } from "../utils/localMessageEncryption";

const ChatContext = createContext();

export { pairThreadKey };

function hydrateReplyPreviewFromThread(thread, msg) {
  if (!msg || !msg.replyTo || typeof msg.replyTo !== "object") return msg;
  const replyId = String(msg.replyTo._id || "").trim();
  if (!replyId) return msg;

  // If already hydrated (has content or attachments), keep as-is.
  const alreadyHasContent =
    typeof msg.replyTo.content === "string" && msg.replyTo.content.trim() !== "";
  const alreadyHasAttachments =
    Array.isArray(msg.replyTo.attachments) && msg.replyTo.attachments.length > 0;
  if (alreadyHasContent || alreadyHasAttachments) return msg;

  const ref = Array.isArray(thread)
    ? thread.find((m) => String(m?._id) === replyId)
    : null;
  if (!ref) return msg;

  return {
    ...msg,
    replyTo: {
      _id: replyId,
      content: typeof ref.content === "string" ? ref.content : "",
      attachments: Array.isArray(ref.attachments) ? ref.attachments : [],
    },
  };
}

function hasReplyPreview(msg) {
  if (!msg?.replyTo || typeof msg.replyTo !== "object") return false;
  const hasContent =
    typeof msg.replyTo.content === "string" && msg.replyTo.content.trim() !== "";
  const hasAttachments =
    Array.isArray(msg.replyTo.attachments) && msg.replyTo.attachments.length > 0;
  return hasContent || hasAttachments;
}

function mergeMessagePreview(existing, incoming) {
  const next = { ...existing, ...incoming };
  if (hasReplyPreview(existing) && !hasReplyPreview(incoming)) {
    next.replyTo = existing.replyTo;
  }
  return next;
}

function sameMessageIdentity(a, b) {
  if (!a || !b) return false;
  const aid = a._id != null ? String(a._id) : "";
  const bid = b._id != null ? String(b._id) : "";
  if (aid && bid && aid === bid) return true;
  const clientA = a.clientId != null ? String(a.clientId) : "";
  const clientB = b.clientId != null ? String(b.clientId) : "";
  return Boolean(clientA && clientB && clientA === clientB);
}

function senderNameFromPayload(raw, fallback = "New Message") {
  const sender = raw?.senderId;
  if (sender && typeof sender === "object") {
    const name = typeof sender.name === "string" ? sender.name.trim() : "";
    const email = typeof sender.email === "string" ? sender.email.trim() : "";
    return name || email || fallback;
  }
  return fallback;
}

function formatNotificationTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const ChatProvider = ({
  userId,
  token,
  activePeerId,
  onNotificationOpen,
  children,
}) => {
  const [threadMap, setThreadMap] = useState({});
  const [threadMeta, setThreadMeta] = useState({});
  const [typingUser, setTypingUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [statusByUser, setStatusByUser] = useState({});
  const [unreadByPeer, setUnreadByPeer] = useState({});
  const [socket, setSocket] = useState(null);
  const [maxAttachmentBytes, setMaxAttachmentBytes] = useState(
    FALLBACK_MAX_ATTACHMENT_BYTES
  );

  const typingTimeoutRef = useRef(null);
  const totalUnread = useMemo(
    () =>
      Object.values(unreadByPeer).reduce(
        (sum, count) => sum + (Number(count) || 0),
        0
      ),
    [unreadByPeer]
  );

  useEffect(() => {
    const baseTitle = "Huni";
    document.title = totalUnread > 0 ? `(${totalUnread}) ${baseTitle}` : baseTitle;
  }, [totalUnread]);

  useEffect(() => {
    const unsubscribe = window.huniDesktop?.onNotificationClick?.((payload) => {
      if (payload?.threadId) onNotificationOpen?.(payload.threadId);
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [onNotificationOpen]);

  const refreshAttachmentLimits = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/settings/attachments`, {
        headers: authHeadersJSON(token),
      });
      if (!res.ok) return;
      const data = await res.json().catch(() => ({}));
      const n = Number(data.maxAttachmentBytes);
      if (Number.isFinite(n) && n > 0) {
        setMaxAttachmentBytes(n);
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    void refreshAttachmentLimits();
  }, [refreshAttachmentLimits]);

  const activePeerRef = useRef(activePeerId);
  const threadMetaRef = useRef(threadMeta);
  const threadMapRef = useRef(threadMap);

  useEffect(() => {
    activePeerRef.current = activePeerId;
  }, [activePeerId]);

  useEffect(() => {
    threadMetaRef.current = threadMeta;
  }, [threadMeta]);

  useEffect(() => {
    threadMapRef.current = threadMap;
  }, [threadMap]);

  const refreshUnreadTotals = useCallback(async () => {
    if (!token || !userId) return;
    try {
      const res = await fetch(`${API_BASE}/api/messages/unread-by-sender`, {
        headers: authHeadersJSON(token),
      });
      if (!res.ok) return;
      const data = await res.json();
      setUnreadByPeer(
        Object.fromEntries(
          Object.entries(data).map(([k, v]) => [String(k), Number(v) || 0])
        )
      );
    } catch {
      // ignore
    }
  }, [token, userId]);

  useEffect(() => {
    refreshUnreadTotals();
  }, [refreshUnreadTotals]);

  useEffect(() => {
    if (!activePeerId) return;
    setUnreadByPeer((prev) => {
      const next = { ...prev };
      delete next[String(activePeerId)];
      return next;
    });
  }, [activePeerId]);

  useEffect(() => {
    if (!token || !userId || !activePeerId) return;
    const key = pairThreadKey(userId, activePeerId);
    const isAnnouncement = String(activePeerId) === ANNOUNCEMENT_THREAD_ID;
    const activeGroupId = groupIdFromThreadId(activePeerId);
    const activeOrganizationId = organizationIdFromThreadId(activePeerId);
    const ac = new AbortController();

    (async () => {
      try {
        const url = isAnnouncement
          ? `${API_BASE}/api/messages/announcements?limit=40`
          : activeGroupId
          ? `${API_BASE}/api/messages/groups/${activeGroupId}?limit=40`
          : activeOrganizationId
          ? `${API_BASE}/api/organizations/${activeOrganizationId}/messages?limit=40`
          : `${API_BASE}/api/messages/conversation/${activePeerId}?limit=40`;
        const res = await fetch(
          url,
          { headers: authHeadersJSON(token), signal: ac.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        const decryptedItems = await Promise.all(
          (data.items || []).map(decryptMessagePayload)
        );
        const items = decryptedItems.map(normalizeMessage);
        setThreadMap((prev) => ({ ...prev, [key]: items }));
        setThreadMeta((prev) => ({
          ...prev,
          [key]: {
            hasMore: data.pagination?.hasMore ?? false,
            nextOlderCursor: data.pagination?.nextOlderCursor ?? null,
          },
        }));
      } catch {
        // ignore abort
      }
    })();

    return () => ac.abort();
  }, [token, userId, activePeerId]);

  useEffect(() => {
    if (!userId || !token) return;

    const sock = connectSocket(userId, token);
    const handleConnect = () => setSocket(sock);
    const handleDisconnect = () => setSocket(null);

    sock.on("connect", handleConnect);
    sock.on("disconnect", handleDisconnect);
    if (sock.connected) handleConnect();

    sock.on("presence_snapshot", ({ onlineUserIds }) => {
      setOnlineUsers([
        ...new Set((onlineUserIds || []).map((id) => String(id))),
      ]);
    });

    sock.on("user_online", ({ userId: uid }) => {
      setOnlineUsers((prev) =>
        [...new Set([...prev, String(uid)])]
      );
    });

    sock.on("user_offline", ({ userId: uid }) => {
      setOnlineUsers((prev) => prev.filter((id) => id !== String(uid)));
    });

    sock.on("user_status", ({ userId: uid, status, statusMessage, statusUpdatedAt }) => {
      if (uid == null) return;
      setStatusByUser((prev) => ({
        ...prev,
        [String(uid)]: {
          status,
          statusMessage,
          statusUpdatedAt,
        },
      }));
    });

    sock.on("typing", ({ senderId }) => {
      if (senderId == null) return;
      const sid = String(senderId);
      setTypingUser(sid);

      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        setTypingUser((cur) => (String(cur || "") === sid ? null : cur));
      }, 1500);
    });

    sock.on("stop_typing", ({ senderId } = {}) => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      if (senderId == null) setTypingUser(null);
      else
        setTypingUser((cur) =>
          String(cur || "") === String(senderId) ? null : cur
        );
    });

    sock.on("message:new", (raw) => {
      void (async () => {
      try {
        const decryptedRaw = await decryptMessagePayload(raw);
        const msg = normalizeMessage(decryptedRaw);
        const senderName = senderNameFromPayload(raw);
        const sentTime = formatNotificationTime(msg.createdAt);
        const me = String(userId);
        const isAnnouncement = msg.channel === "announcement";
        const isGroup = msg.channel === "group";
        const isOrganization = msg.channel === "organization";
        const from = String(msg.senderId || "");
        const to = String(msg.receiverId || "");
        if (!isAnnouncement && !isGroup && !isOrganization && from !== me && to !== me) return;

        const key = isAnnouncement
          ? ANNOUNCEMENT_THREAD_ID
          : isGroup
          ? groupThreadId(msg.groupId)
          : isOrganization
          ? organizationThreadId(msg.organizationId)
          : pairThreadKey(msg.senderId, msg.receiverId);

        setThreadMap((prev) => {
          const cur = Array.isArray(prev[key]) ? prev[key] : [];
          const existingIndex = cur.findIndex((m) =>
            sameMessageIdentity(m, msg)
          );
          if (existingIndex >= 0) {
            const hydrated = hydrateReplyPreviewFromThread(cur, msg);
            const nextRow = [...cur];
            nextRow[existingIndex] = mergeMessagePreview(
              nextRow[existingIndex],
              hydrated
            );
            return { ...prev, [key]: nextRow };
          }
          const hydrated = hydrateReplyPreviewFromThread(cur, msg);
          return { ...prev, [key]: [...cur, hydrated] };
        });

        const active = activePeerRef.current;
        const inOpenChat = isAnnouncement
          ? String(active || "") === ANNOUNCEMENT_THREAD_ID
          : isGroup
          ? String(active || "") === groupThreadId(msg.groupId)
          : isOrganization
          ? String(active || "") === organizationThreadId(msg.organizationId)
          : active != null && String(active) === from;
        const isIncoming = isAnnouncement || isGroup || isOrganization ? from !== me : to === me;
        const unreadKey = isAnnouncement
          ? ANNOUNCEMENT_THREAD_ID
          : isGroup
          ? groupThreadId(msg.groupId)
          : isOrganization
          ? organizationThreadId(msg.organizationId)
          : from;
        const muted = isThreadMuted(unreadKey);

        if (isIncoming && !inOpenChat) {
          setUnreadByPeer((p) => ({
            ...p,
            [unreadKey]: (p[unreadKey] || 0) + 1,
          }));
        }

        if (isIncoming && !muted) {
          playMessageSound();
          const scope = isAnnouncement
            ? "Announcement"
            : isGroup
            ? "Group message"
            : isOrganization
            ? "Organization update"
            : "Direct message";
          const preview =
            typeof msg.content === "string" && msg.content.trim()
              ? msg.content.trim().slice(0, 180)
              : Array.isArray(msg.attachments) && msg.attachments.length
              ? `${msg.attachments.length} attachment${
                  msg.attachments.length === 1 ? "" : "s"
                }`
              : "New activity";
          toaster.create({
            type: "info",
            title: sentTime
              ? `${scope} from ${senderName} • ${sentTime}`
              : `${scope} from ${senderName}`,
            description: preview,
            duration: inOpenChat ? 2800 : 4500,
            closable: true,
          });
          const notificationTitle = `${scope}: ${senderName}`;
          const desktopNotified = await window.huniDesktop?.notifyMessage?.({
            title: notificationTitle,
            body: preview,
            threadId: unreadKey,
          });
          if (
            !desktopNotified?.shown &&
            document.visibilityState !== "visible" &&
            "Notification" in window &&
            Notification.permission === "granted"
          ) {
            const notification = new Notification(notificationTitle, {
              body: preview,
            });
            notification.onclick = () => {
              window.focus();
              onNotificationOpen?.(unreadKey);
              notification.close();
            };
          }
        }

        if (!isAnnouncement && !isGroup && !isOrganization && isIncoming && inOpenChat && document.visibilityState === "visible") {
          if (msg._id) {
            sock.emit("message_seen", { messageId: msg._id });
          }
        }
      } catch (err) {
        console.error("message:new handler:", err);
      }
      })();
    });

    sock.on("message_seen_update", (raw) => {
      void (async () => {
      try {
        const decryptedRaw = await decryptMessagePayload(raw);
        const msg = normalizeMessage(decryptedRaw);
        const messageId = msg?._id || raw?.messageId;
        setThreadMap((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            const row = next[k];
            if (!Array.isArray(row)) continue;
            next[k] = row.map((m) =>
              String(m._id) === String(messageId)
                ? mergeMessagePreview(m, {
                    ...msg,
                    isRead: true,
                  })
                : m
            );
          }
          return next;
        });
      } catch (e) {
        console.error("message_seen_update:", e);
      }
      })();
    });

    sock.on("message:reaction", (raw) => {
      void (async () => {
      try {
        const decryptedRaw = await decryptMessagePayload(raw);
        const msg = normalizeMessage(decryptedRaw);
        if (!msg?._id) return;

        setThreadMap((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            const row = next[k];
            if (!Array.isArray(row)) continue;
            next[k] = row.map((m) =>
              String(m._id) === String(msg._id)
                ? mergeMessagePreview(m, msg)
                : m
            );
          }
          return next;
        });
      } catch (e) {
        console.error("message:reaction:", e);
      }
      })();
    });

    sock.on("message:updated", (raw) => {
      void (async () => {
      try {
        const decryptedRaw = await decryptMessagePayload(raw);
        const msg = normalizeMessage(decryptedRaw);
        if (!msg?._id) return;
        setThreadMap((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(next)) {
            const row = next[k];
            if (!Array.isArray(row)) continue;
            next[k] = row.map((m) =>
              String(m._id) === String(msg._id)
                ? mergeMessagePreview(m, msg)
                : m
            );
          }
          return next;
        });
      } catch (e) {
        console.error("message:updated:", e);
      }
      })();
    });

    return () => {
      try {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        sock.off("connect", handleConnect);
        sock.off("disconnect", handleDisconnect);
        sock.off("user_status");
        sock.off("message:reaction");
        sock.off("message:updated");
        sock.disconnect();
      } finally {
        setSocket(null);
      }
    };
  }, [userId, token, onNotificationOpen]);

  const getMessagesForPeer = useCallback(
    (peerId) => {
      if (!peerId || !userId) return [];
      const key = pairThreadKey(userId, peerId);
      const row = threadMap[key];
      return Array.isArray(row) ? row : [];
    },
    [threadMap, userId]
  );

  const metaForPeer = useCallback(
    (peerId) => {
      if (!peerId || !userId) return { hasMore: false };
      const key = pairThreadKey(userId, peerId);
      return threadMeta[key] || { hasMore: false };
    },
    [threadMeta, userId]
  );

  const loadOlderMessages = useCallback(async () => {
    if (!token || !userId || !activePeerId) return false;
    const key = pairThreadKey(userId, activePeerId);
    const isAnnouncement = String(activePeerId) === ANNOUNCEMENT_THREAD_ID;
    const activeGroupId = groupIdFromThreadId(activePeerId);
    const activeOrganizationId = organizationIdFromThreadId(activePeerId);
    const meta = threadMetaRef.current[key];
    const rawCur = threadMapRef.current[key];
    const cur = Array.isArray(rawCur) ? rawCur : [];
    if (!meta?.hasMore || !cur.length) return false;

    const oldestId = cur[0]._id;
    try {
      const res = await fetch(
        isAnnouncement
          ? `${API_BASE}/api/messages/announcements?limit=40&before=${encodeURIComponent(
              oldestId
            )}`
          : activeGroupId
          ? `${API_BASE}/api/messages/groups/${activeGroupId}?limit=40&before=${encodeURIComponent(
              oldestId
            )}`
          : activeOrganizationId
          ? `${API_BASE}/api/organizations/${activeOrganizationId}/messages?limit=40&before=${encodeURIComponent(
              oldestId
            )}`
          : `${API_BASE}/api/messages/conversation/${activePeerId}?limit=40&before=${encodeURIComponent(
              oldestId
            )}`,
        { headers: authHeadersJSON(token) }
      );
      if (!res.ok) return false;
      const data = await res.json();
      const decryptedOlder = await Promise.all(
        (data.items || []).map(decryptMessagePayload)
      );
      const older = decryptedOlder.map(normalizeMessage);

      setThreadMap((prev) => {
        const prior = Array.isArray(prev[key]) ? prev[key] : [];
        const merged = [...older, ...prior];
        const seen = new Set();
        const dedup = merged.filter((m) => {
          const id = String(m._id);
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        dedup.sort((a, b) =>
          String(a._id).localeCompare(String(b._id), undefined, {
            sensitivity: "base",
          })
        );
        return { ...prev, [key]: dedup };
      });

      setThreadMeta((prev) => ({
        ...prev,
        [key]: {
          hasMore: data.pagination?.hasMore ?? false,
          nextOlderCursor: data.pagination?.nextOlderCursor ?? null,
        },
      }));

      return older.length > 0;
    } catch {
      return false;
    }
  }, [token, userId, activePeerId]);

  const removeLocalMessage = useCallback(
    (peerId, messageId) => {
      const key = pairThreadKey(userId, peerId);
      setThreadMap((prev) => ({
        ...prev,
        [key]: (Array.isArray(prev[key]) ? prev[key] : []).filter(
          (m) => String(m._id) !== String(messageId)
        ),
      }));
    },
    [userId]
  );

  const patchLocalMessage = useCallback((peerId, messageId, patch) => {
    const key = pairThreadKey(userId, peerId);
    setThreadMap((prev) => ({
      ...prev,
      [key]: (Array.isArray(prev[key]) ? prev[key] : []).map((m) =>
        String(m._id) === String(messageId) ? { ...m, ...patch } : m
      ),
    }));
  }, [userId]);

  const appendLocalMessage = useCallback((peerIdOther, raw) => {
    const msg = normalizeMessage(raw);
    const key = pairThreadKey(userId, peerIdOther);
    setThreadMap((prev) => {
      const cur = Array.isArray(prev[key]) ? prev[key] : [];
      const hydrated = hydrateReplyPreviewFromThread(cur, msg);

      const existingIndex = cur.findIndex((m) => sameMessageIdentity(m, msg));
      if (existingIndex >= 0) {
        const nextRow = [...cur];
        nextRow[existingIndex] = mergeMessagePreview(
          nextRow[existingIndex],
          hydrated
        );
        return { ...prev, [key]: nextRow };
      }

      if (import.meta.env?.DEV) {
        console.debug("[ChatContext] appendLocalMessage normalized replyTo:", {
          messageId: hydrated?._id,
          replyTo: hydrated?.replyTo,
        });
      }

      return { ...prev, [key]: [...cur, hydrated] };
    });
  }, [userId]);

  const markMessagesReadByIds = useCallback(
    (ids) => {
      const s = socket || getSocket();
      if (!s) return;
      ids.forEach((id) => {
        if (id) s.emit("message_seen", { messageId: id });
      });
    },
    [socket]
  );

  const value = useMemo(
    () => ({
      userId,
      token,
      threadMap,
      typingUser,
      onlineUsers,
      statusByUser,
      unreadByPeer,
      totalUnread,
      maxAttachmentBytes,
      refreshAttachmentLimits,
      refreshUnreadTotals,
      getMessagesForPeer,
      metaForPeer,
      loadOlderMessages,
      removeLocalMessage,
      patchLocalMessage,
      appendLocalMessage,
      markMessagesReadByIds,
      socket,
      pairThreadKey,
    }),
    [
      userId,
      token,
      threadMap,
      typingUser,
      onlineUsers,
      statusByUser,
      unreadByPeer,
      totalUnread,
      maxAttachmentBytes,
      refreshAttachmentLimits,
      refreshUnreadTotals,
      getMessagesForPeer,
      metaForPeer,
      loadOlderMessages,
      removeLocalMessage,
      patchLocalMessage,
      appendLocalMessage,
      markMessagesReadByIds,
      socket,
    ]
  );

  return (
    <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext);
