export const ANNOUNCEMENT_THREAD_ID = "announcement";
export const GROUP_THREAD_PREFIX = "group:";
export const ORGANIZATION_THREAD_PREFIX = "org:";

export function groupThreadId(groupId) {
  return `${GROUP_THREAD_PREFIX}${pickId(groupId)}`;
}

export function groupIdFromThreadId(threadId) {
  const value = String(threadId || "");
  return value.startsWith(GROUP_THREAD_PREFIX)
    ? value.slice(GROUP_THREAD_PREFIX.length)
    : "";
}

export function organizationThreadId(organizationId) {
  return `${ORGANIZATION_THREAD_PREFIX}${pickId(organizationId)}`;
}

export function organizationIdFromThreadId(threadId) {
  const value = String(threadId || "");
  return value.startsWith(ORGANIZATION_THREAD_PREFIX)
    ? value.slice(ORGANIZATION_THREAD_PREFIX.length)
    : "";
}

export function pairThreadKey(a, b) {
  if (String(a) === ANNOUNCEMENT_THREAD_ID || String(b) === ANNOUNCEMENT_THREAD_ID) {
    return ANNOUNCEMENT_THREAD_ID;
  }
  if (String(a).startsWith(GROUP_THREAD_PREFIX)) return String(a);
  if (String(b).startsWith(GROUP_THREAD_PREFIX)) return String(b);
  if (String(a).startsWith(ORGANIZATION_THREAD_PREFIX)) return String(a);
  if (String(b).startsWith(ORGANIZATION_THREAD_PREFIX)) return String(b);
  const [x, y] = [String(a), String(b)].sort();
  return `${x}:${y}`;
}

/** Stable user/message id string for API payloads (handles `_id`, `id`, `$oid`, nested shapes). */
export function pickId(ref) {
  if (ref == null) return ref;
  if (typeof ref === "object") {
    if (ref._id != null) return pickId(ref._id);
    if (ref.id != null) return pickId(ref.id);
    if (typeof ref.$oid === "string") return ref.$oid.trim();
    return "";
  }
  return String(ref).trim();
}

function normalizeReplyPreview(rawReply) {
  if (rawReply == null || rawReply === "") return null;
  if (typeof rawReply === "string") {
    return { _id: String(rawReply), content: "", attachments: [] };
  }
  if (typeof rawReply === "object") {
    let id =
      rawReply._id != null
        ? pickId(rawReply._id)
        : rawReply.id != null
          ? pickId(rawReply.id)
          : "";

    let content = "";
    const c = rawReply.content;
    if (typeof c === "string") content = c;
    else if (c != null && typeof c !== "object") content = String(c);

    const attachments = Array.isArray(rawReply.attachments)
      ? rawReply.attachments
      : [];
    const sender = rawReply.senderId;

    return {
      ...(id !== "" ? { _id: id } : {}),
      content,
      attachments,
      senderId: pickId(rawReply.senderId),
      senderName:
        sender && typeof sender === "object"
          ? sender.name || sender.email || ""
          : rawReply.senderName || "",
    };
  }
  return null;
}

export function normalizeMessage(raw) {
  if (!raw) return raw;
  const msg = { ...raw };
  const sender = raw.senderId;
  msg.senderId = pickId(raw.senderId);
  msg.receiverId = pickId(raw.receiverId);
  msg.groupId = pickId(raw.groupId);
  msg.organizationId = pickId(raw.organizationId);
  if (sender && typeof sender === "object") {
    msg.senderName = sender.name || sender.email || "";
    msg.senderAvatarUrl = sender.avatarUrl || "";
  }
  msg.channel = raw.channel || "direct";
  msg.organizationMessageType = raw.organizationMessageType || "";
  // Important: Mongo IDs may arrive as objects (e.g. {$oid: "..."}).
  // Using String(raw._id) would produce "[object Object]" and break matching/dedup/reply hydration.
  msg._id =
    raw._id != null
      ? pickId(raw._id)
      : raw.id != null
        ? pickId(raw.id)
        : raw._id;
  msg.attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map((a) => {
        if (!a || typeof a !== "object") return null;
        return {
          fileName: a.fileName ?? "",
          originalName: a.originalName ?? "",
          url: a.url ?? "",
          mimetype: a.mimetype ?? "",
          type:
            a.type === "image" || a.type === "pdf" || a.type === "other"
              ? a.type
              : "other",
          size:
            typeof a.size === "number" && Number.isFinite(a.size)
              ? a.size
              : undefined,
          thumbnailUrl: a.thumbnailUrl ?? "",
        };
      }).filter(Boolean)
    : [];

  msg.reactions = Array.isArray(raw.reactions)
    ? raw.reactions
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const userId = pickId(r.userId);
          const type = typeof r.type === "string" ? r.type : "";
          return userId && type ? { userId, type } : null;
        })
        .filter(Boolean)
    : [];

  msg.pinnedBy = Array.isArray(raw.pinnedBy)
    ? raw.pinnedBy.map(pickId).filter(Boolean)
    : [];
  msg.starredBy = Array.isArray(raw.starredBy)
    ? raw.starredBy.map(pickId).filter(Boolean)
    : [];
  msg.editHistory = Array.isArray(raw.editHistory) ? raw.editHistory : [];
  msg.system = Boolean(raw.system);

  msg.seenBy = Array.isArray(raw.seenBy)
    ? raw.seenBy
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const user = row.userId;
          const userId = pickId(user);
          if (!userId) return null;
          return {
            userId,
            seenAt: row.seenAt || row.createdAt || "",
            name:
              user && typeof user === "object"
                ? user.name || user.email || ""
                : "",
            avatarUrl:
              user && typeof user === "object" ? user.avatarUrl || "" : "",
          };
        })
        .filter(Boolean)
    : [];

  msg.replyTo = normalizeReplyPreview(raw.replyTo);

  return msg;
}
