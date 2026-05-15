import {
  Box,
  Button,
  VStack,
  Text,
  Flex,
  HStack,
  IconButton,
  Input,
} from "@chakra-ui/react";
import { useChat } from "../context/ChatContext";
import { Fragment, useEffect, useRef, useState } from "react";
import FileViewerModal from "./FileViewerModal";
import MessageContextMenu from "./MessageContextMenu";
import UserAvatar from "./UserAvatar";
import MarkdownMessage from "./MarkdownMessage";
import {
  CheckCheck,
  CornerUpLeft,
  Download,
  ExternalLink,
  FileText,
  MoreVertical,
  Reply,
  Smile,
} from "lucide-react";
import { API_BASE, authHeadersJSON } from "../services/api";
import { formatBytes } from "../settings/appSettings";
import { ANNOUNCEMENT_THREAD_ID, normalizeMessage, pickId } from "../utils/messageUtils";
import { encryptMessageContent } from "../utils/localMessageEncryption";
import { downloadUrl } from "../utils/downloadFile";
import { resolveUploadUrl } from "../utils/mediaUrl";

const REACTION_EMOJI = {
  like: "👍",
  love: "❤️",
  haha: "😂",
  wow: "😮",
  sad: "😢",
  angry: "😡",
};

function reactionSummary(reactions = []) {
  const counts = new Map();
  reactions.forEach((reaction) => {
    const emoji = REACTION_EMOJI[reaction?.type];
    if (!emoji) return;
    counts.set(emoji, (counts.get(emoji) || 0) + 1);
  });

  return Array.from(counts.entries()).map(([emoji, count]) => ({
    emoji,
    count,
  }));
}

function nextLocalReactions(reactions = [], userId, type) {
  const uid = String(userId);
  const current = Array.isArray(reactions) ? reactions : [];
  const existing = current.find((r) => String(r?.userId) === uid);

  if (existing?.type === type) {
    return current.filter((r) => String(r?.userId) !== uid);
  }

  if (existing) {
    return current.map((r) =>
      String(r?.userId) === uid ? { ...r, type } : r
    );
  }

  return [...current, { userId: uid, type }];
}

function cloneForwardAttachments(attachments = []) {
  return Array.isArray(attachments)
    ? attachments.map((file) => ({
        fileName: file?.fileName || "",
        originalName: file?.originalName || "",
        url: file?.url || "",
        mimetype: file?.mimetype || "",
        type: file?.type || "other",
        size: file?.size,
      }))
    : [];
}

function seenUsersForMessage(msg) {
  return (Array.isArray(msg?.seenBy) ? msg.seenBy : [])
    .filter((row, index, rows) =>
      rows.findIndex((item) => String(item?.userId) === String(row?.userId)) === index
    );
}

function formatSeenAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSentTooltip(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isSameMessageDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a);
  const db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDateSeparator(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const today = isSameMessageDay(date, now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = isSameMessageDay(date, yesterdayDate);
  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (today) return `Today ${time}`;
  if (yesterday) return `Yesterday ${time}`;
  return date.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function directSeenReceipt(msg, receiverId) {
  const seenRow = (Array.isArray(msg?.seenBy) ? msg.seenBy : []).find(
    (row) => String(row?.userId) === String(receiverId),
  );

  if (seenRow) {
    return {
      seen: true,
      seenAt: seenRow.seenAt || msg.readAt || "",
    };
  }

  if (msg?.isRead) {
    return {
      seen: true,
      seenAt: msg.readAt || "",
    };
  }

  return { seen: false, seenAt: "" };
}

function multiSeenReceipt(msg, userId) {
  const rows = seenUsersForMessage(msg)
    .filter((row) => String(row?.userId) !== String(userId))
    .sort((a, b) => {
      const ad = new Date(a?.seenAt || 0).getTime();
      const bd = new Date(b?.seenAt || 0).getTime();
      return bd - ad;
    });

  if (!rows.length) return { seen: false, seenAt: "", seenUsers: [] };

  return {
    seen: true,
    seenAt: rows[0]?.seenAt || "",
    seenUsers: rows,
  };
}

function receiptTitleForSeen(receipt) {
  if (!receipt?.seen) return "Seen";
  const seenAtLabel = formatSeenAt(receipt.seenAt);
  const users = Array.isArray(receipt.seenUsers) ? receipt.seenUsers : [];
  if (!users.length) return seenAtLabel ? `Seen ${seenAtLabel}` : "Seen";

  const names = users
    .slice(0, 6)
    .map((user) => user?.name || "User")
    .join(", ");
  const extra = users.length > 6 ? ` +${users.length - 6} more` : "";
  return `${seenAtLabel ? `Seen ${seenAtLabel}` : "Seen"}${
    names ? ` by ${names}${extra}` : ""
  }`;
}

function replyPreviewText(replyTo) {
  if (!replyTo) return "";
  if (replyTo.content) return replyTo.content;
  return replyTo.attachments?.length ? "Attachment" : "(message)";
}

function replyPhoto(replyTo) {
  return (Array.isArray(replyTo?.attachments) ? replyTo.attachments : []).find(
    (file) =>
      file?.type === "image" ||
      String(file?.mimetype || "").startsWith("image/") ||
      /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(
        String(file?.originalName || file?.fileName || file?.url || ""),
      ),
  );
}

function replyLabelForMessage(msg, userId) {
  const senderIsMe = String(msg?.senderId) === String(userId);
  const repliedToMe = String(msg?.replyTo?.senderId) === String(userId);
  const senderName = senderIsMe ? "You" : msg?.senderName || "User";
  const replyTarget = repliedToMe ? "you" : msg?.replyTo?.senderName || "a message";
  return `${senderName} replied to ${replyTarget}`;
}

function MessageHoverActions({
  msg,
  isMine,
  canReply,
  visible,
  directReceipt,
  receiptTitle,
  receiptOpen,
  appearance,
  onReply,
  onReact,
  onMore,
  onToggleReceipt,
  onOpenReceipt,
  onCloseReceipt,
}) {
  const iconColor = appearance.id === "dark" ? "gray.300" : "gray.500";
  const hoverBg = appearance.id === "dark" ? "whiteAlpha.100" : "blackAlpha.100";

  return (
    <HStack
      gap={0.5}
      opacity={visible ? 1 : 0}
      pointerEvents={visible ? "auto" : "none"}
      transition="opacity 120ms ease"
      order={isMine ? 0 : 2}
      flexShrink={0}
      alignSelf="center"
      display={{ base: "none", md: "flex" }}
    >
      <IconButton
        aria-label="React"
        size="xs"
        variant="ghost"
        color={iconColor}
        borderRadius="full"
        _hover={{ bg: hoverBg }}
        onClick={(event) => onReact(event, msg)}
      >
        <Smile size={16} />
      </IconButton>
      {canReply && (
        <IconButton
          aria-label="Reply"
          size="xs"
          variant="ghost"
          color={iconColor}
          borderRadius="full"
          _hover={{ bg: hoverBg }}
          onClick={(event) => {
            event.stopPropagation();
            onReply(msg);
          }}
        >
          <Reply size={16} />
        </IconButton>
      )}
      <IconButton
        aria-label="More message options"
        size="xs"
        variant="ghost"
        color={iconColor}
        borderRadius="full"
        _hover={{ bg: hoverBg }}
        onClick={(event) => onMore(event, msg)}
      >
        <MoreVertical size={16} />
      </IconButton>
      {directReceipt?.seen && (
        <Box position="relative">
          <IconButton
            aria-label={receiptTitle}
            size="xs"
            variant="ghost"
            color={iconColor}
            borderRadius="full"
            title={receiptTitle}
            _hover={{ bg: hoverBg }}
            onClick={(event) => {
              event.stopPropagation();
              onToggleReceipt?.();
            }}
            onMouseEnter={() => onOpenReceipt?.()}
            onMouseLeave={() => onCloseReceipt?.()}
          >
            <CheckCheck size={16} strokeWidth={2.4} />
          </IconButton>
          {receiptOpen && (
            <Box
              position="absolute"
              right={isMine ? 0 : "auto"}
              left={isMine ? "auto" : 0}
              bottom="28px"
              px={2}
              py={1}
              bg={appearance.id === "dark" ? "#111827" : "gray.800"}
              color="white"
              borderRadius="md"
              boxShadow="md"
              fontSize="11px"
              whiteSpace="pre-line"
              minW="190px"
              maxW="260px"
              lineHeight="1.35"
              zIndex={20}
            >
              {receiptTitle}
            </Box>
          )}
        </Box>
      )}
    </HStack>
  );
}

/* ---------------- Attachment ---------------- */
function AttachmentRow({ file, onOpen, appearance, isMine }) {
  const url = resolveUploadUrl(file?.url);
  const label = file?.originalName || file?.fileName || "Attachment";
  const sizeLabel =
    typeof file?.size === "number" ? formatBytes(file.size) : null;

  const type =
    file?.type === "image"
      ? "image"
      : file?.type === "pdf"
      ? "pdf"
      : "other";
  const mimetype = String(file?.mimetype || "");
  const looksLikeImage =
    mimetype.startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(label);
  const isPdf = type === "pdf" || mimetype === "application/pdf" || /\.pdf$/i.test(label);
  const cardText = isMine
    ? appearance.id === "dark"
      ? appearance.text
      : "white"
    : appearance.text;
  const mutedText = isMine
    ? appearance.id === "dark"
      ? appearance.textMuted
      : "rgba(255,255,255,0.82)"
    : appearance.textMuted;
  const actionColor = isMine
    ? appearance.id === "dark"
      ? appearance.text
      : "white"
    : appearance.text;
  const actionHoverBg = isMine
    ? "rgba(255,255,255,0.16)"
    : appearance.hoverBg;

  return (
    <Flex
      mt={1}
      py={1}
      px={0}
      gap={2.5}
      align="center"
      cursor="default"
      minW={{ base: "220px", md: "260px" }}
      maxW="100%"
    >
      {looksLikeImage && url ? (
        <Box w="36px" h="36px" borderRadius="md" overflow="hidden" flexShrink={0}>
          <img
            src={url}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        </Box>
      ) : (
        <Flex
          w="36px"
          h="36px"
          align="center"
          justify="center"
          color={cardText}
          flexShrink={0}
          opacity={0.95}
          aria-hidden="true"
        >
          <FileText size={22} strokeWidth={2.3} />
        </Flex>
      )}

      <Box minW={0} flex={1}>
        <Text fontSize="sm" fontWeight="semibold" color={cardText} noOfLines={1}>
          {label}
        </Text>
        {sizeLabel && (
          <Text fontSize="xs" color={mutedText}>
            {sizeLabel}
          </Text>
        )}
      </Box>

      <HStack gap={0.5} flexShrink={0}>
        {(looksLikeImage || isPdf) && (
          <IconButton
            aria-label="Open file"
            title="Open file"
            size="xs"
            variant="ghost"
            color={actionColor}
            _hover={{ bg: actionHoverBg }}
            disabled={!url}
            onClick={() => {
              if (!url) return;
              if (isPdf) window.open(url, "_blank", "noopener,noreferrer");
              else onOpen?.(file);
            }}
          >
            <ExternalLink size={15} />
          </IconButton>
        )}
        <IconButton
          aria-label="Download file"
          title="Download file"
          size="xs"
          variant="ghost"
          color={actionColor}
          _hover={{ bg: actionHoverBg }}
          flexShrink={0}
          disabled={!url}
          onClick={() => {
            void downloadUrl(url, label).catch(() => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            });
          }}
        >
          <Download size={15} />
        </IconButton>
      </HStack>
    </Flex>
  );
}

function PhotoGrid({ files, onOpen, mt = 2 }) {
  const rows = Array.isArray(files) ? files : [];
  if (!rows.length) return null;
  const count = rows.length;
  const visibleRows = rows.slice(0, 6);
  const extraCount = Math.max(0, rows.length - visibleRows.length);
  const gridTemplate =
    count === 1
      ? `"a"`
      : count === 2
        ? `"a b"`
        : count === 3
          ? `"a b" "a c"`
          : count === 4
            ? `"a b" "c d"`
            : count === 5
              ? `"a a b" "c d e"`
              : `"a b c" "d e f"`;
  const areas = ["a", "b", "c", "d", "e", "f"];
  const aspectRatio =
    count === 1 ? "4 / 3" : count === 2 ? "2 / 1" : "3 / 2";

  return (
    <Box
      mt={mt}
      display="grid"
      gridTemplateAreas={gridTemplate}
      gridTemplateColumns={
        count === 1
          ? "1fr"
          : count <= 4
            ? "repeat(2, minmax(0, 1fr))"
            : "repeat(3, minmax(0, 1fr))"
      }
      gap="4px"
      w="min(330px, 72vw)"
      aspectRatio={aspectRatio}
    >
      {visibleRows.map((file, index) => {
        const url = resolveUploadUrl(file?.url);
        const showOverlay = extraCount > 0 && index === visibleRows.length - 1;
        return (
          <Box
            key={`${file?.url || index}-${index}`}
            as="button"
            type="button"
            position="relative"
            overflow="hidden"
            borderRadius="md"
            gridArea={areas[index]}
            bg="blackAlpha.200"
            cursor={url ? "pointer" : "default"}
            onClick={() => url && onOpen(file)}
          >
            {url && (
              <img
                src={url}
                alt={file?.originalName || ""}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            )}
            {showOverlay && (
              <Flex
                position="absolute"
                inset={0}
                align="center"
                justify="center"
                bg="blackAlpha.600"
                color="white"
                fontWeight="bold"
                fontSize="xl"
              >
                +{extraCount}
              </Flex>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

/* ---------------- MAIN ---------------- */
export default function MessageList({
  userId,
  receiver,
  setReplyTo,
  setEditing,
  chatTheme,
  appearance,
  searchHighlight = "",
  listFilter = "all",
  listSearchQuery = "",
}) {
  const {
    getMessagesForPeer,
    metaForPeer,
    loadOlderMessages,
    markMessagesReadByIds,
    token,
    patchLocalMessage,
  } = useChat();

  const messages = getMessagesForPeer(receiver._id);
  const meta = metaForPeer(receiver._id);
  const isAnnouncement = receiver?.isAnnouncement === true;
  const isGroup = receiver?.isGroup === true;
  const isOrganization = receiver?.isOrganization === true;

  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedGallery, setSelectedGallery] = useState([]);
  const [isOpen, setIsOpen] = useState(false);

  const [ctxMenuAnchor, setCtxMenuAnchor] = useState(null);
  const [ctxMenuMsg, setCtxMenuMsg] = useState(null);
  const [ctxMenuMode, setCtxMenuMode] = useState("actions");
  const [openReceiptId, setOpenReceiptId] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [forwardMessage, setForwardMessage] = useState(null);
  const [forwardUsers, setForwardUsers] = useState([]);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardingTo, setForwardingTo] = useState("");

  const containerRef = useRef(null);
  const loadingRef = useRef(false);
  const markedRef = useRef(new Set());
  const latestMessageRef = useRef("");

  const baseVisibleMessages = messages.filter((m) => {
    if (isAnnouncement) {
      return m.channel === "announcement";
    }
    if (isGroup) {
      return m.channel === "group" && String(m.groupId) === String(receiver.groupId);
    }
    if (isOrganization) {
      const sameOrganization =
        m.channel === "organization" &&
        String(m.organizationId) === String(pickId(receiver.organizationId));
      return sameOrganization;
    }
    const a = String(m.senderId);
    const b = String(m.receiverId);
    return (
      (a === String(userId) && b === String(receiver._id)) ||
      (a === String(receiver._id) && b === String(userId))
    );
  });
  const normalizedListSearch = listSearchQuery.trim().toLowerCase();
  const visibleMessages = baseVisibleMessages.filter((m) => {
    if (listFilter === "pinned" && !(m.pinnedBy?.length > 0)) return false;
    if (
      listFilter === "starred" &&
      !m.starredBy?.some((id) => String(id) === String(userId))
    ) {
      return false;
    }
    if (normalizedListSearch) {
      const text = String(m.content || "").toLowerCase();
      const files = (m.attachments || [])
        .map((file) => `${file.originalName || ""} ${file.fileName || ""}`)
        .join(" ")
        .toLowerCase();
      return text.includes(normalizedListSearch) || files.includes(normalizedListSearch);
    }
    return true;
  });

  const latestMessage = visibleMessages[visibleMessages.length - 1];
  const latestMessageKey = latestMessage
    ? `${receiver._id}:${latestMessage._id || latestMessage.clientId || ""}`
    : `${receiver._id}:empty`;

  const forwardRecipients = forwardUsers.filter((user) => {
    const id = String(user?._id || "");
    if (!id || id === String(userId)) return false;
    const q = forwardSearch.trim().toLowerCase();
    if (!q) return true;
    return `${user.name || ""} ${user.email || ""}`.toLowerCase().includes(q);
  });

  useEffect(() => {
    if (!forwardMessage || !token) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users`, {
          headers: authHeadersJSON(token),
        });
        const data = await res.json().catch(() => []);
        if (!cancelled) setForwardUsers(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setForwardUsers([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [forwardMessage, token]);

  const scrollToLatest = (behavior = "auto") => {
    const el = containerRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });

      // Attachments/images can change height shortly after render.
      window.setTimeout(() => {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: "auto",
        });
      }, 80);
    });
  };

  /* reset read tracking */
  useEffect(() => {
    markedRef.current = new Set();
  }, [receiver._id]);

  /* opening a chat and new sent/received messages should show the latest item */
  useEffect(() => {
    if (latestMessageRef.current === latestMessageKey) return;

    const isSameChat =
      latestMessageRef.current.startsWith(`${receiver._id}:`) &&
      latestMessageRef.current !== "";

    latestMessageRef.current = latestMessageKey;
    scrollToLatest(isSameChat ? "smooth" : "auto");
  }, [latestMessageKey, receiver._id]);

  /* mark read */
  useEffect(() => {
    const unread = messages
      .filter((m) => {
        if (!m?._id || markedRef.current.has(m._id)) return false;
        if (String(m.senderId) === String(userId)) return false;

        if (isAnnouncement) {
          return m.channel === "announcement";
        }

        if (isGroup) {
          return (
            m.channel === "group" &&
            String(m.groupId) === String(receiver.groupId)
          );
        }

        if (isOrganization) {
          return (
            m.channel === "organization" &&
            String(m.organizationId) === String(pickId(receiver.organizationId))
          );
        }

        return String(m.receiverId) === String(userId) && !m.isRead;
      })
      .map((m) => m._id);

    if (!unread.length) return;

    unread.forEach((id) => markedRef.current.add(id));
    markMessagesReadByIds(unread);
  }, [
    isAnnouncement,
    isGroup,
    isOrganization,
    messages,
    markMessagesReadByIds,
    receiver.groupId,
    receiver.organizationId,
    userId,
  ]);

  /* infinite scroll */
  const onScroll = () => {
    const el = containerRef.current;
    if (!el || loadingRef.current || !meta?.hasMore) return;

    if (el.scrollTop < 60) {
      loadingRef.current = true;
      const prevHeight = el.scrollHeight;

      loadOlderMessages().finally(() => {
        requestAnimationFrame(() => {
          const c = containerRef.current;
          if (c) c.scrollTop = c.scrollHeight - prevHeight;
          loadingRef.current = false;
        });
      });
    }
  };

  const handleQuickReaction = async (msg, type) => {
    if (!msg?._id || msg.pending || msg.failed) return;

    const previous = Array.isArray(msg.reactions) ? msg.reactions : [];
    patchLocalMessage(receiver._id, msg._id, {
      reactions: nextLocalReactions(previous, userId, type),
    });

    try {
      const res = await fetch(`${API_BASE}/api/messages/react`, {
        method: "POST",
        headers: authHeadersJSON(token),
        body: JSON.stringify({ messageId: msg._id, type }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        patchLocalMessage(receiver._id, msg._id, { reactions: previous });
        return;
      }

      patchLocalMessage(receiver._id, msg._id, {
        reactions: Array.isArray(data.reactions) ? data.reactions : [],
      });
    } catch {
      patchLocalMessage(receiver._id, msg._id, { reactions: previous });
    }
  };

  const toggleMessageFlag = async (msg, endpoint) => {
    if (!msg?._id || msg.pending || msg.failed) return;

    try {
      const res = await fetch(`${API_BASE}/api/messages/${endpoint}`, {
        method: "POST",
        headers: authHeadersJSON(token),
        body: JSON.stringify({ messageId: msg._id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      patchLocalMessage(receiver._id, msg._id, normalizeMessage(data));
    } catch {
      /* ignore */
    }
  };

  const closeForwardPicker = () => {
    setForwardMessage(null);
    setForwardSearch("");
    setForwardingTo("");
  };

  const openMessageMenu = (event, msg, mode = "actions") => {
    event.preventDefault();
    event.stopPropagation();
    if (isAnnouncement && msg.pending) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setCtxMenuAnchor({
      x: rect.left,
      y: rect.bottom + 6,
    });
    setCtxMenuMsg(msg);
    setCtxMenuMode(mode);
  };

  const forwardToUser = async (targetUser) => {
    if (!forwardMessage || !targetUser?._id || forwardingTo) return;

    const targetId = String(targetUser._id);
    setForwardingTo(targetId);

    try {
      const content =
        typeof forwardMessage.content === "string"
          ? forwardMessage.content
          : "";
      const encryptedContent = await encryptMessageContent(content);
      const attachments = cloneForwardAttachments(forwardMessage.attachments);

      const res = await fetch(`${API_BASE}/api/messages`, {
        method: "POST",
        headers: authHeadersJSON(token),
        body: JSON.stringify({
          receiverId: targetId,
          content: encryptedContent,
          attachments,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Forward failed:", data);
        return;
      }

      closeForwardPicker();
    } catch (err) {
      console.error("Forward failed:", err);
    } finally {
      setForwardingTo("");
    }
  };

  return (
    <>
      {/* SCROLL AREA */}
      <Box
        ref={containerRef}
        onScroll={onScroll}
        h="100%"
        minH={0}
        overflowY="auto"
        px={{ base: 2, md: 4 }}
        py={{ base: 2, md: 3 }}
        bg={chatTheme.listBg}
        color={appearance.text}
        position="relative"
      >
        <VStack align="stretch" gap={isAnnouncement || isGroup || isOrganization ? 5 : 0.5}>
          {visibleMessages.map((msg, i) => {
            const isMine = String(msg.senderId) === String(userId);
            const prev = visibleMessages[i - 1];
            const next = visibleMessages[i + 1];
            const showDateSeparator =
              !prev || !isSameMessageDay(prev.createdAt, msg.createdAt);

            const isLastInGroup =
              !next || String(next.senderId) !== String(msg.senderId);
            const reactions = reactionSummary(msg.reactions);
            const receipt =
              isMine && (isGroup || isAnnouncement || isOrganization)
                ? multiSeenReceipt(msg, userId)
                : !isGroup && !isAnnouncement && !isOrganization && isMine
                  ? directSeenReceipt(msg, receiver?._id)
                  : { seen: false, seenAt: "", seenUsers: [] };
            const receiptTitle = receiptTitleForSeen(receipt);
            const showHoverActions =
              String(hoveredMessageId) === String(msg._id) ||
              String(ctxMenuMsg?._id || "") === String(msg._id);
            const isDeletedNotice =
              msg.deleted &&
              (msg.content === "This message was deleted" ||
                msg.content === "Message removed by admin");
            const photoAttachments = (msg.attachments || []).filter(
              (item) => item?.type === "image",
            );
            const fileAttachments = (msg.attachments || []).filter(
              (item) => item?.type !== "image",
            );
            const hasTextContent = Boolean(String(msg.content || "").trim());
            const isPhotoOnlyMessage =
              photoAttachments.length > 0 &&
              fileAttachments.length === 0 &&
              !hasTextContent &&
              !msg.replyTo;
            const replyImage = replyPhoto(msg.replyTo);
            const replyImageUrl = resolveUploadUrl(replyImage?.url || replyImage?.thumbnailUrl);
            const sentTooltip = formatSentTooltip(msg.createdAt);

            return (
              <Fragment key={msg._id}>
              {showDateSeparator && (
                <Flex
                  key={`date-${msg._id}`}
                  justify="center"
                  py={{ base: 2, md: 3 }}
                >
                  <Text
                    fontSize="xs"
                    color={appearance.textMuted}
                    bg={appearance.id === "dark" ? "whiteAlpha.100" : "blackAlpha.50"}
                    px={3}
                    py={1}
                    borderRadius="full"
                  >
                    {formatDateSeparator(msg.createdAt)}
                  </Text>
                </Flex>
              )}
              <Flex
                role="group"
                id={`msg-${msg._id}`}
                data-message-id={msg._id}
                justify={isMine ? "flex-end" : "flex-start"}
                align="flex-end"
                gap={{ base: 1.5, md: 2 }}
                position="relative"
                pb={0}
                py={0.5}
                mb={reactions.length > 0 ? 3 : 0}
                onMouseEnter={() => setHoveredMessageId(msg._id)}
                onMouseLeave={() => setHoveredMessageId((id) =>
                  String(id) === String(msg._id) ? null : id
                )}
              >
                {msg.system ? (
                  <Flex justify="center" w="100%" py={1}>
                    <Text
                      fontSize="xs"
                      color={appearance.textMuted}
                      bg={appearance.hoverBg}
                      px={3}
                      py={1}
                      borderRadius="full"
                    >
                      {msg.content}
                    </Text>
                  </Flex>
                ) : (
                  <>
                {/* LEFT AVATAR */}
                {!isMine && (
                  <Box w={{ base: "26px", md: "32px" }} flexShrink={0}>
                    {isGroup || isLastInGroup ? (
                      <UserAvatar
                        name={
                          isAnnouncement || isGroup || isOrganization
                            ? msg.senderName
                            : receiver?.name
                        }
                        avatarUrl={
                          isAnnouncement || isGroup || isOrganization
                            ? msg.senderAvatarUrl
                            : receiver?.avatarUrl
                        }
                        size="xs"
                      />
                    ) : (
                      <Box w="28px" h="28px" />
                    )}
                  </Box>
                )}

                {isMine && (
                  <MessageHoverActions
                    msg={msg}
                    isMine={isMine}
                    canReply={!isAnnouncement && !isOrganization}
                    visible={showHoverActions}
                    directReceipt={receipt}
                    receiptTitle={receiptTitle}
                    receiptOpen={String(openReceiptId) === String(msg._id)}
                    appearance={appearance}
                    onReply={setReplyTo}
                    onReact={(event, m) => openMessageMenu(event, m, "reactions")}
                    onMore={openMessageMenu}
                    onToggleReceipt={() =>
                      setOpenReceiptId((id) =>
                        String(id) === String(msg._id) ? null : msg._id,
                      )
                    }
                    onOpenReceipt={() => setOpenReceiptId(msg._id)}
                    onCloseReceipt={() => setOpenReceiptId(null)}
                  />
                )}

                <VStack align={isMine ? "flex-end" : "flex-start"} gap={1} maxW={{ base: "78%", md: "68%" }}>
                {msg.replyTo && (
                  <>
                    <HStack
                      gap={1}
                      px={1}
                      color={appearance.textMuted}
                      maxW="100%"
                      cursor="pointer"
                      onClick={() => {
                        const el = document.getElementById(`msg-${msg.replyTo?._id}`);
                        el?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      <CornerUpLeft size={13} />
                      <Text fontSize="xs" fontWeight="semibold" noOfLines={1}>
                        {replyLabelForMessage(msg, userId)}
                      </Text>
                    </HStack>
                    {replyImageUrl && (
                      <Box
                        as="img"
                        src={replyImageUrl}
                        alt={replyImage?.originalName || "Replied photo"}
                        w="96px"
                        maxH="120px"
                        objectFit="cover"
                        borderRadius="14px"
                        opacity={0.62}
                        cursor="pointer"
                        onClick={() => {
                          const el = document.getElementById(`msg-${msg.replyTo?._id}`);
                          el?.scrollIntoView({ behavior: "smooth", block: "center" });
                        }}
                      />
                    )}
                  </>
                )}

                {/* MESSAGE BUBBLE */}
                {isPhotoOnlyMessage ? (
                  <Box
                    maxW="100%"
                    position="relative"
                    title={sentTooltip}
                    borderRadius="18px"
                    overflow="visible"
                  >
                    <PhotoGrid
                      files={photoAttachments}
                      mt={0}
                      onOpen={(f) => {
                        setSelectedFile(f);
                        setSelectedGallery(photoAttachments);
                        setIsOpen(true);
                      }}
                    />
                    {reactions.length > 0 && (
                      <Flex
                        position="absolute"
                        right="10px"
                        bottom="-13px"
                        zIndex={2}
                      >
                        <Flex
                          align="center"
                          gap={0.5}
                          minH="18px"
                          minW="18px"
                          maxW="92px"
                          px={(msg.reactions?.length || 0) > 1 ? 1 : 0.5}
                          py="0"
                          bg={appearance.cardBg}
                          color={appearance.text}
                          borderRadius="full"
                          boxShadow="md"
                          borderWidth="1px"
                          borderColor={appearance.border}
                          fontSize="13px"
                          lineHeight="1"
                          justify="center"
                          whiteSpace="nowrap"
                          overflow="hidden"
                        >
                          <Text as="span" whiteSpace="nowrap" lineHeight="1">
                            {reactions.map((r) => r.emoji).join("")}
                          </Text>
                          {(msg.reactions?.length || 0) > 1 && (
                            <Text as="span" fontSize="10px" fontWeight="semibold">
                              {msg.reactions.length}
                            </Text>
                          )}
                        </Flex>
                      </Flex>
                    )}
                  </Box>
                ) : (
                <Box
                  maxW="100%"
                  px={{ base: 3, md: 3.5 }}
                  py={{ base: 1.75, md: 2 }}
                  bg={isMine ? chatTheme.accent : appearance.cardBg}
                  color={isMine ? "white" : appearance.text}
                  borderRadius="20px"
                  borderBottomRightRadius={
                    isMine && !isLastInGroup ? "8px" : "20px"
                  }
                  borderBottomLeftRadius={
                    !isMine && !isLastInGroup ? "8px" : "20px"
                  }
                  boxShadow={appearance.id === "dark" ? "none" : "sm"}
                  position="relative"
                  title={sentTooltip}
                >
                  {msg.replyTo && !replyImageUrl && (
                    <Box
                      mb={1.5}
                      px={2.5}
                      py={1.5}
                      borderRadius="14px"
                      bg={isMine ? "whiteAlpha.300" : appearance.inputStrongBg}
                      opacity={0.9}
                      cursor="pointer"
                      onClick={() => {
                        const el = document.getElementById(
                          `msg-${msg.replyTo?._id}`
                        );
                        el?.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }}
                    >
                      <Text
                        fontSize="xs"
                        noOfLines={1}
                        color={isMine ? "whiteAlpha.700" : appearance.textMuted}
                      >
                        {replyPreviewText(msg.replyTo)}
                      </Text>
                    </Box>
                  )}

                  {/* MESSAGE TEXT */}
                  {msg.content && (
                    <MarkdownMessage
                      color={
                        isDeletedNotice
                          ? isMine
                            ? "whiteAlpha.700"
                            : appearance.textSubtle
                          : isMine
                            ? "white"
                            : appearance.text
                      }
                      highlight={searchHighlight}
                      opacity={isDeletedNotice ? 0.72 : 1}
                      fontStyle={isDeletedNotice ? "italic" : "normal"}
                    >
                      {msg.content}
                    </MarkdownMessage>
                  )}

                  {(msg.pinnedBy?.length > 0 ||
                    msg.starredBy?.some((id) => String(id) === String(userId)) ||
                    msg.edited) && (
                    <HStack mt={1} gap={1} justify={isMine ? "flex-end" : "flex-start"}>
                      {msg.pinnedBy?.length > 0 && (
                        <Text fontSize="10px" color={isMine ? "whiteAlpha.800" : appearance.textMuted}>
                          📌 pinned
                        </Text>
                      )}
                      {msg.starredBy?.some((id) => String(id) === String(userId)) && (
                        <Text fontSize="10px" color={isMine ? "whiteAlpha.800" : appearance.textMuted}>
                          ★ saved
                        </Text>
                      )}
                      {msg.edited && (
                        <Text fontSize="10px" color={isMine ? "whiteAlpha.800" : appearance.textMuted}>
                          edited
                        </Text>
                      )}
                    </HStack>
                  )}

                  {/* ATTACHMENTS */}
                  <PhotoGrid
                    files={photoAttachments}
                    onOpen={(f) => {
                      setSelectedFile(f);
                      setSelectedGallery(photoAttachments);
                      setIsOpen(true);
                    }}
                  />
                  {fileAttachments.map((file, idx) => (
                    <AttachmentRow
                      key={idx}
                      file={file}
                      appearance={appearance}
                      chatTheme={chatTheme}
                      isMine={isMine}
                      onOpen={(f) => {
                        setSelectedFile(f);
                        setSelectedGallery([]);
                        setIsOpen(true);
                      }}
                    />
                  ))}

                  {reactions.length > 0 && (
                    <Flex
                      position="absolute"
                      right={isMine ? "10px" : "auto"}
                      left={isMine ? "auto" : "10px"}
                      bottom="-13px"
                      zIndex={2}
                    >
                      <Flex
                        align="center"
                        gap={0.5}
                        minH="18px"
                        minW="18px"
                        maxW="92px"
                        px={(msg.reactions?.length || 0) > 1 ? 1 : 0.5}
                        py="0"
                        bg={appearance.cardBg}
                        color={appearance.text}
                        borderRadius="full"
                        boxShadow="md"
                        borderWidth="1px"
                        borderColor={appearance.border}
                        fontSize="13px"
                        lineHeight="1"
                        justify="center"
                        whiteSpace="nowrap"
                        overflow="hidden"
                      >
                        <Text as="span" whiteSpace="nowrap" lineHeight="1">
                          {reactions.map((r) => r.emoji).join("")}
                        </Text>
                        {(msg.reactions?.length || 0) > 1 && (
                          <Text as="span" fontSize="10px" fontWeight="semibold">
                            {msg.reactions.length}
                          </Text>
                        )}
                      </Flex>
                    </Flex>
                  )}
                  {(msg.pending || msg.failed) && (
                    <Text
                      mt={1}
                      fontSize="10px"
                      color={isMine ? "whiteAlpha.800" : appearance.textMuted}
                      textAlign={isMine ? "right" : "left"}
                    >
                      {msg.failed ? "Failed to send" : "Sending..."}
                    </Text>
                  )}
                </Box>
                )}
                </VStack>

                {!isMine && (
                  <MessageHoverActions
                    msg={msg}
                    isMine={isMine}
                    canReply={!isAnnouncement && !isOrganization}
                    visible={showHoverActions}
                    directReceipt={receipt}
                    receiptTitle={receiptTitle}
                    receiptOpen={String(openReceiptId) === String(msg._id)}
                    appearance={appearance}
                    onReply={setReplyTo}
                    onReact={(event, m) => openMessageMenu(event, m, "reactions")}
                    onMore={openMessageMenu}
                    onToggleReceipt={() =>
                      setOpenReceiptId((id) =>
                        String(id) === String(msg._id) ? null : msg._id,
                      )
                    }
                    onOpenReceipt={() => setOpenReceiptId(msg._id)}
                    onCloseReceipt={() => setOpenReceiptId(null)}
                  />
                )}

                  </>
                )}
              </Flex>
              </Fragment>
            );
          })}
          {!visibleMessages.length && listFilter === "pinned" && (
            <Text p={4} textAlign="center" color={appearance.textMuted}>
              No Pinned Messages
            </Text>
          )}
          {!visibleMessages.length && listFilter === "starred" && (
            <Text p={4} textAlign="center" color={appearance.textMuted}>
              No starred Messages
            </Text>
          )}
          {!visibleMessages.length && normalizedListSearch && (
            <Text p={4} textAlign="center" color={appearance.textMuted}>
              No messages found
            </Text>
          )}
        </VStack>
      </Box>

      {/* FILE VIEWER */}
      <FileViewerModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        file={selectedFile}
        gallery={selectedGallery}
        appearance={appearance}
      />

      {/* CONTEXT MENU */}
      {ctxMenuMsg && ctxMenuAnchor && (
        <MessageContextMenu
          anchor={ctxMenuAnchor}
          msg={ctxMenuMsg}
          userId={userId}
          onClose={() => {
            setCtxMenuAnchor(null);
            setCtxMenuMsg(null);
            setCtxMenuMode("actions");
          }}
          onReply={(m) => {
            if (!isAnnouncement && !isOrganization) setReplyTo(m);
          }}
          onEdit={(m) => {
            if (!isAnnouncement) setEditing(m);
          }}
          onDelete={async (id) => {
            await fetch(`${API_BASE}/api/messages/${id}`, {
              method: "DELETE",
              headers: authHeadersJSON(token),
            });

            patchLocalMessage(receiver._id || ANNOUNCEMENT_THREAD_ID, id, {
              deleted: true,
              content: "This message was deleted",
            });
          }}
          onCopy={() => {}}
          onForward={(m) => setForwardMessage(m)}
          onQuickReaction={handleQuickReaction}
          onPin={(m) => void toggleMessageFlag(m, "pin")}
          onStar={(m) => void toggleMessageFlag(m, "star")}
          mode={ctxMenuMode}
          canReply={!isAnnouncement && !isOrganization}
          canEdit={!isAnnouncement}
          canDelete={!isAnnouncement}
          appearance={appearance}
        />
      )}

      {forwardMessage && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2100}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={4}
          onClick={closeForwardPicker}
        >
          <Box
            w="full"
            maxW="420px"
            maxH="80vh"
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            borderRadius="lg"
            boxShadow="2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Box px={4} py={3} borderBottomWidth="1px" borderColor={appearance.border}>
              <Text fontWeight="semibold">Forward message</Text>
              <Text fontSize="sm" color={appearance.textMuted} mt={1} noOfLines={2}>
                {forwardMessage.content?.trim()
                  ? forwardMessage.content
                  : forwardMessage.attachments?.length
                  ? "Attachment"
                  : "Message"}
              </Text>
            </Box>

            <Box p={3} borderBottomWidth="1px" borderColor={appearance.border}>
              <Input
                value={forwardSearch}
                onChange={(e) => setForwardSearch(e.target.value)}
                placeholder="Search people"
                borderRadius="full"
                bg={appearance.inputBg}
                color={appearance.text}
                borderColor={appearance.border}
              />
            </Box>

            <VStack
              align="stretch"
              gap={0}
              maxH="360px"
              overflowY="auto"
              p={2}
            >
              {forwardRecipients.length ? (
                forwardRecipients.map((user) => (
                  <HStack
                    key={user._id}
                    px={2}
                    py={2}
                    borderRadius="md"
                    _hover={{ bg: appearance.hoverBg }}
                    justify="space-between"
                  >
                    <HStack minW={0} gap={3}>
                      <UserAvatar
                        name={user.name}
                        avatarUrl={user.avatarUrl}
                        size="sm"
                      />
                      <Box minW={0}>
                        <Text fontWeight="semibold" truncate>
                          {user.name}
                        </Text>
                        <Text fontSize="xs" color={appearance.textMuted} truncate>
                          {user.email}
                        </Text>
                      </Box>
                    </HStack>
                    <Button
                      size="sm"
                      colorScheme="blue"
                      loading={forwardingTo === String(user._id)}
                      onClick={() => void forwardToUser(user)}
                    >
                      Send
                    </Button>
                  </HStack>
                ))
              ) : (
                <Text p={4} color={appearance.textMuted} textAlign="center">
                  No people found
                </Text>
              )}
            </VStack>

            <Flex justify="flex-end" p={3} borderTopWidth="1px" borderColor={appearance.border}>
              <Button variant="ghost" onClick={closeForwardPicker}>
                Cancel
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </>
  );
}
