import {
  Flex,
  Box,
  Text,
  Button,
  HStack,
  VStack,
  Input,
  IconButton,
} from "@chakra-ui/react";
import { ArrowLeft, Camera, Mail, Phone, Ticket, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import OrganizationTicketInput from "./OrganizationTicketInput";
import TicketKanbanBoard from "./TicketKanbanBoard";
import TicketWorkflowModal from "./TicketWorkflowModal";
import UserManagementPanel from "./UserManagementPanel";
import MarkdownMessage from "./MarkdownMessage";
import { API_BASE, authHeadersJSON } from "../services/api";
import { normalizeMessage, pickId } from "../utils/messageUtils";
import { hasRole } from "../utils/roleUtils";
import UserAvatar from "./UserAvatar";
import { toaster } from "../toaster";
import { useChat } from "../context/ChatContext";
import { decryptMessagePayload } from "../utils/localMessageEncryption";
import {
  MUTE_OPTIONS,
  isThreadMuted,
  muteLabel,
  muteThread,
  unmuteThread,
} from "../settings/notifications";

function fileTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const MESSAGE_LINK_RE =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)|(https?:\/\/[^\s<)]+|www\.[^\s<)]+)/gi;

function normalizeLinkUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function extractMessageLinks(messages = []) {
  const seen = new Set();
  const links = [];
  messages.forEach((message) => {
    const content = String(message?.content || "");
    content.replace(MESSAGE_LINK_RE, (match, label, markdownHref, bareHref) => {
      const href = normalizeLinkUrl(markdownHref || bareHref || match);
      if (!href || seen.has(href)) return match;
      seen.add(href);
      links.push({
        href,
        label: label || bareHref || href,
        senderName: message?.senderName,
        createdAt: message?.createdAt,
      });
      return match;
    });
  });
  return links;
}

function ticketStatusLabel(status) {
  return String(status || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const ORG_MANAGEMENT_ROLES = new Set(["Co-Admin", "Admin", "Main Admin"]);
const ORG_ANNOUNCEMENT_ROLES = new Set(["Admin", "Main Admin"]);
const ORG_MAIN_ADMIN_ROLES = new Set(["Main Admin"]);
const DANGER_OUTLINE_BUTTON = {
  color: "#fca5a5",
  borderColor: "#fca5a5",
  _hover: { bg: "rgba(248, 113, 113, 0.14)" },
  _disabled: {
    color: "#64748b",
    borderColor: "#475569",
    opacity: 0.75,
  },
};

export default function ChatWindow({
  userId,
  receiver,
  mode,
  currentUser,
  token,
  chatTheme,
  themeOptions,
  onThemeChange,
  onGroupUpdated,
  onBack,
  appearance,
}) {
  const ghostButtonColor = appearance.id === "dark" ? appearance.textMuted : "gray.700";
  const ghostButtonHoverBg =
    appearance.id === "dark" ? "whiteAlpha.100" : "blackAlpha.100";
  const removeButtonStyles =
    appearance.id === "dark"
      ? DANGER_OUTLINE_BUTTON
      : {
          color: "red.600",
          borderColor: "red.300",
          _hover: { bg: "red.50" },
        };

  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [filesMenuRequest, setFilesMenuRequest] = useState(0);
  const [showMembers, setShowMembers] = useState(false);
  const [showSubjects, setShowSubjects] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [savingMembers, setSavingMembers] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState("");
  const [savingSubjects, setSavingSubjects] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchSenderId, setSearchSenderId] = useState("");
  const [searchDateFrom, setSearchDateFrom] = useState("");
  const [searchDateTo, setSearchDateTo] = useState("");
  const [searchHasFiles, setSearchHasFiles] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState("");
  const [searchUsers, setSearchUsers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [messageListFilter, setMessageListFilter] = useState("all");
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [messageListSearch, setMessageListSearch] = useState("");
  const [showPeerProfile, setShowPeerProfile] = useState(false);
  const [muteInfo, setMuteInfo] = useState({ muted: false, label: "" });
  const [showEditGroup, setShowEditGroup] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupAvatarDraft, setGroupAvatarDraft] = useState("");
  const [uploadingChannelAvatar, setUploadingChannelAvatar] = useState(false);
  const [pinnedTickets, setPinnedTickets] = useState([]);
  const [showTickets, setShowTickets] = useState(false);
  const [ticketTab, setTicketTab] = useState("organization");
  const [ticketRows, setTicketRows] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [updatingTicketId, setUpdatingTicketId] = useState("");
  const [ticketWorkflow, setTicketWorkflow] = useState(null);
  const [chatDragActive, setChatDragActive] = useState(false);
  const [droppedFilesBatch, setDroppedFilesBatch] = useState(null);
  const channelAvatarInputRef = useRef(null);
  const [joiningOrganization, setJoiningOrganization] = useState(false);
  const { getMessagesForPeer, socket, maxAttachmentBytes } = useChat();

  useEffect(() => {
    setReplyTo(null);
    setEditing(null);
    setMessageListFilter("all");
    setHeaderSearchOpen(false);
    setMessageListSearch("");
    setShowPeerProfile(false);
  }, [receiver?._id]);

  const canSendAnnouncement =
    receiver?.isAnnouncement === true &&
    hasRole(currentUser, ["Administrator", "Management"]);
  const isReadOnlyAnnouncement =
    receiver?.isAnnouncement === true && !canSendAnnouncement;
  const isOrganization = receiver?.isOrganization === true;
  const organizationId = isOrganization ? pickId(receiver.organizationId) : "";
  const organizationMembership = isOrganization
    ? (receiver?.members || []).find(
        (member) => pickId(member?.userId || member) === String(userId),
      )
    : null;
  const isOrganizationMember =
    !isOrganization || receiver?.isMember === true || Boolean(organizationMembership);
  const organizationRole = organizationMembership?.role || "Member";
  const canManageOrganizationTickets =
    ORG_MANAGEMENT_ROLES.has(organizationRole);
  const canCreateOrganizationTicketForOthers =
    ORG_MANAGEMENT_ROLES.has(organizationRole);
  const canPostOrganizationAnnouncement =
    ORG_ANNOUNCEMENT_ROLES.has(organizationRole);
  const canManageOrganizationMembers =
    ORG_MAIN_ADMIN_ROLES.has(organizationRole);
  const canManageOrganizationSubjects =
    ORG_MAIN_ADMIN_ROLES.has(organizationRole);
  const canDropAttachmentsInChat = !isReadOnlyAnnouncement;
  const groupAdminId = receiver?.isGroup ? pickId(receiver.createdBy) : "";
  const isGroupAdmin =
    receiver?.isGroup === true && groupAdminId === String(userId);
  const groupAdmin =
    receiver?.createdBy && typeof receiver.createdBy === "object"
      ? receiver.createdBy
      : (receiver?.members || []).find(
          (member) => pickId(member) === groupAdminId,
        );

  const groupMembers = Array.isArray(receiver?.members) ? receiver.members : [];
  const groupMemberIds = groupMembers.map((member) => pickId(member));
  const organizationMembers =
    isOrganization && Array.isArray(receiver?.members) ? receiver.members : [];
  const organizationMemberIds = organizationMembers
    .map((member) => pickId(member?.userId || member))
    .filter(Boolean);
  const availableUsers = allUsers.filter((user) => {
    const id = pickId(user);
    const existingIds = isOrganization ? organizationMemberIds : groupMemberIds;
    if (!id || existingIds.includes(id)) return false;
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    return `${user.name || ""} ${user.email || ""}`.toLowerCase().includes(q);
  });
  const headerLinks = extractMessageLinks(
    receiver?._id ? getMessagesForPeer(receiver._id) : [],
  );
  useEffect(() => {
    if (!receiver?._id) return;
    setMuteInfo({
      muted: isThreadMuted(receiver._id),
      label: muteLabel(receiver._id),
    });
  }, [receiver?._id]);

  useEffect(() => {
    if (!showEditGroup || (!receiver?.isGroup && !receiver?.isOrganization)) return;
    setGroupNameDraft(receiver.name || "");
    setGroupAvatarDraft(receiver.avatarUrl || "");
  }, [receiver, showEditGroup]);

  useEffect(() => {
    if (!showSubjects || !receiver?.isOrganization) return;
    setSubjectDraft(
      (Array.isArray(receiver.subjects) ? receiver.subjects : [])
        .filter((subject) => subject?.active !== false)
        .map((subject) => String(subject?.name || subject).trim())
        .filter(Boolean)
        .join(", "),
    );
  }, [receiver, showSubjects]);

  const loadPinnedTickets = useCallback(async () => {
    if (!token || !organizationId || !isOrganizationMember) return;
    const res = await fetch(
      `${API_BASE}/api/organizations/${organizationId}/tickets/pinned`,
      { headers: authHeadersJSON(token) },
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) setPinnedTickets(Array.isArray(data.items) ? data.items : []);
  }, [isOrganizationMember, organizationId, token]);

  const loadTicketRows = useCallback(
    async (tab = ticketTab) => {
      if (!token) return;
      if (!isOrganizationMember) return;
      if (tab === "organization" && !organizationId) return;
      setLoadingTickets(true);
      try {
        const url =
          tab === "organization"
            ? `${API_BASE}/api/organizations/${organizationId}/tickets`
            : tab === "managed"
              ? `${API_BASE}/api/organizations/tickets/managed`
              : `${API_BASE}/api/organizations/tickets/my`;
        const res = await fetch(url, { headers: authHeadersJSON(token) });
        const data = await res.json().catch(() => ({}));
        if (res.ok) setTicketRows(Array.isArray(data.items) ? data.items : []);
      } finally {
        setLoadingTickets(false);
      }
    },
    [isOrganizationMember, organizationId, ticketTab, token],
  );

  const openTickets = (tab = "organization") => {
    setTicketTab(tab);
    setShowTickets(true);
    void loadTicketRows(tab);
  };

  const performTicketUpdate = async (ticket, body) => {
    if (!ticket?._id || !token) return;
    setUpdatingTicketId(ticket._id);
    try {
      const res = await fetch(
        `${API_BASE}/api/organizations/tickets/${ticket._id}`,
        {
          method: "PATCH",
          headers: authHeadersJSON(token),
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Ticket not updated",
          description: data?.message || "Please try again.",
        });
        return;
      }
      const updated = data.ticket;
      if (updated) {
        setTicketRows((rows) =>
          rows.map((row) =>
            row._id === updated._id ? { ...row, ...updated } : row,
          ),
        );
        setPinnedTickets((rows) =>
          rows
            .map((row) =>
              row._id === updated._id ? { ...row, ...updated } : row,
            )
            .filter((row) => !["closed", "invalid"].includes(row.status))
            .slice(0, 2),
        );
      }
      void loadPinnedTickets();
      toaster.create({ type: "success", title: "Ticket updated" });
    } finally {
      setUpdatingTicketId("");
    }
  };

  const updateTicketStatus = async (ticket, status, action = {}) => {
    if (
      action.requiresActionTaken ||
      action.requiresVerificationComment ||
      action.requiresVerification
    ) {
      setTicketWorkflow({ ticket, action: { ...action, status } });
      return;
    }
    await performTicketUpdate(ticket, { status });
  };

  useEffect(() => {
    if (!isOrganization || !isOrganizationMember) {
      setPinnedTickets([]);
      return;
    }
    void loadPinnedTickets();
  }, [isOrganization, isOrganizationMember, organizationId, token, loadPinnedTickets]);

  useEffect(() => {
    if (!socket || !isOrganization) return;
    const refresh = () => {
      void loadPinnedTickets();
      if (showTickets) void loadTicketRows(ticketTab);
    };
    socket.on("ticket:created", refresh);
    socket.on("ticket:updated", refresh);
    return () => {
      socket.off("ticket:created", refresh);
      socket.off("ticket:updated", refresh);
    };
  }, [
    socket,
    isOrganization,
    organizationId,
    showTickets,
    ticketTab,
    loadPinnedTickets,
    loadTicketRows,
  ]);

  useEffect(() => {
    if (!showMembers || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users`, {
          headers: authHeadersJSON(token),
        });
        const data = await res.json().catch(() => []);
        if (!cancelled) setAllUsers(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setAllUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMembers, token]);

  useEffect(() => {
    if (!showSearch || !token) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users`, {
          headers: authHeadersJSON(token),
        });
        const data = await res.json().catch(() => []);
        if (!cancelled) setSearchUsers(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSearchUsers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showSearch, token]);

  const updateGroupMembers = async (memberIds) => {
    if (!receiver?.isGroup || !isGroupAdmin || savingMembers) return;
    setSavingMembers(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/groups/${pickId(receiver.groupId)}/members`,
        {
          method: "PATCH",
          headers: authHeadersJSON(token),
          body: JSON.stringify({ memberIds }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Members not updated",
          description: data?.message || "Please try again.",
        });
        return;
      }
      onGroupUpdated?.(data);
    } finally {
      setSavingMembers(false);
    }
  };

  const changeMute = (optionId) => {
    if (!receiver?._id) return;

    if (optionId === "off") {
      unmuteThread(receiver._id);
      setMuteInfo({ muted: false, label: "" });
      return;
    }

    muteThread(receiver._id, optionId);
    setMuteInfo({
      muted: isThreadMuted(receiver._id),
      label: muteLabel(receiver._id),
    });

    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };

  const updateOrganizationMembers = async (members) => {
    if (
      !receiver?.isOrganization ||
      !canManageOrganizationMembers ||
      savingMembers
    )
      return;
    setSavingMembers(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/organizations/${organizationId}/members`,
        {
          method: "PATCH",
          headers: authHeadersJSON(token),
          body: JSON.stringify({ members }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Members not updated",
          description: data?.message || "Please try again.",
        });
        return;
      }
      onGroupUpdated?.(data);
    } finally {
      setSavingMembers(false);
    }
  };

  const updateOrganizationSubjects = async () => {
    if (
      !receiver?.isOrganization ||
      !canManageOrganizationSubjects ||
      savingSubjects
    )
      return;
    setSavingSubjects(true);
    try {
      const subjects = subjectDraft
        .split(",")
        .map((subject) => subject.trim())
        .filter(Boolean);
      const res = await fetch(
        `${API_BASE}/api/organizations/${organizationId}/subjects`,
        {
          method: "PATCH",
          headers: authHeadersJSON(token),
          body: JSON.stringify({ subjects }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Subjects not updated",
          description: data?.message || "Please try again.",
        });
        return;
      }
      onGroupUpdated?.(data);
      setShowSubjects(false);
    } finally {
      setSavingSubjects(false);
    }
  };

  const runSearch = async () => {
    const q = searchQuery.trim();
    if (
      !receiver ||
      (!q &&
        !searchSenderId &&
        !searchDateFrom &&
        !searchDateTo &&
        !searchHasFiles)
    ) {
      return;
    }
    setSearching(true);
    try {
      if (q) {
        const needle = q.toLowerCase();
        const loadedMessages = getMessagesForPeer(receiver._id).filter(
          (msg) => {
            if (receiver.isAnnouncement && msg.channel !== "announcement")
              return false;
            if (
              receiver.isGroup &&
              (msg.channel !== "group" ||
                String(msg.groupId) !== String(receiver.groupId))
            ) {
              return false;
            }
            if (!receiver.isAnnouncement && !receiver.isGroup) {
              const a = String(msg.senderId);
              const b = String(msg.receiverId);
              const peerId = pickId(receiver);
              if (
                !(
                  (a === String(userId) && b === peerId) ||
                  (a === peerId && b === String(userId))
                )
              ) {
                return false;
              }
            }
            if (
              searchSenderId &&
              String(msg.senderId) !== String(searchSenderId)
            ) {
              return false;
            }
            if (searchHasFiles && !msg.attachments?.length) return false;
            const created = msg.createdAt ? new Date(msg.createdAt) : null;
            if (
              searchDateFrom &&
              created &&
              created < new Date(searchDateFrom)
            ) {
              return false;
            }
            if (searchDateTo && created) {
              const end = new Date(searchDateTo);
              end.setHours(23, 59, 59, 999);
              if (created > end) return false;
            }
            return String(msg.content || "")
              .toLowerCase()
              .includes(needle);
          },
        );
        setSearchResults(loadedMessages);
        setSearchHighlight(q);
        return;
      }

      const params = new URLSearchParams();
      if (searchSenderId) params.set("senderId", searchSenderId);
      if (searchDateFrom) params.set("dateFrom", searchDateFrom);
      if (searchDateTo) params.set("dateTo", searchDateTo);
      if (searchHasFiles) params.set("hasFiles", "true");
      if (receiver.isAnnouncement) params.set("channel", "announcement");
      else if (receiver.isGroup)
        params.set("groupId", pickId(receiver.groupId));
      else params.set("peerId", pickId(receiver));
      const res = await fetch(`${API_BASE}/api/messages/search?${params}`, {
        headers: authHeadersJSON(token),
      });
      const data = await res.json().catch(() => ({}));
      const decryptedItems =
        res.ok && Array.isArray(data.items)
          ? await Promise.all(data.items.map(decryptMessagePayload))
          : [];
      setSearchResults(decryptedItems.map(normalizeMessage));
      setSearchHighlight(q);
    } finally {
      setSearching(false);
    }
  };

  const jumpToMessage = (messageId) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) {
      toaster.create({
        type: "info",
        title: "Message is outside the loaded window",
        description: "Load older messages, then try again.",
      });
      return;
    }
    setShowSearch(false);
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.animate?.(
      [
        { outline: `0 solid ${chatTheme.accent}` },
        { outline: `4px solid ${chatTheme.accent}` },
        { outline: `0 solid ${chatTheme.accent}` },
      ],
      { duration: 1100 },
    );
  };

  const saveGroupDetails = async () => {
    if (receiver?.isGroup && !isGroupAdmin) return;
    if (receiver?.isOrganization && !canManageOrganizationSubjects) return;
    if (!receiver?.isGroup && !receiver?.isOrganization) return;

    const url = receiver?.isOrganization
      ? `${API_BASE}/api/organizations/${organizationId}`
      : `${API_BASE}/api/groups/${pickId(receiver.groupId)}`;
    const res = await fetch(
      url,
      {
        method: "PATCH",
        headers: authHeadersJSON(token),
        body: JSON.stringify({
          name: groupNameDraft,
          avatarUrl: groupAvatarDraft,
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: receiver?.isOrganization
          ? "Organization not updated"
          : "Group not updated",
        description: data?.message || "Please try again.",
      });
      return;
    }
    onGroupUpdated?.(data);
    setShowEditGroup(false);
  };

  const uploadChannelAvatar = async (file) => {
    if (!file || !token || uploadingChannelAvatar) return;
    if (!file.type?.startsWith("image/")) {
      toaster.create({
        type: "error",
        title: "Choose an image",
        description: "Channel avatars must be image files.",
      });
      return;
    }

    setUploadingChannelAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const uploaded = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        toaster.create({
          type: "error",
          title: "Upload failed",
          description: uploaded?.message || "Could not upload avatar.",
        });
        return;
      }
      setGroupAvatarDraft(uploaded.url || "");
    } finally {
      setUploadingChannelAvatar(false);
      if (channelAvatarInputRef.current) channelAvatarInputRef.current.value = "";
    }
  };

  const leaveGroup = async () => {
    if (!receiver?.isGroup && !receiver?.isOrganization) return;
    if (receiver?.isGroup && isGroupAdmin) return;
    const ok = window.confirm(`Leave "${receiver.name}"?`);
    if (!ok) return;
    const url = receiver?.isOrganization
      ? `${API_BASE}/api/organizations/${organizationId}/leave`
      : `${API_BASE}/api/groups/${pickId(receiver.groupId)}/leave`;
    const res = await fetch(url, {
      method: "POST",
      headers: authHeadersJSON(token),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: receiver?.isOrganization
          ? "Could not leave organization"
          : "Could not leave group",
        description: data?.message || "Please try again.",
      });
      return;
    }
    onGroupUpdated?.(null);
  };

  const joinOrganization = async () => {
    if (!receiver?.isOrganization || !organizationId || joiningOrganization) return;
    setJoiningOrganization(true);
    try {
      const res = await fetch(`${API_BASE}/api/organizations/${organizationId}/join`, {
        method: "POST",
        headers: authHeadersJSON(token),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Could not join organization",
          description: data?.message || "Please try again.",
        });
        return;
      }
      onGroupUpdated?.({ ...data, isMember: true });
      toaster.create({ type: "success", title: "Organization joined" });
    } finally {
      setJoiningOrganization(false);
    }
  };

  const deleteGroup = async () => {
    if (!receiver?.isGroup || !isGroupAdmin) return;
    const ok = window.confirm(`Delete "${receiver.name}" for everyone?`);
    if (!ok) return;

    const res = await fetch(
      `${API_BASE}/api/groups/${pickId(receiver.groupId)}`,
      {
        method: "DELETE",
        headers: authHeadersJSON(token),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Group not deleted",
        description: data?.message || "Please try again.",
      });
      return;
    }

    toaster.create({ type: "success", title: "Group deleted" });
    onGroupUpdated?.(null);
  };

  useEffect(() => {
    if (!filesMenuRequest || !receiver || !token) return;
    let cancelled = false;

    const params = new URLSearchParams();
    if (receiver.isAnnouncement) {
      params.set("channel", "announcement");
    } else if (receiver.isGroup) {
      params.set("groupId", pickId(receiver.groupId));
    } else {
      params.set("peerId", pickId(receiver));
    }

    setLoadingFiles(true);
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/messages/attachments?${params.toString()}`,
          { headers: authHeadersJSON(token) },
        );
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setFiles(res.ok && Array.isArray(data.items) ? data.items : []);
        }
      } catch {
        if (!cancelled) setFiles([]);
      } finally {
        if (!cancelled) setLoadingFiles(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filesMenuRequest, receiver, token]);

  if (mode === "admin") {
    if (!hasRole(currentUser, "Administrator")) {
      return (
        <Flex h="100%" align="center" justify="center">
          <Text color={appearance.textMuted}>Access denied</Text>
        </Flex>
      );
    }
    return (
      <Flex direction="column" h="100%" minH={0} bg={appearance.emptyBg}>
        <Flex
          display={{ base: "flex", md: "none" }}
          align="center"
          gap={2}
          px={3}
          py={2}
          bg={appearance.panelBg}
          color={appearance.text}
          borderBottomWidth="1px"
          borderColor={appearance.border}
          flexShrink={0}
        >
          <IconButton
            aria-label="Back to chats"
            variant="ghost"
            size="sm"
            borderRadius="full"
            onClick={() => onBack?.()}
          >
            <ArrowLeft size={20} />
          </IconButton>
          <Text fontWeight="semibold">Settings</Text>
        </Flex>
        <Box flex="1" minH={0}>
          <UserManagementPanel token={token} appearance={appearance} />
        </Box>
      </Flex>
    );
  }

  if (!receiver) {
    return (
      <Flex h="100%" align="center" justify="center" bg={appearance.emptyBg}>
        <Text color={appearance.textMuted}>Select a conversation</Text>
      </Flex>
    );
  }

  return (
    <Flex
      direction="column"
      h="100dvh"
      minH={0}
      bg={chatTheme.windowBg}
      position="relative"
      onDragOver={(event) => {
        if (
          !canDropAttachmentsInChat ||
          !event.dataTransfer?.types?.includes("Files")
        )
          return;
        event.preventDefault();
        setChatDragActive(true);
      }}
      onDragLeave={(event) => {
        if (!canDropAttachmentsInChat) return;
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setChatDragActive(false);
        }
      }}
      onDrop={(event) => {
        if (!canDropAttachmentsInChat) return;
        event.preventDefault();
        setChatDragActive(false);
        const files = Array.from(event.dataTransfer?.files || []);
        if (files.length) {
          setDroppedFilesBatch({ id: Date.now(), files });
        }
      }}
    >
      {chatDragActive && canDropAttachmentsInChat && (
        <Flex
          position="absolute"
          inset={0}
          zIndex={1200}
          align="center"
          justify="center"
          bg={appearance.id === "dark" ? "blackAlpha.600" : "blackAlpha.300"}
          pointerEvents="none"
        >
          <Flex
            px={5}
            py={4}
            borderRadius="lg"
            bg={appearance.modalBg}
            color={appearance.text}
            borderWidth="1px"
            borderColor={chatTheme.accent}
            boxShadow="xl"
            fontWeight="semibold"
          >
            Drop files to attach
          </Flex>
        </Flex>
      )}

      {/* HEADER */}
      <Box
        bg={chatTheme.headerBg}
        borderBottom="1px solid"
        borderColor={appearance.border}
        flexShrink={0}
      >
        <ChatHeader
          receiver={receiver}
          chatTheme={chatTheme}
          themeOptions={themeOptions}
          onThemeChange={onThemeChange}
          onViewFiles={() => setFilesMenuRequest((value) => value + 1)}
          files={files}
          links={headerLinks}
          loadingFiles={loadingFiles}
          onViewPinned={() =>
            setMessageListFilter((value) =>
              value === "pinned" ? "all" : "pinned",
            )
          }
          onViewStarred={() =>
            setMessageListFilter((value) =>
              value === "starred" ? "all" : "starred",
            )
          }
          onSearchMessages={() => {
            setHeaderSearchOpen(true);
            setMessageListFilter("all");
          }}
          onViewProfile={() => setShowPeerProfile(true)}
          listFilter={messageListFilter}
          searchOpen={headerSearchOpen}
          searchValue={messageListSearch}
          onSearchValueChange={setMessageListSearch}
          onCloseSearch={() => {
            setHeaderSearchOpen(false);
            setMessageListSearch("");
          }}
          onViewTickets={() => openTickets("organization")}
          onMuteChange={changeMute}
          muted={muteInfo.muted}
          muteLabel={muteInfo.label}
          muteOptions={MUTE_OPTIONS}
          onManageMembers={() => setShowMembers(true)}
          onManageSubjects={() => setShowSubjects(true)}
          onDeleteGroup={() => void deleteGroup()}
          onLeaveGroup={() => void leaveGroup()}
          onEditGroup={() => setShowEditGroup(true)}
          groupAdmin={groupAdmin}
          isGroupAdmin={isGroupAdmin}
          organizationRole={isOrganizationMember ? organizationRole : "Not a member"}
          isOrganizationMember={isOrganizationMember}
          canLeaveOrganization={isOrganizationMember}
          canManageOrganizationMembers={canManageOrganizationMembers}
          canManageOrganizationSubjects={canManageOrganizationSubjects}
          onBack={onBack}
          appearance={appearance}
        />
      </Box>

      {isOrganization && !isOrganizationMember ? (
        <Flex
          flex="1"
          minH={0}
          direction="column"
          align="center"
          justify="center"
          gap={3}
          px={5}
          textAlign="center"
          bg={chatTheme.windowBg}
        >
          <Box
            w="56px"
            h="56px"
            borderRadius="full"
            bg={appearance.inputBg}
            display="flex"
            alignItems="center"
            justifyContent="center"
            color={chatTheme.accent}
          >
            <Ticket size={24} />
          </Box>
          <Box maxW="420px">
            <Text fontWeight="bold" fontSize="lg" color={appearance.text}>
              Join {receiver?.name}
            </Text>
            <Text mt={1} fontSize="sm" color={appearance.textMuted}>
              You can see this organization channel, but messages and tickets are available only after you join. Your history starts from the day you join.
            </Text>
          </Box>
          <Button
            bg={chatTheme.accent}
            color="white"
            _hover={{ bg: chatTheme.accentHover }}
            loading={joiningOrganization}
            onClick={() => void joinOrganization()}
          >
            Join Organization
          </Button>
        </Flex>
      ) : (
        <>
      {isOrganization && (
        <Box
          px={{ base: 2, md: 4 }}
          py={2}
          bg={appearance.panelBg}
          borderBottom="1px solid"
          borderColor={appearance.border}
          flexShrink={0}
        >
          <Flex align="center" gap={2} wrap="wrap">
            {pinnedTickets.map((ticket) => (
              <HStack
                key={ticket._id}
                gap={2}
                px={3}
                py={1.5}
                borderRadius="md"
                bg={appearance.inputBg}
                borderWidth="1px"
                borderColor={appearance.border}
              >
                <Ticket size={14} color={chatTheme.accent} />
                <Text
                  fontSize="xs"
                  fontWeight="semibold"
                  color={appearance.text}
                >
                  {ticket.ticketNumber || "Ticket pending"}
                </Text>
                <Text fontSize="xs" color={appearance.textMuted} noOfLines={1}>
                  {ticketStatusLabel(ticket.status)} · {ticket.subject}
                </Text>
              </HStack>
            ))}
            {!pinnedTickets.length && (
              <Text fontSize="xs" color={appearance.textMuted}>
                No active tickets pinned.
              </Text>
            )}
            <Button
              size="xs"
              variant="ghost"
              color={chatTheme.accent}
              ml="auto"
              onClick={() => openTickets("organization")}
            >
              View all tickets
            </Button>
          </Flex>
        </Box>
      )}

      {/* MESSAGE AREA (IMPORTANT FIX) */}
      <Flex flex="1" minH={0} overflow="hidden" direction="column">
        <MessageList
          userId={userId}
          currentUser={currentUser}
          receiver={receiver}
          setReplyTo={setReplyTo}
          setEditing={setEditing}
          chatTheme={chatTheme}
          appearance={appearance}
          searchHighlight={messageListSearch || searchHighlight}
          listFilter={messageListFilter}
          listSearchQuery={messageListSearch}
        />
      </Flex>

      {/* INPUT */}
      <Box
        bg={chatTheme.inputBg}
        borderTop="1px solid"
        borderColor={appearance.border}
        flexShrink={0}
      >
        {isOrganization ? (
          <OrganizationTicketInput
            receiver={receiver}
            chatTheme={chatTheme}
            appearance={appearance}
            canCreateTicketForOthers={canCreateOrganizationTicketForOthers}
            canPostAnnouncement={canPostOrganizationAnnouncement}
          />
        ) : (
          <ChatInput
            userId={userId}
            receiver={receiver}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            editing={editing}
            setEditing={setEditing}
            chatTheme={chatTheme}
            appearance={appearance}
            readOnly={isReadOnlyAnnouncement}
            droppedFilesBatch={droppedFilesBatch}
          />
        )}
      </Box>
        </>
      )}

      {showTickets && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2300}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setShowTickets(false)}
        >
          <Box
            w="full"
            maxW={{ base: "calc(100vw - 16px)", md: "calc(100vw - 48px)" }}
            h={{ base: "94dvh", md: "92dvh" }}
            maxH="94dvh"
            borderRadius={{ base: "md", md: "lg" }}
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            boxShadow="2xl"
            onClick={(e) => e.stopPropagation()}
            display="flex"
            flexDirection="column"
          >
            <Flex
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
              justify="space-between"
              align="center"
            >
              <Box minW={0}>
                <Text fontWeight="semibold">Tickets</Text>
                <Text fontSize="xs" color={appearance.textMuted} truncate>
                  {ticketTab === "organization"
                    ? receiver?.name
                    : ticketTab === "managed"
                      ? "Users Tickets"
                      : "All organization channels"}
                </Text>
              </Box>
              <HStack gap={2}>
                <Button
                  size="sm"
                  variant="ghost"
                  color={appearance.text}
                  _hover={{ bg: appearance.hoverBg }}
                  onClick={() => setShowTickets(false)}
                >
                  Close
                </Button>
              </HStack>
            </Flex>

            <HStack
              px={3}
              py={2}
              borderBottomWidth="1px"
              borderColor={appearance.border}
              gap={2}
            >
              {[
                ["organization", "This Organization"],
                ...(canManageOrganizationTickets
                  ? [["managed", "Users Tickets"]]
                  : []),
                ["mine", "My Tickets"],
              ].map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={ticketTab === id ? "solid" : "outline"}
                  bg={
                    ticketTab === id
                      ? chatTheme.accent
                      : appearance.inputStrongBg
                  }
                  color={ticketTab === id ? "white" : appearance.text}
                  borderColor={appearance.border}
                  _hover={{
                    bg:
                      ticketTab === id
                        ? chatTheme.accentHover
                        : appearance.hoverBg,
                  }}
                  onClick={() => {
                    setTicketTab(id);
                    void loadTicketRows(id);
                  }}
                >
                  {label}
                </Button>
              ))}
            </HStack>

            <Box p={3} flex="1" minH={0} overflow="auto">
              {loadingTickets && (
                <Text color={appearance.textMuted} fontSize="sm">
                  Loading tickets...
                </Text>
              )}
              {!loadingTickets && ticketRows.length > 0 && (
                <TicketKanbanBoard
                  tickets={ticketRows}
                  appearance={appearance}
                  accent={chatTheme.accent}
                  currentUserId={userId}
                  canManage={
                    ticketTab === "organization"
                      ? canManageOrganizationTickets
                      : ticketTab === "managed"
                  }
                  updatingTicketId={updatingTicketId}
                  onStatusChange={updateTicketStatus}
                />
              )}
              {!loadingTickets && !ticketRows.length && (
                <Text color={appearance.textMuted} fontSize="sm" p={2}>
                  No tickets found.
                </Text>
              )}
            </Box>
          </Box>
        </Box>
      )}

      {ticketWorkflow && (
        <TicketWorkflowModal
          action={ticketWorkflow.action}
          ticket={ticketWorkflow.ticket}
          token={token}
          appearance={appearance}
          maxAttachmentBytes={maxAttachmentBytes}
          onClose={() => setTicketWorkflow(null)}
          onSubmit={async (body) => {
            await performTicketUpdate(ticketWorkflow.ticket, body);
            setTicketWorkflow(null);
          }}
        />
      )}

      {showMembers && receiver?.isGroup && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2350}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setShowMembers(false)}
        >
          <Box
            w="full"
            maxW="560px"
            maxH={{ base: "92dvh", md: "84vh" }}
            borderRadius={{ base: "md", md: "lg" }}
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            boxShadow="2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Flex
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
              justify="space-between"
              align="center"
            >
              <Box minW={0}>
                <Text fontWeight="semibold">
                  {isGroupAdmin ? "Manage members" : "Group members"}
                </Text>
                <Text fontSize="xs" color={appearance.textMuted} truncate>
                  Admin: {groupAdmin?.name || groupAdmin?.email || "Unknown"}
                </Text>
              </Box>
              <Button
                size="sm"
                variant="ghost"
                color={ghostButtonColor}
                _hover={{ bg: ghostButtonHoverBg }}
                onClick={() => setShowMembers(false)}
              >
                Close
              </Button>
            </Flex>

            <Box p={4} borderBottomWidth="1px" borderColor={appearance.border}>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Current members
              </Text>
              <VStack align="stretch" gap={1} maxH="240px" overflowY="auto">
                {groupMembers.map((member) => {
                  const id = pickId(member);
                  const isAdmin = id === groupAdminId;
                  return (
                    <HStack
                      key={id}
                      justify="space-between"
                      px={2}
                      py={2}
                      borderRadius="md"
                      _hover={{ bg: appearance.hoverBg }}
                    >
                      <HStack minW={0} gap={3}>
                        <UserAvatar
                          name={member.name}
                          avatarUrl={member.avatarUrl}
                          size="sm"
                        />
                        <Box minW={0}>
                          <Text fontWeight="semibold" truncate>
                            {member.name || member.email}
                          </Text>
                          <Text
                            fontSize="xs"
                            color={appearance.textMuted}
                            truncate
                          >
                            {isAdmin ? "Group admin" : member.email}
                          </Text>
                        </Box>
                      </HStack>
                      {isGroupAdmin && !isAdmin && (
                        <Button
                          size="xs"
                          variant="outline"
                          {...removeButtonStyles}
                          loading={savingMembers}
                          onClick={() =>
                            void updateGroupMembers(
                              groupMemberIds.filter(
                                (memberId) => memberId !== id,
                              ),
                            )
                          }
                        >
                          Remove
                        </Button>
                      )}
                    </HStack>
                  );
                })}
              </VStack>
            </Box>

            {isGroupAdmin && (
              <Box p={4}>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Add members
                </Text>
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search people"
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                  mb={3}
                />
                <VStack align="stretch" gap={1} maxH="240px" overflowY="auto">
                  {availableUsers.length ? (
                    availableUsers.map((user) => {
                      const id = pickId(user);
                      return (
                        <HStack
                          key={id}
                          justify="space-between"
                          px={2}
                          py={2}
                          borderRadius="md"
                          _hover={{ bg: appearance.hoverBg }}
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
                              <Text
                                fontSize="xs"
                                color={appearance.textMuted}
                                truncate
                              >
                                {user.email}
                              </Text>
                            </Box>
                          </HStack>
                          <Button
                            size="xs"
                            bg="#7c3aed"
                            color="white"
                            _hover={{ bg: "#6d28d9" }}
                            loading={savingMembers}
                            onClick={() =>
                              void updateGroupMembers([...groupMemberIds, id])
                            }
                          >
                            Add
                          </Button>
                        </HStack>
                      );
                    })
                  ) : (
                    <Text
                      color={appearance.textMuted}
                      textAlign="center"
                      py={3}
                    >
                      No people to add
                    </Text>
                  )}
                </VStack>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {showMembers && receiver?.isOrganization && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2350}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setShowMembers(false)}
        >
          <Box
            w="full"
            maxW="620px"
            maxH={{ base: "92dvh", md: "84vh" }}
            borderRadius={{ base: "md", md: "lg" }}
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            boxShadow="2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Flex
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
              justify="space-between"
              align="center"
            >
              <Box minW={0}>
                <Text fontWeight="semibold">Manage organization members</Text>
                <Text fontSize="xs" color={appearance.textMuted} truncate>
                  Main Admin only
                </Text>
              </Box>
              <Button
                size="sm"
                variant="ghost"
                color={ghostButtonColor}
                _hover={{ bg: ghostButtonHoverBg }}
                onClick={() => setShowMembers(false)}
              >
                Close
              </Button>
            </Flex>

            <Box p={4} borderBottomWidth="1px" borderColor={appearance.border}>
              <Text fontSize="sm" fontWeight="semibold" mb={2}>
                Current members
              </Text>
              <VStack align="stretch" gap={1} maxH="280px" overflowY="auto">
                {organizationMembers.map((member) => {
                  const user = member.userId || member;
                  const id = pickId(user);
                  const role = member.role || "Member";
                  return (
                    <HStack
                      key={id}
                      justify="space-between"
                      px={2}
                      py={2}
                      borderRadius="md"
                      _hover={{ bg: appearance.hoverBg }}
                      gap={3}
                    >
                      <HStack minW={0} gap={3} flex={1}>
                        <UserAvatar
                          name={user.name}
                          avatarUrl={user.avatarUrl}
                          size="sm"
                        />
                        <Box minW={0}>
                          <Text fontWeight="semibold" truncate>
                            {user.name || user.email}
                          </Text>
                          <Text
                            fontSize="xs"
                            color={appearance.textMuted}
                            truncate
                          >
                            {user.email}
                          </Text>
                        </Box>
                      </HStack>
                      <Box
                        as="select"
                        value={role}
                        disabled={savingMembers}
                        onChange={(event) =>
                          void updateOrganizationMembers(
                            organizationMembers.map((row) => ({
                              userId: pickId(row.userId || row),
                              role:
                                pickId(row.userId || row) === id
                                  ? event.target.value
                                  : row.role || "Member",
                            })),
                          )
                        }
                        h="32px"
                        px={2}
                        borderWidth="1px"
                        borderRadius="md"
                        borderColor={appearance.border}
                        bg={appearance.inputStrongBg}
                        color={appearance.text}
                      >
                        {["Member", "Co-Admin", "Admin", "Main Admin"].map(
                          (item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ),
                        )}
                      </Box>
                      <Button
                        size="xs"
                        variant="outline"
                        {...removeButtonStyles}
                        loading={savingMembers}
                        disabled={
                          role === "Main Admin" &&
                          organizationMembers.filter(
                            (row) => row.role === "Main Admin",
                          ).length <= 1
                        }
                        onClick={() =>
                          void updateOrganizationMembers(
                            organizationMembers
                              .filter((row) => pickId(row.userId || row) !== id)
                              .map((row) => ({
                                userId: pickId(row.userId || row),
                                role: row.role || "Member",
                              })),
                          )
                        }
                      >
                        Remove
                      </Button>
                    </HStack>
                  );
                })}
              </VStack>
            </Box>

            {canManageOrganizationMembers && (
              <Box p={4}>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Add members
                </Text>
                <Input
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search people"
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                  mb={3}
                />
                <VStack align="stretch" gap={1} maxH="220px" overflowY="auto">
                  {availableUsers.length ? (
                    availableUsers.map((user) => {
                      const id = pickId(user);
                      return (
                        <HStack
                          key={id}
                          justify="space-between"
                          px={2}
                          py={2}
                          borderRadius="md"
                          _hover={{ bg: appearance.hoverBg }}
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
                              <Text
                                fontSize="xs"
                                color={appearance.textMuted}
                                truncate
                              >
                                {user.email}
                              </Text>
                            </Box>
                          </HStack>
                          <Button
                            size="xs"
                            bg="#7c3aed"
                            color="white"
                            _hover={{ bg: "#6d28d9" }}
                            loading={savingMembers}
                            onClick={() =>
                              void updateOrganizationMembers([
                                ...organizationMembers.map((row) => ({
                                  userId: pickId(row.userId || row),
                                  role: row.role || "Member",
                                })),
                                { userId: id, role: "Member" },
                              ])
                            }
                          >
                            Add
                          </Button>
                        </HStack>
                      );
                    })
                  ) : (
                    <Text
                      color={appearance.textMuted}
                      textAlign="center"
                      py={3}
                    >
                      No people to add
                    </Text>
                  )}
                </VStack>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {showSubjects && receiver?.isOrganization && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2350}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setShowSubjects(false)}
        >
          <Box
            w="full"
            maxW="520px"
            bg={appearance.modalBg}
            color={appearance.text}
            borderRadius={{ base: "md", md: "lg" }}
            boxShadow="2xl"
            overflow="hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
            >
              <Text fontWeight="semibold">Manage subjects</Text>
              <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                Separate subjects with commas.
              </Text>
            </Box>
            <Box p={4}>
              <Input
                value={subjectDraft}
                onChange={(e) => setSubjectDraft(e.target.value)}
                placeholder="Account Inquiry, IT Support, Payroll"
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
              />
            </Box>
            <Flex
              justify="flex-end"
              gap={2}
              p={3}
              borderTopWidth="1px"
              borderColor={appearance.border}
            >
              <Button
                variant="ghost"
                color={ghostButtonColor}
                _hover={{ bg: ghostButtonHoverBg }}
                onClick={() => setShowSubjects(false)}
              >
                Cancel
              </Button>
              <Button
                bg="#7c3aed"
                color="white"
                _hover={{ bg: "#6d28d9" }}
                loading={savingSubjects}
                onClick={() => void updateOrganizationSubjects()}
              >
                Save subjects
              </Button>
            </Flex>
          </Box>
        </Box>
      )}

      {showPeerProfile &&
        receiver &&
        !receiver.isGroup &&
        !receiver.isAnnouncement &&
        !receiver.isOrganization && (
          <Box
            position="fixed"
            inset={0}
            zIndex={2355}
            bg={appearance.modalOverlay}
            display="flex"
            justifyContent="flex-end"
            onClick={() => setShowPeerProfile(false)}
          >
            <Box
              w={{ base: "100%", sm: "380px" }}
              h="100%"
              bg={appearance.modalBg}
              color={appearance.text}
              boxShadow="2xl"
              borderLeftWidth={{ base: "0", sm: "1px" }}
              borderColor={appearance.border}
              onClick={(event) => event.stopPropagation()}
              display="flex"
              flexDirection="column"
            >
              <Flex
                align="center"
                justify="space-between"
                px={4}
                py={3}
                borderBottomWidth="1px"
                borderColor={appearance.border}
              >
                <Text fontWeight="semibold">Profile</Text>
                <IconButton
                  aria-label="Close profile"
                  size="sm"
                  variant="ghost"
                  color={appearance.text}
                  onClick={() => setShowPeerProfile(false)}
                >
                  <X size={18} />
                </IconButton>
              </Flex>
              <VStack align="stretch" gap={4} p={5} overflowY="auto">
                <VStack gap={3}>
                  <UserAvatar
                    name={receiver.name}
                    avatarUrl={receiver.avatarUrl}
                    size="2xl"
                  />
                  <Box textAlign="center">
                    <Text fontSize="lg" fontWeight="bold">
                      {receiver.name || "User"}
                    </Text>
                    <Text fontSize="sm" color={appearance.textMuted}>
                      {receiver.department || receiver.role || "Direct chat"}
                    </Text>
                  </Box>
                </VStack>
                <VStack align="stretch" gap={2}>
                  <HStack
                    p={3}
                    borderRadius="md"
                    bg={appearance.inputBg}
                    borderWidth="1px"
                    borderColor={appearance.border}
                  >
                    <Mail size={17} />
                    <Box minW={0}>
                      <Text fontSize="xs" color={appearance.textMuted}>
                        Email
                      </Text>
                      <Text fontSize="sm" truncate>
                        {receiver.email || "Not provided"}
                      </Text>
                    </Box>
                  </HStack>
                  <HStack
                    p={3}
                    borderRadius="md"
                    bg={appearance.inputBg}
                    borderWidth="1px"
                    borderColor={appearance.border}
                  >
                    <Phone size={17} />
                    <Box minW={0}>
                      <Text fontSize="xs" color={appearance.textMuted}>
                        Contact number
                      </Text>
                      <Text fontSize="sm" truncate>
                        {receiver.contactNumber || "Not provided"}
                      </Text>
                    </Box>
                  </HStack>
                </VStack>
              </VStack>
            </Box>
          </Box>
        )}

      {showSearch && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2360}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setShowSearch(false)}
        >
          <Box
            w="full"
            maxW="560px"
            maxH={{ base: "92dvh", md: "82vh" }}
            borderRadius={{ base: "md", md: "lg" }}
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            boxShadow="2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Flex
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
              justify="space-between"
              align="center"
            >
              <Text fontWeight="semibold">Search messages</Text>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowSearch(false)}
              >
                Close
              </Button>
            </Flex>
            <VStack
              p={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
              align="stretch"
              gap={2}
            >
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch();
                }}
                placeholder="Search this chat"
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
              />
              <HStack flexWrap="wrap" align="center">
                <Box
                  as="select"
                  value={searchSenderId}
                  onChange={(e) => setSearchSenderId(e.target.value)}
                  h="36px"
                  px={2}
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor={appearance.border}
                  bg={appearance.inputStrongBg}
                  color={appearance.text}
                >
                  <option value="">Any sender</option>
                  {searchUsers.map((user) => (
                    <option key={user._id} value={user._id}>
                      {user.name || user.email}
                    </option>
                  ))}
                </Box>
                <Input
                  type="date"
                  value={searchDateFrom}
                  onChange={(e) => setSearchDateFrom(e.target.value)}
                  w="150px"
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                />
                <Input
                  type="date"
                  value={searchDateTo}
                  onChange={(e) => setSearchDateTo(e.target.value)}
                  w="150px"
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                />
                <Button
                  size="sm"
                  variant={searchHasFiles ? "solid" : "outline"}
                  onClick={() => setSearchHasFiles((value) => !value)}
                >
                  Files only
                </Button>
                <Button
                  size="sm"
                  loading={searching}
                  onClick={() => void runSearch()}
                >
                  Search
                </Button>
              </HStack>
            </VStack>
            <VStack align="stretch" maxH="55vh" overflowY="auto" p={2}>
              {searchResults.length ? (
                searchResults.map((msg) => (
                  <Box
                    key={msg._id}
                    p={3}
                    borderRadius="md"
                    cursor="pointer"
                    _hover={{ bg: appearance.hoverBg }}
                    onClick={() => jumpToMessage(msg._id)}
                  >
                    <MarkdownMessage
                      color={appearance.text}
                      highlight={searchQuery}
                    >
                      {msg.content || "Attachment"}
                    </MarkdownMessage>
                    <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                      {fileTime(msg.createdAt)}
                    </Text>
                  </Box>
                ))
              ) : (
                <Text p={4} color={appearance.textMuted} textAlign="center">
                  No matching messages
                </Text>
              )}
            </VStack>
          </Box>
        </Box>
      )}

      {showEditGroup &&
        ((receiver?.isGroup && isGroupAdmin) ||
          (receiver?.isOrganization && canManageOrganizationSubjects)) && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2370}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setShowEditGroup(false)}
        >
          <Box
            w="full"
            maxW="420px"
            maxH={{ base: "92dvh", md: "none" }}
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            borderRadius="lg"
            boxShadow="2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
            >
              <Text fontWeight="semibold">
                {receiver?.isOrganization ? "Edit organization" : "Edit group"}
              </Text>
            </Box>
            <VStack align="stretch" p={4} gap={3}>
              <Input
                value={groupNameDraft}
                onChange={(e) => setGroupNameDraft(e.target.value)}
                placeholder={receiver?.isOrganization ? "Organization name" : "Group name"}
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
              />
              <HStack gap={3}>
                <UserAvatar
                  name={groupNameDraft || receiver?.name}
                  avatarUrl={groupAvatarDraft}
                  size="md"
                />
                <Button
                  size="sm"
                  variant="outline"
                  color={appearance.text}
                  borderColor={appearance.border}
                  _hover={{ bg: appearance.hoverBg }}
                  loading={uploadingChannelAvatar}
                  onClick={() => channelAvatarInputRef.current?.click()}
                >
                  <HStack gap={1.5}>
                    <Camera size={16} />
                    <Text as="span">Upload avatar</Text>
                  </HStack>
                </Button>
              </HStack>
              <Input
                ref={channelAvatarInputRef}
                type="file"
                accept="image/*"
                display="none"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadChannelAvatar(file);
                }}
              />
            </VStack>
            <Flex
              justify="flex-end"
              gap={2}
              p={3}
              borderTopWidth="1px"
              borderColor={appearance.border}
            >
              <Button
                variant="ghost"
                color={ghostButtonColor}
                _hover={{ bg: ghostButtonHoverBg }}
                onClick={() => setShowEditGroup(false)}
              >
                Cancel
              </Button>
              <Button
                bg="#7c3aed"
                color="white"
                _hover={{ bg: "#6d28d9" }}
                onClick={() => void saveGroupDetails()}
              >
                Save
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </Flex>
  );
}
