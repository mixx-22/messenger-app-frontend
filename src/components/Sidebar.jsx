import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Input,
  TabsContent,
  TabsRoot,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ArrowLeft,
  Building2,
  Camera,
  ChevronDown,
  ChevronRight,
  Check,
  Contact,
  Download,
  Eye,
  FileText,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings as SettingsIcon,
  Sun,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "../context/ChatContext";
import { API_BASE, authHeadersJSON } from "../services/api";
import { formatBytes } from "../settings/appSettings";
import { downloadUrl } from "../utils/downloadFile";
import { resolveUploadUrl } from "../utils/mediaUrl";
import {
  ANNOUNCEMENT_THREAD_ID,
  groupThreadId,
  normalizeMessage,
  organizationThreadId,
  pickId,
} from "../utils/messageUtils";
import UserAvatar from "./UserAvatar";
import { toaster } from "../toaster";
import huniLogo from "../assets/huni-logo.png";
import { decryptMessagePayload } from "../utils/localMessageEncryption";
import { hasRole, roleLabel } from "../utils/roleUtils";
import {
  CUSTOM_STATUS_EMOJIS,
  STATUS_OPTIONS,
  StatusIndicator,
  statusLine,
} from "./userStatus";

// ---------------- ROW COMPONENT (FIXED) ----------------
function ConversationRow({
  user,
  selectedUser,
  onSelectUser,
  conversationByUser,
  onlineUsers,
  statusByUser,
  unreadByPeer,
  formatTime,
  appearance,
}) {
  const id = String(user._id);

  const isAnnouncement = user.isAnnouncement === true;
  const isGroup = user.isGroup === true;
  const isOrganization = user.isOrganization === true;
  const online = !isAnnouncement && !isGroup && !isOrganization && onlineUsers.includes(id);
  const liveStatus = statusByUser?.[id];
  const status =
    liveStatus?.status || user.status || (online ? "available" : "away");
  const visibleOnline = online && status !== "invisible";
  const displayStatus = visibleOnline ? status : "invisible";
  const unread = unreadByPeer[id] || 0;
  const selected = selectedUser?._id === id;

  const last = conversationByUser[id];

  const preview = last?.content?.trim()
    ? last.content
    : isAnnouncement
      ? "Company-wide updates"
      : isOrganization
        ? "Organization tickets"
        : isGroup
          ? "Group chat"
          : "Start a conversation";

  return (
    <Flex
      px={{ base: 2.5, md: 3 }}
      py={{ base: 2.5, md: 2 }}
      borderRadius={{ base: "lg", md: "xl" }}
      align="center"
      justify="space-between"
      bg={selected ? appearance.selectedBg : "transparent"}
      color={selected ? appearance.selectedText : appearance.text}
      _hover={{ bg: appearance.hoverBg, cursor: "pointer" }}
      onClick={() => onSelectUser(user)}
    >
      <HStack gap={3} minW={0} flex={1}>
        <Box position="relative">
          {isOrganization && user.avatarUrl ? (
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
          ) : isOrganization ? (
            <Flex
              w="32px"
              h="32px"
              align="center"
              justify="center"
              borderRadius="full"
              bg={appearance.id === "dark" ? "#164e63" : "cyan.100"}
              color={appearance.id === "dark" ? "#cffafe" : "cyan.700"}
            >
              <Building2 size={17} />
            </Flex>
          ) : isGroup && user.avatarUrl ? (
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
          ) : isGroup ? (
            <Flex
              w="32px"
              h="32px"
              align="center"
              justify="center"
              borderRadius="full"
              bg={appearance.id === "dark" ? "#312e81" : "purple.100"}
              color={appearance.id === "dark" ? "#eef2ff" : "purple.700"}
            >
              <Users size={17} />
            </Flex>
          ) : (
            <UserAvatar name={user.name} avatarUrl={user.avatarUrl} size="sm" />
          )}
          {!isAnnouncement && !isGroup && !isOrganization && (
            <StatusIndicator
              position="absolute"
              bottom={0}
              right={0}
              borderColor={appearance.panelBg}
              status={displayStatus}
              size={15}
              iconSize={7}
            />
          )}
        </Box>

        <Box minW={0} flex={1}>
          <HStack justify="space-between" gap={2}>
            <Text fontWeight="semibold" truncate>
              {user.name}
            </Text>

            <Text fontSize="xs" color={appearance.textSubtle} flexShrink={0}>
              {formatTime(last?.createdAt)}
            </Text>
          </HStack>

          <Text fontSize="xs" color={appearance.textMuted} truncate>
            {preview}
          </Text>
        </Box>
      </HStack>

      {unread > 0 && (
        <Box
          bg="blue.500"
          color="white"
          fontSize="xs"
          px={2}
          py="2px"
          borderRadius="full"
          fontWeight="bold"
        >
          {unread > 99 ? "99+" : unread}
        </Box>
      )}
    </Flex>
  );
}

// ---------------- MAIN SIDEBAR ----------------
export default function Sidebar({
  currentUser,
  onSelectUser,
  selectedUser,
  onLogout,
  onOpenUserManagement,
  onProfileUpdated,
  groupsVersion,
  pendingThreadId,
  appearance,
  onToggleAppearance,
  activeView,
  onBackToChats,
}) {
  const [users, setUsers] = useState([]);
  const [conversationByUser, setConversationByUser] = useState({});
  const [groups, setGroups] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [search, setSearch] = useState("");
  const [chatTypeFilter, setChatTypeFilter] = useState("all");
  const [allFiles, setAllFiles] = useState([]);
  const [loadingAllFiles, setLoadingAllFiles] = useState(false);
  const [sidebarSearchMessages, setSidebarSearchMessages] = useState([]);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [showGroupCreator, setShowGroupCreator] = useState(false);
  const [showOrganizationCreator, setShowOrganizationCreator] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupMemberIds, setGroupMemberIds] = useState([]);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [organizationName, setOrganizationName] = useState("");
  const [organizationSubjects, setOrganizationSubjects] = useState("");
  const [organizationMemberIds, setOrganizationMemberIds] = useState([]);
  const [creatingOrganization, setCreatingOrganization] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [showProfileDrawer, setShowProfileDrawer] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showStatusEditor, setShowStatusEditor] = useState(false);
  const [contactSortDir, setContactSortDir] = useState("asc");
  const [contactStatusFilter, setContactStatusFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("conversations");
  const [statusDraft, setStatusDraft] = useState(
    currentUser?.status || "available",
  );
  const [statusMessageDraft, setStatusMessageDraft] = useState(
    currentUser?.statusMessage || "",
  );
  const [profileDraft, setProfileDraft] = useState({
    contactNumber: currentUser?.contactNumber || "",
    birthday: currentUser?.birthday
      ? String(currentUser.birthday).slice(0, 10)
      : "",
  });
  const [passwordDraft, setPasswordDraft] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const avatarInputRef = useRef(null);
  const filterRailRef = useRef(null);
  const filterButtonRefs = useRef({});

  const {
    token,
    socket,
    onlineUsers,
    statusByUser,
    unreadByPeer,
    threadMap,
    pairThreadKey,
  } = useChat();

  const myId = String(currentUser?._id);
  const drawerStatus = statusDraft || currentUser?.status || "away";
  const drawerStatusLine = statusLine(drawerStatus, statusMessageDraft);

  useEffect(() => {
    setProfileDraft({
      contactNumber: currentUser?.contactNumber || "",
      birthday: currentUser?.birthday
        ? String(currentUser.birthday).slice(0, 10)
        : "",
    });
  }, [currentUser?.birthday, currentUser?.contactNumber]);

  useEffect(() => {
    setStatusDraft(currentUser?.status || "available");
    setStatusMessageDraft(currentUser?.statusMessage || "");
  }, [currentUser?.status, currentUser?.statusMessage]);

  const announcementPeer = useMemo(
    () => ({
      _id: ANNOUNCEMENT_THREAD_ID,
      name: "Announcement",
      email: "",
      avatarUrl: "",
      isAnnouncement: true,
    }),
    [],
  );

  const loadGroups = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/groups`, {
      headers: authHeadersJSON(token),
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => []);
    const groupRows = Array.isArray(data) ? data : [];
    setGroups(groupRows);
    const previews = await Promise.all(
      groupRows.map(async (group) => {
        const key = groupThreadId(group._id);
        const last = group.lastMessage
          ? await decryptMessagePayload(group.lastMessage)
          : null;
        return [
          key,
          last
            ? {
                _id: last._id,
                content: last.content || "",
                createdAt:
                  last.createdAt || group.lastMessageAt || group.updatedAt,
              }
            : {
                content: "Group chat",
                createdAt:
                  group.lastMessageAt || group.updatedAt || group.createdAt,
              },
        ];
      }),
    );
    setConversationByUser((prev) => {
      const next = { ...prev };
      previews.forEach(([key, preview]) => {
        next[key] = preview;
      });
      return next;
    });
  }, [token]);

  const loadOrganizations = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/organizations`, {
      headers: authHeadersJSON(token),
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => []);
    const organizationRows = Array.isArray(data) ? data : [];
    setOrganizations(organizationRows);
    const previews = await Promise.all(
      organizationRows.map(async (organization) => {
        const key = organizationThreadId(organization._id);
        const last = organization.lastMessage
          ? await decryptMessagePayload(organization.lastMessage)
          : null;
        return [
          key,
          last
            ? {
                _id: last._id,
                content: last.content || "",
                createdAt:
                  last.createdAt ||
                  organization.lastMessageAt ||
                  organization.updatedAt,
              }
            : {
                content:
                  organization.isMember === false
                    ? "Join to view organization"
                    : "Organization tickets",
                createdAt:
                  organization.lastMessageAt ||
                  organization.updatedAt ||
                  organization.createdAt,
              },
        ];
      }),
    );
    setConversationByUser((prev) => {
      const next = { ...prev };
      previews.forEach(([key, preview]) => {
        next[key] = preview;
      });
      return next;
    });
  }, [token]);

  const createGroup = async () => {
    if (creatingGroup) return;
    const name = groupName.trim();
    if (!name || groupMemberIds.length === 0) {
      toaster.create({
        type: "error",
        title: "Group needs a name and members",
      });
      return;
    }

    setCreatingGroup(true);
    try {
      const res = await fetch(`${API_BASE}/api/groups`, {
        method: "POST",
        headers: authHeadersJSON(token),
        body: JSON.stringify({ name, memberIds: groupMemberIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Group not created",
          description: data?.message || "Please try again.",
        });
        return;
      }

      await loadGroups();
      setGroupName("");
      setGroupMemberIds([]);
      setGroupMemberSearch("");
      setShowGroupCreator(false);
      onSelectUser({
        _id: groupThreadId(data._id),
        groupId: data._id,
        name: data.name,
        members: data.members || [],
        createdBy: data.createdBy,
        isGroup: true,
      });
      toaster.create({ type: "success", title: "Group created" });
    } finally {
      setCreatingGroup(false);
    }
  };

  const canCreateOrganization =
    hasRole(currentUser, ["Department Head", "Administrator"]);

  const createOrganization = async () => {
    if (creatingOrganization) return;
    const name = organizationName.trim();
    if (!name) {
      toaster.create({
        type: "error",
        title: "Organization channel needs a name",
      });
      return;
    }

    setCreatingOrganization(true);
    try {
      const subjects = organizationSubjects
        .split(",")
        .map((subject) => subject.trim())
        .filter(Boolean);
      const res = await fetch(`${API_BASE}/api/organizations`, {
        method: "POST",
        headers: authHeadersJSON(token),
        body: JSON.stringify({
          name,
          memberIds: organizationMemberIds,
          subjects,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Organization not created",
          description: data?.message || "Please try again.",
        });
        return;
      }

      await loadOrganizations();
      setOrganizationName("");
      setOrganizationSubjects("");
      setOrganizationMemberIds([]);
      setShowOrganizationCreator(false);
      onSelectUser({
        _id: organizationThreadId(data._id),
        organizationId: data._id,
        name: data.name,
        members: data.members || [],
        subjects: data.subjects || [],
        createdBy: data.createdBy,
        isMember: true,
        isOrganization: true,
      });
      toaster.create({ type: "success", title: "Organization channel created" });
    } finally {
      setCreatingOrganization(false);
    }
  };

  const uploadMyAvatar = async (file) => {
    if (!file || !token || uploadingAvatar) return;

    if (!file.type?.startsWith("image/")) {
      toaster.create({
        type: "error",
        title: "Choose an image",
        description: "Avatar uploads must be image files.",
      });
      return;
    }

    setUploadingAvatar(true);
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

      const profileRes = await fetch(`${API_BASE}/api/users/me`, {
        method: "PATCH",
        headers: authHeadersJSON(token),
        body: JSON.stringify({ avatarUrl: uploaded.url }),
      });
      const updatedUser = await profileRes.json().catch(() => ({}));

      if (!profileRes.ok) {
        toaster.create({
          type: "error",
          title: "Avatar not saved",
          description: updatedUser?.message || "Could not update profile.",
        });
        return;
      }

      onProfileUpdated?.(updatedUser);
      setUsers((prev) =>
        prev.map((u) =>
          String(u._id) === String(updatedUser._id) ? updatedUser : u,
        ),
      );

      toaster.create({
        type: "success",
        title: "Avatar updated",
      });
    } catch {
      toaster.create({
        type: "error",
        title: "Avatar not updated",
        description: "Please try again.",
      });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  // ---------------- FETCH USERS ----------------
  useEffect(() => {
    if (!token) return;

    (async () => {
      const res = await fetch(`${API_BASE}/api/users`, {
        headers: authHeadersJSON(token),
      });
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    })();
  }, [token]);

  // ---------------- INITIAL LAST MESSAGE ----------------
  useEffect(() => {
    if (!token || !users.length) return;

    (async () => {
      const pairs = await Promise.all(
        users.map(async (u) => {
          try {
            const id = String(u._id);

            const res = await fetch(
              `${API_BASE}/api/messages/conversation/${id}?limit=1`,
              { headers: authHeadersJSON(token) },
            );

            const data = await res.json();
            const msg = await decryptMessagePayload(data?.items?.[0]);

            return [
              id,
              msg
                ? {
                    content: msg.content || msg.text || "",
                    createdAt: msg.createdAt || Date.now(),
                  }
                : null,
            ];
          } catch {
            return [String(u._id), null];
          }
        }),
      );

      setConversationByUser((prev) => ({
        ...prev,
        ...Object.fromEntries(pairs),
      }));
    })();
  }, [token, users]);

  useEffect(() => {
    if (!token) return;

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/messages/announcements?limit=1`,
          {
            headers: authHeadersJSON(token),
          },
        );
        const data = await res.json().catch(() => ({}));
        const msg = await decryptMessagePayload(data?.items?.[0]);
        setConversationByUser((prev) => ({
          ...prev,
          [ANNOUNCEMENT_THREAD_ID]: msg
            ? {
                _id: msg._id,
                content: msg.content || msg.text || "",
                createdAt: msg.createdAt || Date.now(),
              }
            : prev[ANNOUNCEMENT_THREAD_ID] || {
                content: "Company-wide updates",
                createdAt: 0,
              },
        }));
      } catch {
        setConversationByUser((prev) => ({
          ...prev,
          [ANNOUNCEMENT_THREAD_ID]: prev[ANNOUNCEMENT_THREAD_ID] || {
            content: "Company-wide updates",
            createdAt: 0,
          },
        }));
      }
    })();
  }, [token]);

  useEffect(() => {
    void loadGroups();
    void loadOrganizations();
  }, [loadGroups, loadOrganizations, groupsVersion]);

  // ---------------- THREADMAP -> LAST MESSAGE (SOURCE OF TRUTH) ----------------
  // Ensures sidebar preview updates instantly when ChatContext receives/sends messages,
  // even if socket events are delayed or the sidebar wasn't mounted yet.
  useEffect(() => {
    if (!myId || !users.length || !threadMap || !pairThreadKey) return;

    setConversationByUser((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const u of users) {
        const peerId = String(u._id);
        if (!peerId || peerId === myId) continue;

        const key = pairThreadKey(myId, peerId);
        const row = threadMap[key];
        if (!Array.isArray(row) || row.length === 0) continue;

        const last = row[row.length - 1];
        if (!last) continue;

        const normalized = {
          _id: last._id,
          content: last.content ?? last.text ?? "",
          createdAt: last.createdAt ?? Date.now(),
        };

        const prior = next[peerId];
        const priorAt = new Date(prior?.createdAt || 0).getTime();
        const nextAt = new Date(normalized.createdAt || 0).getTime();

        if (!prior || nextAt >= priorAt) {
          if (
            prior?._id !== normalized._id ||
            prior?.createdAt !== normalized.createdAt
          ) {
            next[peerId] = normalized;
            changed = true;
          }
        }
      }

      const announcements = threadMap[ANNOUNCEMENT_THREAD_ID];
      if (Array.isArray(announcements) && announcements.length) {
        const last = announcements[announcements.length - 1];
        const normalized = {
          _id: last._id,
          content: last.content ?? last.text ?? "",
          createdAt: last.createdAt ?? Date.now(),
        };
        const prior = next[ANNOUNCEMENT_THREAD_ID];
        const priorAt = new Date(prior?.createdAt || 0).getTime();
        const nextAt = new Date(normalized.createdAt || 0).getTime();
        if (!prior || nextAt >= priorAt) {
          next[ANNOUNCEMENT_THREAD_ID] = normalized;
          changed = true;
        }
      }

      for (const group of groups) {
        const key = groupThreadId(group._id);
        const row = threadMap[key];
        if (!Array.isArray(row) || row.length === 0) continue;
        const last = row[row.length - 1];
        const normalized = {
          _id: last._id,
          content: last.content ?? last.text ?? "",
          createdAt: last.createdAt ?? Date.now(),
        };
        const prior = next[key];
        const priorAt = new Date(prior?.createdAt || 0).getTime();
        const nextAt = new Date(normalized.createdAt || 0).getTime();
        if (!prior || nextAt >= priorAt) {
          next[key] = normalized;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [groups, myId, users, threadMap, pairThreadKey]);

  // ---------------- SOCKET UPDATE (FIXED) ----------------
  useEffect(() => {
    if (!socket || !myId) return;

    const handleNewMessage = (incoming) => {
      void (async () => {
        const msg = await decryptMessagePayload(incoming);
        if (msg?.channel === "announcement") {
          const normalizedMessage = {
            content: msg.content ?? msg.text ?? "",
            createdAt: msg.createdAt ?? Date.now(),
            _id: msg._id,
          };

          setConversationByUser((prev) => ({
            ...prev,
            [ANNOUNCEMENT_THREAD_ID]: normalizedMessage,
          }));
          return;
        }

        if (msg?.channel === "group") {
          const key = groupThreadId(msg.groupId);
          const normalizedMessage = {
            content: msg.content ?? msg.text ?? "",
            createdAt: msg.createdAt ?? Date.now(),
            _id: msg._id,
          };

          setConversationByUser((prev) => ({
            ...prev,
            [key]: normalizedMessage,
          }));
          void loadGroups();
          return;
        }

        if (msg?.channel === "organization") {
          const key = organizationThreadId(msg.organizationId);
          const normalizedMessage = {
            content: msg.content ?? msg.text ?? "",
            createdAt: msg.createdAt ?? Date.now(),
            _id: msg._id,
          };

          setConversationByUser((prev) => ({
            ...prev,
            [key]: normalizedMessage,
          }));
          void loadOrganizations();
          return;
        }

        const senderId = pickId(msg.senderId);
        const receiverId = pickId(msg.receiverId);

        const otherUserId = senderId === myId ? receiverId : senderId;
        if (!otherUserId || otherUserId === myId) return;

        const normalizedMessage = {
          content: msg.content ?? msg.text ?? "",
          createdAt: msg.createdAt ?? Date.now(),
          _id: msg._id,
        };

        setConversationByUser((prev) => {
          const prevMsg = prev[otherUserId];

          const prevAt = new Date(prevMsg?.createdAt || 0).getTime();
          const nextAt = new Date(normalizedMessage.createdAt || 0).getTime();

          if (prevMsg && nextAt < prevAt) return prev;

          return {
            ...prev,
            [otherUserId]: normalizedMessage,
          };
        });
      })();
    };

    socket.on("message:new", handleNewMessage);
    socket.on("group:updated", loadGroups);
    socket.on("group:deleted", loadGroups);
    socket.on("organization:updated", loadOrganizations);
    socket.on(
      "user_status",
      ({ userId, status, statusMessage, statusUpdatedAt }) => {
        setUsers((prev) =>
          prev.map((user) =>
            String(user._id) === String(userId)
              ? { ...user, status, statusMessage, statusUpdatedAt }
              : user,
          ),
        );
      },
    );

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("group:updated", loadGroups);
      socket.off("group:deleted", loadGroups);
      socket.off("organization:updated", loadOrganizations);
      socket.off("user_status");
    };
  }, [socket, myId, loadGroups, loadOrganizations]);

  const saveMyStatus = async () => {
    const res = await fetch(`${API_BASE}/api/users/me/status`, {
      method: "PATCH",
      headers: authHeadersJSON(token),
      body: JSON.stringify({
        status: statusDraft,
        statusMessage: statusMessageDraft,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Status not updated",
        description: data?.message || "Please try again.",
      });
      return;
    }
    onProfileUpdated?.(data);
    setStatusDraft(data.status || statusDraft);
    setStatusMessageDraft(data.statusMessage || "");
    toaster.create({ type: "success", title: "Status updated" });
  };

  const addStatusEmoji = (emoji) => {
    setStatusMessageDraft((value) => {
      const trimmed = value.trim();
      if (!trimmed) return `${emoji} `;
      if (trimmed.startsWith(emoji)) return value;
      return `${emoji} ${trimmed}`;
    });
  };

  const saveMyProfile = async () => {
    const res = await fetch(`${API_BASE}/api/users/me`, {
      method: "PATCH",
      headers: authHeadersJSON(token),
      body: JSON.stringify({
        contactNumber: profileDraft.contactNumber,
        birthday: profileDraft.birthday,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Profile not updated",
        description: data?.message || "Please try again.",
      });
      return;
    }
    onProfileUpdated?.(data);
    toaster.create({ type: "success", title: "Profile updated" });
  };

  const changeMyPassword = async () => {
    if (!passwordDraft.newPassword || passwordDraft.newPassword.length < 8) {
      toaster.create({
        type: "error",
        title: "Password must be at least 8 characters",
      });
      return;
    }
    if (passwordDraft.newPassword !== passwordDraft.confirmPassword) {
      toaster.create({ type: "error", title: "Passwords do not match" });
      return;
    }
    const res = await fetch(`${API_BASE}/api/users/me/password`, {
      method: "PATCH",
      headers: authHeadersJSON(token),
      body: JSON.stringify({
        currentPassword: passwordDraft.currentPassword,
        newPassword: passwordDraft.newPassword,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Password not changed",
        description: data?.message || "Please try again.",
      });
      return;
    }
    onProfileUpdated?.(data);
    setPasswordDraft({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setShowPasswordModal(false);
    toaster.create({ type: "success", title: "Password changed" });
  };

  const openMyProfile = () => {
    setShowDrawer(false);
    setShowProfileDrawer(true);
  };

  const openContacts = () => {
    setActiveTab("contacts");
    setShowDrawer(false);
  };

  const openSettings = () => {
    setShowDrawer(false);
    onOpenUserManagement?.();
  };

  const logoutFromDrawer = () => {
    setShowDrawer(false);
    onLogout?.();
  };

  const loadAllFiles = useCallback(async () => {
    if (!token) return;
    setLoadingAllFiles(true);
    try {
      const res = await fetch(`${API_BASE}/api/messages/attachments?scope=all`, {
        headers: authHeadersJSON(token),
      });
      const data = await res.json().catch(() => ({}));
      setAllFiles(res.ok && Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoadingAllFiles(false);
    }
  }, [token]);

  useEffect(() => {
    if (chatTypeFilter === "files") void loadAllFiles();
  }, [chatTypeFilter, loadAllFiles]);

  useEffect(() => {
    const query = search.trim();
    if (!token || query.length < 2 || chatTypeFilter === "files") {
      setSidebarSearchMessages([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(`${API_BASE}/api/messages/search?sidebar=true&limit=300`, {
            headers: authHeadersJSON(token),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !Array.isArray(data.items)) {
            if (!cancelled) setSidebarSearchMessages([]);
            return;
          }
          const decrypted = await Promise.all(data.items.map(decryptMessagePayload));
          const normalized = decrypted.map(normalizeMessage);
          if (!cancelled) setSidebarSearchMessages(normalized);
        } catch {
          if (!cancelled) setSidebarSearchMessages([]);
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [chatTypeFilter, search, token]);

  const selectChatTypeFilter = (id) => {
    setChatTypeFilter(id);
    window.requestAnimationFrame(() => {
      filterButtonRefs.current[id]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    });
  };

  const isSubView = activeTab === "contacts" || activeView === "admin";
  const sidebarTabLabel = activeTab === "contacts" ? "Contacts" : "Chats";
  const handleSidebarNavButton = () => {
    if (isSubView) {
      setActiveTab("conversations");
      setShowDrawer(false);
      onBackToChats?.();
      return;
    }
    setShowDrawer(true);
  };

  // ---------------- FILTER USERS ----------------
  const q = search.trim().toLowerCase();
  const threadIdForMessage = useCallback((message) => {
    if (message?.channel === "announcement") return ANNOUNCEMENT_THREAD_ID;
    if (message?.channel === "group") return groupThreadId(message.groupId);
    if (message?.channel === "organization") return organizationThreadId(message.organizationId);
    const senderId = pickId(message?.senderId);
    const receiverId = pickId(message?.receiverId);
    return senderId === myId ? receiverId : senderId;
  }, [myId]);

  const searchPreviewByThread = useMemo(() => {
    if (!q) return {};
    const result = {};
    sidebarSearchMessages.forEach((message) => {
      const content = String(message?.content || message?.text || "");
      if (!content.toLowerCase().includes(q)) return;
      const threadId = threadIdForMessage(message);
      if (!threadId) return;
      const prior = result[threadId];
      const priorAt = new Date(prior?.createdAt || 0).getTime();
      const nextAt = new Date(message?.createdAt || 0).getTime();
      if (!prior || nextAt >= priorAt) {
        result[threadId] = {
          _id: message._id,
          content,
          createdAt: message.createdAt || Date.now(),
        };
      }
    });
    return result;
  }, [q, sidebarSearchMessages, threadIdForMessage]);

  const searchedThreadIds = useMemo(
    () => new Set(Object.keys(searchPreviewByThread)),
    [searchPreviewByThread],
  );

  const listConversationByUser = useMemo(
    () => ({ ...conversationByUser, ...searchPreviewByThread }),
    [conversationByUser, searchPreviewByThread],
  );

  const messageTextForThread = useCallback(
    (threadId) => {
      const preview = listConversationByUser[String(threadId)]?.content || "";
      const loaded = Array.isArray(threadMap?.[String(threadId)])
        ? threadMap[String(threadId)]
        : [];
      return [
        preview,
        ...loaded.map((message) => message?.content || message?.text || ""),
      ]
        .join(" ")
        .toLowerCase();
    },
    [listConversationByUser, threadMap],
  );

  const matchesQuery = useCallback(
    (peer, extra = "") => {
      if (!q) return true;
      const id = String(peer?._id || "");
      if (searchedThreadIds.has(id)) return true;
      const haystack = `${peer?.name || ""} ${peer?.email || ""} ${extra} ${messageTextForThread(id)}`.toLowerCase();
      return haystack.includes(q);
    },
    [messageTextForThread, q, searchedThreadIds],
  );

  const peers = useMemo(() => {
    return users.filter((u) => {
      const id = String(u._id);
      if (id === myId) return false;

      return matchesQuery(u);
    });
  }, [users, myId, matchesQuery]);

  const contactRows = useMemo(() => {
    const isOnlineContact = (user) => {
      const id = String(user?._id || "");
      const liveStatus = statusByUser?.[id];
      const online = onlineUsers.includes(id);
      const status =
        liveStatus?.status || user.status || (online ? "available" : "away");
      return online && status !== "invisible";
    };

    return peers
      .filter((user) => {
        if (contactStatusFilter === "online") return isOnlineContact(user);
        if (contactStatusFilter === "offline") return !isOnlineContact(user);
        return true;
      })
      .slice()
      .sort((a, b) => {
        const left = String(a.name || a.email || "").toLowerCase();
        const right = String(b.name || b.email || "").toLowerCase();
        const result = left.localeCompare(right);
        return contactSortDir === "asc" ? result : -result;
      });
  }, [contactSortDir, contactStatusFilter, onlineUsers, peers, statusByUser]);

  const groupMemberRows = useMemo(() => {
    const q = groupMemberSearch.trim().toLowerCase();
    return peers.filter((user) => {
      if (!q) return true;
      return `${user.name || ""} ${user.email || ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [groupMemberSearch, peers]);

  const groupPeers = useMemo(() => {
    return groups
      .map((group) => ({
        _id: groupThreadId(group._id),
        groupId: group._id,
        name: group.name,
        avatarUrl: group.avatarUrl,
        members: group.members || [],
        createdBy: group.createdBy,
        isGroup: true,
      }))
      .filter((group) => {
        return matchesQuery(group);
      });
  }, [groups, matchesQuery]);

  const organizationPeers = useMemo(() => {
    return organizations
      .map((organization) => ({
        _id: organizationThreadId(organization._id),
        organizationId: organization._id,
        name: organization.name,
        avatarUrl: organization.avatarUrl,
        members: organization.members || [],
        subjects: organization.subjects || [],
        createdBy: organization.createdBy,
        isMember: organization.isMember,
        isOrganization: true,
      }))
      .filter((organization) => {
        return matchesQuery(organization);
      });
  }, [organizations, matchesQuery]);

  // ---------------- SORT CONVERSATIONS (FIXED) ----------------
  const conversations = useMemo(() => {
    const include = (type) => chatTypeFilter === "all" || chatTypeFilter === type;
    const rows = [
      ...(include("announcement") && matchesQuery(announcementPeer)
        ? [announcementPeer]
        : []),
      ...(include("organization") ? organizationPeers : []),
      ...(include("group") ? groupPeers : []),
      ...(include("direct")
        ? peers.filter((u) => listConversationByUser[String(u._id)])
        : []),
    ];

    return rows.sort((a, b) => {
      const aId = String(a._id);
      const bId = String(b._id);

      const aAt = new Date(listConversationByUser[aId]?.createdAt || 0).getTime();
      const bAt = new Date(listConversationByUser[bId]?.createdAt || 0).getTime();

      return bAt - aAt;
    });
  }, [
    announcementPeer,
    chatTypeFilter,
    groupPeers,
    listConversationByUser,
    matchesQuery,
    organizationPeers,
    peers,
  ]);

  const filteredAllFiles = useMemo(() => {
    if (!q) return allFiles;
    return allFiles.filter((file) => {
      const haystack = `${file?.originalName || ""} ${file?.fileName || ""} ${file?.chatName || ""} ${file?.senderName || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [allFiles, q]);

  useEffect(() => {
    if (!pendingThreadId) return;

    const target = conversations.find(
      (conversation) => String(conversation._id) === String(pendingThreadId),
    );

    if (target) {
      onSelectUser(target);
    }
  }, [conversations, onSelectUser, pendingThreadId]);

  // ---------------- TIME FORMAT ----------------
  const formatTime = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();

    return d.toDateString() === now.toDateString()
      ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString();
  };

  const ghostButtonProps = {
    color: appearance.text,
    _hover: { bg: appearance.hoverBg },
  };
  const neutralButtonProps = {
    color: appearance.text,
    bg: appearance.inputStrongBg,
    borderColor: appearance.border,
    _hover: { bg: appearance.hoverBg },
  };
  const primaryButtonProps = {
    bg: "#7c3aed",
    color: "white",
    _hover: { bg: "#6d28d9" },
  };

  // ---------------- UI ----------------
  return (
    <Flex
      direction="column"
      h="100dvh"
      minH={0}
      overflow="hidden"
      bg={appearance.panelBg}
      color={appearance.text}
    >
      {/* HEADER */}
      <Box
        p={{ base: 2.5, md: 3 }}
        borderBottom="1px solid"
        borderColor={appearance.border}
        flexShrink={0}
      >
        <HStack gap={2}>
          <IconButton
            aria-label={isSubView ? "Back to chats" : "Open menu"}
            size={{ base: "md", md: "sm" }}
            borderRadius="full"
            bg={appearance.inputBg}
            color={appearance.text}
            _hover={{ bg: appearance.hoverBg }}
            onClick={handleSidebarNavButton}
          >
            {isSubView ? <ArrowLeft size={20} /> : <Menu size={20} />}
          </IconButton>
          <Box position="relative" flex="1">
            <Box
              position="absolute"
              left="14px"
              top="50%"
              transform="translateY(-50%)"
              zIndex={1}
              color={appearance.textMuted}
              pointerEvents="none"
              lineHeight={0}
            >
              <Search size={18} />
            </Box>
            <Input
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              borderRadius="full"
              bg={appearance.inputBg}
              color={appearance.text}
              borderColor={appearance.border}
              h="44px"
              pl="42px"
              pr={search ? "42px" : 3}
            />
            {search && (
              <IconButton
                aria-label="Clear search"
                size="xs"
                variant="ghost"
                position="absolute"
                right="8px"
                top="50%"
                transform="translateY(-50%)"
                borderRadius="full"
                color={appearance.textMuted}
                _hover={{ bg: appearance.hoverBg, color: appearance.text }}
                onClick={() => setSearch("")}
              >
                <X size={14} />
              </IconButton>
            )}
          </Box>
        </HStack>
      </Box>

      {/* TABS */}
      <TabsRoot
        value={activeTab}
        onValueChange={(details) => setActiveTab(details.value)}
        display="flex"
        flexDirection="column"
        flex="1"
        minH={0}
      >
        <Box
          p={{ base: 2.5, md: 3 }}
          borderBottom="1px solid"
          borderColor={
            appearance.id === "dark"
              ? appearance.borderStrong
              : appearance.border
          }
          flexShrink={0}
        >
          {activeTab === "conversations" && (
            <HStack
              ref={filterRailRef}
              gap={3}
              overflowX="auto"
              pb={0}
              css={{
                scrollbarWidth: "none",
                "&::-webkit-scrollbar": { display: "none" },
              }}
            >
              {[
                ["all", "All"],
                ["direct", "Chats"],
                ["organization", "Organizations"],
                ["group", "Groups"],
                ["announcement", "Announcement"],
                ["files", "Files"],
              ].map(([id, label]) => {
                const selected = chatTypeFilter === id;
                return (
                  <Button
                    key={id}
                    ref={(node) => {
                      if (node) filterButtonRefs.current[id] = node;
                    }}
                    size="sm"
                    flexShrink={0}
                    minW="max-content"
                    borderRadius="md"
                    bg={selected ? appearance.inputStrongBg : "transparent"}
                    color={selected ? "#7c3aed" : appearance.textMuted}
                    borderBottomWidth="2px"
                    borderBottomColor={selected ? "#7c3aed" : "transparent"}
                    borderBottomRadius="0"
                    fontWeight="semibold"
                    _hover={{ bg: appearance.hoverBg, color: appearance.text }}
                    onClick={() => selectChatTypeFilter(id)}
                  >
                    {label}
                  </Button>
                );
              })}
            </HStack>
          )}
          {activeTab === "contacts" && (
            <VStack align="stretch" gap={2}>
              <Text px={1} fontWeight="semibold" color={appearance.text}>
                {sidebarTabLabel}
              </Text>
              <HStack gap={2} overflowX="auto">
                <Button
                  size="xs"
                  variant="outline"
                  borderColor={appearance.border}
                  color={appearance.text}
                  _hover={{ bg: appearance.hoverBg }}
                  onClick={() =>
                    setContactSortDir((value) =>
                      value === "asc" ? "desc" : "asc",
                    )
                  }
                >
                  {contactSortDir === "asc" ? "A-Z" : "Z-A"}
                </Button>
                {[
                  ["all", "All"],
                  ["online", "Online"],
                  ["offline", "Offline"],
                ].map(([id, label]) => {
                  const selected = contactStatusFilter === id;
                  return (
                    <Button
                      key={id}
                      size="xs"
                      bg={selected ? appearance.inputStrongBg : "transparent"}
                      color={selected ? "#7c3aed" : appearance.textMuted}
                      borderWidth="1px"
                      borderColor={selected ? "#7c3aed" : appearance.border}
                      _hover={{ bg: appearance.hoverBg, color: appearance.text }}
                      onClick={() => setContactStatusFilter(id)}
                    >
                      {label}
                    </Button>
                  );
                })}
              </HStack>
            </VStack>
          )}
        </Box>

        <Box flex="1" minH={0} overflowY="auto" px={2} py={2}>
          <TabsContent value="conversations">
            {chatTypeFilter === "files" ? (
              <VStack align="stretch" gap={2}>
                {loadingAllFiles ? (
                  <Text p={3} color={appearance.textMuted}>
                    Loading files...
                  </Text>
                ) : filteredAllFiles.length ? (
                  filteredAllFiles.map((file, index) => (
                    <SidebarFileRow
                      key={`${file.messageId}-${file.url}-${index}`}
                      file={file}
                      appearance={appearance}
                      formatTime={formatTime}
                    />
                  ))
                ) : (
                  <Text p={3} color={appearance.textMuted}>
                    No files found
                  </Text>
                )}
              </VStack>
            ) : (
              <VStack align="stretch" gap={1}>
                {conversations.length ? (
                  conversations.map((user) => (
                    <ConversationRow
                      key={user._id}
                    user={user}
                    selectedUser={selectedUser}
                    onSelectUser={onSelectUser}
                    conversationByUser={listConversationByUser}
                      onlineUsers={onlineUsers}
                      statusByUser={statusByUser}
                      unreadByPeer={unreadByPeer}
                      formatTime={formatTime}
                      appearance={appearance}
                    />
                  ))
                ) : (
                  <Text p={3} color={appearance.textMuted}>
                    No conversations
                  </Text>
                )}
              </VStack>
            )}
          </TabsContent>

          <TabsContent value="contacts">
            <VStack align="stretch" gap={1}>
              {contactRows.length ? (
                contactRows.map((user) => (
                  <ConversationRow
                    key={user._id}
                    user={user}
                    selectedUser={selectedUser}
                    onSelectUser={onSelectUser}
                    conversationByUser={conversationByUser}
                    onlineUsers={onlineUsers}
                    statusByUser={statusByUser}
                    unreadByPeer={unreadByPeer}
                    formatTime={formatTime}
                    appearance={appearance}
                  />
                ))
              ) : (
                <Text p={3} color={appearance.textMuted}>
                  No contacts
                </Text>
              )}
            </VStack>
          </TabsContent>
        </Box>
      </TabsRoot>

      <Input
        ref={avatarInputRef}
        type="file"
        accept="image/*"
        display="none"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadMyAvatar(file);
        }}
      />

      {showDrawer && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2400}
          bg="blackAlpha.500"
          onClick={() => setShowDrawer(false)}
        >
          <Box
            w={{ base: "86vw", sm: "320px" }}
            maxW="340px"
            h="100dvh"
            bg={appearance.panelBg}
            color={appearance.text}
            boxShadow="2xl"
            borderRightWidth="1px"
            borderColor={appearance.border}
            onClick={(e) => e.stopPropagation()}
            overflowY="auto"
          >
            <Flex
              align="center"
              gap={3}
              px={4}
              py={4}
              borderBottomWidth="1px"
              borderColor={appearance.border}
            >
              <Image
                src={huniLogo}
                alt="Huni logo"
                w="36px"
                h="36px"
                objectFit="cover"
                borderRadius="md"
              />
              <Box minW={0}>
                <Text fontWeight="800" color="#7c3aed">
                  Huni
                </Text>
                <Text fontSize="xs" color={appearance.textMuted}>
                  Account menu
                </Text>
              </Box>
              <IconButton
                aria-label={`Switch to ${
                  appearance.id === "dark" ? "light" : "dark"
                } mode`}
                size="sm"
                variant="ghost"
                ml="auto"
                color={appearance.textMuted}
                _hover={{ bg: appearance.hoverBg }}
                onClick={onToggleAppearance}
              >
                {appearance.id === "dark" ? (
                  <Sun size={18} />
                ) : (
                  <Moon size={18} />
                )}
              </IconButton>
            </Flex>

            <Box
              px={4}
              py={4}
              borderBottomWidth="1px"
              borderColor={appearance.border}
            >
              <HStack gap={3} align="center">
                <Box position="relative" flexShrink={0}>
                  <UserAvatar
                    name={currentUser?.name}
                    avatarUrl={currentUser?.avatarUrl}
                    size="md"
                  />
                  <Box position="absolute" bottom="1px" right="1px">
                    <StatusIndicator
                      status={drawerStatus}
                      size={16}
                      iconSize={8}
                      borderColor={appearance.panelBg}
                    />
                  </Box>
                </Box>
                <Box minW={0}>
                  <Text fontWeight="bold" truncate>
                    {currentUser?.name}
                  </Text>
                  <Text fontSize="xs" color={appearance.textMuted} truncate>
                    {currentUser?.email || "My Profile"}
                  </Text>
                  <Text fontSize="xs" color={appearance.textSubtle} truncate>
                    {drawerStatusLine}
                  </Text>
                </Box>
              </HStack>
            </Box>

            <VStack align="stretch" gap={1} p={2}>
              <Button
                justifyContent="space-between"
                variant="ghost"
                {...ghostButtonProps}
                onClick={() => setShowStatusEditor((value) => !value)}
              >
                <HStack gap={2}>
                  <StatusIndicator
                    status={drawerStatus}
                    size={18}
                    iconSize={10}
                  />
                  <Box textAlign="left" minW={0}>
                    <Text>Change Online Status</Text>
                    <Text fontSize="xs" color={appearance.textSubtle} truncate>
                      {drawerStatusLine}
                    </Text>
                  </Box>
                </HStack>
                {showStatusEditor ? (
                  <ChevronDown size={18} />
                ) : (
                  <ChevronRight size={18} />
                )}
              </Button>

              {showStatusEditor && (
                <VStack
                  align="stretch"
                  gap={3}
                  px={3}
                  py={3}
                  mx={1}
                  mb={1}
                  borderWidth="1px"
                  borderColor={appearance.border}
                  borderRadius="lg"
                  bg={appearance.cardBg}
                >
                  <VStack
                    align="stretch"
                    gap={0}
                    borderWidth="1px"
                    borderColor={appearance.border}
                    borderRadius="lg"
                    overflow="hidden"
                    bg={appearance.inputBg}
                  >
                    {STATUS_OPTIONS.map((option, index) => {
                      const selected = statusDraft === option.value;
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          h="50px"
                          borderRadius="0"
                          justifyContent="space-between"
                          px={3}
                          bg={selected ? appearance.hoverBg : "transparent"}
                          color={appearance.text}
                          borderBottomWidth={
                            index === STATUS_OPTIONS.length - 1 ? "0" : "1px"
                          }
                          borderColor={appearance.border}
                          _hover={{ bg: appearance.hoverBg }}
                          onClick={() => setStatusDraft(option.value)}
                        >
                          <HStack gap={3}>
                            <StatusIndicator
                              status={option.value}
                              size={26}
                              iconSize={14}
                              borderWidth="0"
                            />
                            <Text fontWeight="semibold">{option.label}</Text>
                          </HStack>
                          <Flex
                            w="24px"
                            h="24px"
                            align="center"
                            justify="center"
                            borderRadius="full"
                            borderWidth={selected ? "0" : "2px"}
                            borderColor={appearance.textSubtle}
                            bg={selected ? "#7c3aed" : "transparent"}
                            color="white"
                          >
                            {selected && <Check size={15} />}
                          </Flex>
                        </Button>
                      );
                    })}
                  </VStack>

                  <Box>
                    <Text fontWeight="semibold" fontSize="sm" mb={2}>
                      Set a custom status
                    </Text>
                    <HStack gap={2} mb={2} flexWrap="wrap">
                      {CUSTOM_STATUS_EMOJIS.map((emoji) => (
                        <IconButton
                          key={emoji}
                          type="button"
                          aria-label={`Add ${emoji} to custom status`}
                          size="xs"
                          borderRadius="full"
                          bg={appearance.inputStrongBg}
                          color={appearance.text}
                          borderWidth="1px"
                          borderColor={appearance.border}
                          _hover={{ bg: appearance.hoverBg }}
                          onClick={() => addStatusEmoji(emoji)}
                        >
                          {emoji}
                        </IconButton>
                      ))}
                    </HStack>
                    <Input
                      value={statusMessageDraft}
                      onChange={(e) => setStatusMessageDraft(e.target.value)}
                      placeholder="Just taking a break."
                      bg={appearance.inputStrongBg}
                      borderColor={appearance.border}
                    />
                    <Text mt={1} fontSize="xs" color={appearance.textSubtle}>
                      {drawerStatusLine}
                    </Text>
                  </Box>
                  <Button
                    size="sm"
                    {...neutralButtonProps}
                    onClick={() => void saveMyStatus()}
                  >
                    Save status
                  </Button>
                </VStack>
              )}

              <Button
                justifyContent="flex-start"
                variant="ghost"
                {...ghostButtonProps}
                onClick={openMyProfile}
              >
                <UserRound size={18} />
                My Profile
              </Button>
              <Button
                justifyContent="flex-start"
                variant="ghost"
                {...ghostButtonProps}
                onClick={openContacts}
              >
                <Contact size={18} />
                Contacts
              </Button>
              <Button
                justifyContent="flex-start"
                variant="ghost"
                {...ghostButtonProps}
                onClick={() => {
                  setShowDrawer(false);
                  setShowGroupCreator(true);
                }}
              >
                <Users size={18} />
                Create Group Chat
              </Button>
              {hasRole(currentUser, "Administrator") && (
                <Button
                  justifyContent="flex-start"
                  variant="ghost"
                  {...ghostButtonProps}
                  onClick={openSettings}
                >
                  <SettingsIcon size={18} />
                  Settings
                </Button>
              )}
              {canCreateOrganization && (
                <Button
                  justifyContent="flex-start"
                  variant="ghost"
                  {...ghostButtonProps}
                  onClick={() => {
                    setShowDrawer(false);
                    setShowOrganizationCreator(true);
                  }}
                >
                  <Building2 size={18} />
                  Create Organization
                </Button>
              )}
              <Button
                justifyContent="flex-start"
                variant="ghost"
                {...ghostButtonProps}
                onClick={logoutFromDrawer}
              >
                <LogOut size={18} />
                Logout
              </Button>
            </VStack>
          </Box>
        </Box>
      )}

      {showProfileDrawer && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2450}
          bg="blackAlpha.500"
          onClick={() => setShowProfileDrawer(false)}
        >
          <Box
            w={{ base: "90vw", sm: "380px" }}
            maxW="420px"
            h="100dvh"
            bg={appearance.panelBg}
            color={appearance.text}
            boxShadow="2xl"
            borderLeftWidth="1px"
            borderColor={appearance.border}
            ml="auto"
            onClick={(e) => e.stopPropagation()}
            display="flex"
            flexDirection="column"
          >
            <Flex
              align="center"
              justify="space-between"
              px={4}
              py={4}
              borderBottomWidth="1px"
              borderColor={appearance.border}
              flexShrink={0}
            >
              <Box>
                <Text fontWeight="bold">My Profile</Text>
                <Text fontSize="xs" color={appearance.textMuted}>
                  Update your photo and personal details.
                </Text>
              </Box>
              <Button
                size="sm"
                variant="ghost"
                {...ghostButtonProps}
                onClick={() => setShowProfileDrawer(false)}
              >
                Close
              </Button>
            </Flex>

            <VStack align="stretch" gap={4} p={4} overflowY="auto">
              <Flex align="center" gap={3}>
                <Box position="relative" flexShrink={0}>
                  <UserAvatar
                    name={currentUser?.name}
                    avatarUrl={currentUser?.avatarUrl}
                    size="lg"
                  />
                  <IconButton
                    aria-label="Change avatar"
                    size="xs"
                    position="absolute"
                    right="-6px"
                    bottom="-6px"
                    minW="28px"
                    h="28px"
                    borderRadius="full"
                    bg={appearance.cardBg}
                    color={appearance.text}
                    boxShadow="sm"
                    borderWidth="1px"
                    borderColor={appearance.border}
                    loading={uploadingAvatar}
                    onClick={() => avatarInputRef.current?.click()}
                  >
                    <Camera size={14} />
                  </IconButton>
                </Box>
                <Box minW={0}>
                  <Text fontWeight="bold" truncate>
                    {currentUser?.name}
                  </Text>
                  <Text fontSize="sm" color={appearance.textMuted} truncate>
                    {currentUser?.email}
                  </Text>
                </Box>
              </Flex>

              <Box>
                <Text fontSize="xs" mb={1} color={appearance.textMuted}>
                  Contact Number
                </Text>
                <Input
                  value={profileDraft.contactNumber}
                  onChange={(e) =>
                    setProfileDraft((draft) => ({
                      ...draft,
                      contactNumber: e.target.value,
                    }))
                  }
                  placeholder="Phone or mobile number"
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                />
              </Box>

              <Box>
                <Text fontSize="xs" mb={1} color={appearance.textMuted}>
                  Birthday
                </Text>
                <Input
                  type="date"
                  value={profileDraft.birthday}
                  onChange={(e) =>
                    setProfileDraft((draft) => ({
                      ...draft,
                      birthday: e.target.value,
                    }))
                  }
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                />
              </Box>

              <Box
                borderWidth="1px"
                borderColor={appearance.border}
                borderRadius="md"
                p={3}
                bg={appearance.inputBg}
              >
                <Text fontSize="xs" color={appearance.textMuted}>
                  Department
                </Text>
                <Text fontSize="sm">{currentUser?.department || "-"}</Text>
                <Text fontSize="xs" color={appearance.textMuted} mt={2}>
                  Role
                </Text>
                <Text fontSize="sm">{roleLabel(currentUser)}</Text>
              </Box>

              <Box
                borderWidth="1px"
                borderColor={appearance.border}
                borderRadius="md"
                p={3}
              >
                <Text fontWeight="semibold" mb={1}>
                  Reset Password
                </Text>
                <Text fontSize="xs" color={appearance.textMuted} mb={3}>
                  Open a secure form to update your password.
                </Text>
                <Button
                  {...neutralButtonProps}
                  onClick={() => setShowPasswordModal(true)}
                >
                  Reset password
                </Button>
              </Box>
            </VStack>

            <Flex
              justify="flex-end"
              gap={2}
              p={3}
              borderTopWidth="1px"
              borderColor={appearance.border}
              flexShrink={0}
            >
              <Button
                variant="ghost"
                {...ghostButtonProps}
                onClick={() => setShowProfileDrawer(false)}
              >
                Cancel
              </Button>
              <Button
                {...primaryButtonProps}
                onClick={() => void saveMyProfile()}
              >
                Save profile
              </Button>
            </Flex>
          </Box>
        </Box>
      )}

      {showPasswordModal && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2600}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setShowPasswordModal(false)}
        >
          <Box
            w="full"
            maxW="420px"
            bg={appearance.modalBg}
            color={appearance.text}
            borderRadius="lg"
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
              <Text fontWeight="semibold">Reset Password</Text>
              <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                Enter your current password and choose a new one.
              </Text>
            </Box>
            <VStack align="stretch" gap={3} p={4}>
              <Input
                type="password"
                placeholder="Current password"
                value={passwordDraft.currentPassword}
                onChange={(e) =>
                  setPasswordDraft((draft) => ({
                    ...draft,
                    currentPassword: e.target.value,
                  }))
                }
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
              />
              <Input
                type="password"
                placeholder="New password"
                value={passwordDraft.newPassword}
                onChange={(e) =>
                  setPasswordDraft((draft) => ({
                    ...draft,
                    newPassword: e.target.value,
                  }))
                }
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
              />
              <Input
                type="password"
                placeholder="Confirm password"
                value={passwordDraft.confirmPassword}
                onChange={(e) =>
                  setPasswordDraft((draft) => ({
                    ...draft,
                    confirmPassword: e.target.value,
                  }))
                }
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
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
                {...ghostButtonProps}
                onClick={() => setShowPasswordModal(false)}
              >
                Cancel
              </Button>
              <Button
                {...primaryButtonProps}
                onClick={() => void changeMyPassword()}
              >
                Save password
              </Button>
            </Flex>
          </Box>
        </Box>
      )}

      {showGroupCreator && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2200}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => {
            setShowGroupCreator(false);
            setGroupMemberSearch("");
          }}
        >
          <Box
            w="full"
            maxW="430px"
            maxH={{ base: "92dvh", md: "82vh" }}
            borderRadius={{ base: "md", md: "lg" }}
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            boxShadow="2xl"
            display="flex"
            flexDirection="column"
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
            >
              <Text fontWeight="semibold">Create group chat</Text>
              <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                Start a private chat with selected people. You are included automatically.
              </Text>
            </Box>

            <Box
              p={4}
              flex="1"
              minH={0}
              overflow="hidden"
              display="flex"
              flexDirection="column"
            >
              <Input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
                mb={3}
                flexShrink={0}
              />
              <Input
                value={groupMemberSearch}
                onChange={(e) => setGroupMemberSearch(e.target.value)}
                placeholder="Search people"
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
                mb={3}
                flexShrink={0}
              />
              <Text fontSize="sm" fontWeight="semibold" mb={2} flexShrink={0}>
                Members selected: {groupMemberIds.length}
              </Text>
              <VStack align="stretch" flex="1" minH={0} overflowY="auto" gap={1}>
                {groupMemberRows.map((user) => {
                  const checked = groupMemberIds.includes(String(user._id));
                  return (
                    <HStack
                      key={user._id}
                      px={2}
                      py={2}
                      borderRadius="md"
                      _hover={{ bg: appearance.hoverBg }}
                      cursor="pointer"
                      onClick={() => {
                        const id = String(user._id);
                        setGroupMemberIds((prev) =>
                          prev.includes(id)
                            ? prev.filter((x) => x !== id)
                            : [...prev, id],
                        );
                      }}
                    >
                      <Box
                        w="18px"
                        h="18px"
                        borderRadius="sm"
                        borderWidth="1px"
                        borderColor={
                          checked ? "purple.500" : appearance.borderStrong
                        }
                        bg={checked ? "purple.500" : appearance.inputStrongBg}
                        display="flex"
                        alignItems="center"
                        justifyContent="center"
                      >
                        {checked && <Check size={13} color="white" />}
                      </Box>
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
                  );
                })}
                {!groupMemberRows.length && (
                  <Text p={3} color={appearance.textMuted} fontSize="sm" textAlign="center">
                    No people found
                  </Text>
                )}
              </VStack>
            </Box>

            <Flex
              justify="flex-end"
              gap={2}
              p={3}
              borderTopWidth="1px"
              borderColor={appearance.border}
              flexShrink={0}
            >
              <Button
                variant="ghost"
                color={appearance.text}
                _hover={{ bg: appearance.hoverBg }}
                onClick={() => {
                  setShowGroupCreator(false);
                  setGroupMemberSearch("");
                }}
              >
                Cancel
              </Button>
              <Button
                bg="#7c3aed"
                color="white"
                _hover={{ bg: "#6d28d9" }}
                loading={creatingGroup}
                onClick={() => void createGroup()}
              >
                Create
              </Button>
            </Flex>
          </Box>
        </Box>
      )}

      {showOrganizationCreator && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2200}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setShowOrganizationCreator(false)}
        >
          <Box
            w="full"
            maxW="460px"
            maxH={{ base: "92dvh", md: "82vh" }}
            borderRadius={{ base: "md", md: "lg" }}
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            boxShadow="2xl"
            display="flex"
            flexDirection="column"
            onClick={(e) => e.stopPropagation()}
          >
            <Box
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
            >
              <Text fontWeight="semibold">Create organization channel</Text>
              <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                You will be the Main Admin. Selected users start as Members.
              </Text>
            </Box>

            <Box
              p={4}
              flex="1"
              minH={0}
              overflow="hidden"
              display="flex"
              flexDirection="column"
            >
              <Input
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                placeholder="Organization channel name"
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
                mb={3}
                flexShrink={0}
              />
              <Input
                value={organizationSubjects}
                onChange={(e) => setOrganizationSubjects(e.target.value)}
                placeholder="Subjects, separated by commas"
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
                mb={3}
                flexShrink={0}
              />
              <Text fontSize="sm" fontWeight="semibold" mb={2} flexShrink={0}>
                Members
              </Text>
              <VStack align="stretch" flex="1" minH={0} overflowY="auto" gap={1}>
                {peers.map((user) => {
                  const checked = organizationMemberIds.includes(String(user._id));
                  return (
                    <HStack
                      key={user._id}
                      px={2}
                      py={2}
                      borderRadius="md"
                      _hover={{ bg: appearance.hoverBg }}
                      cursor="pointer"
                      onClick={() => {
                        const id = String(user._id);
                        setOrganizationMemberIds((prev) =>
                          prev.includes(id)
                            ? prev.filter((x) => x !== id)
                            : [...prev, id],
                        );
                      }}
                    >
                      <Box
                        w="18px"
                        h="18px"
                        borderRadius="sm"
                        borderWidth="1px"
                        borderColor={
                          checked ? "purple.500" : appearance.borderStrong
                        }
                        bg={checked ? "purple.500" : appearance.inputStrongBg}
                      />
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
                  );
                })}
              </VStack>
            </Box>

            <Flex
              justify="flex-end"
              gap={2}
              p={3}
              borderTopWidth="1px"
              borderColor={appearance.border}
              flexShrink={0}
            >
              <Button
                variant="ghost"
                color={appearance.text}
                _hover={{ bg: appearance.hoverBg }}
                onClick={() => setShowOrganizationCreator(false)}
              >
                Cancel
              </Button>
              <Button
                bg="#7c3aed"
                color="white"
                _hover={{ bg: "#6d28d9" }}
                loading={creatingOrganization}
                onClick={() => void createOrganization()}
              >
                Create
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </Flex>
  );
}

function SidebarFileRow({ file, appearance, formatTime }) {
  const url = resolveUploadUrl(file?.url);
  const label = file?.originalName || file?.fileName || "Attachment";
  const isImage = file?.type === "image" || String(file?.mimetype || "").startsWith("image/");

  return (
    <Box
      p={2}
      borderRadius="lg"
      bg={appearance.inputBg}
      borderWidth="1px"
      borderColor={appearance.border}
    >
      <HStack gap={3} align="flex-start">
        <Flex
          w="46px"
          h="46px"
          borderRadius="md"
          overflow="hidden"
          flexShrink={0}
          align="center"
          justify="center"
          bg={appearance.inputStrongBg}
          color={appearance.textMuted}
        >
          {isImage && url ? (
            <Image src={url} alt="" w="100%" h="100%" objectFit="cover" />
          ) : (
            <FileText size={20} />
          )}
        </Flex>
        <Box minW={0} flex={1}>
          <Text fontSize="sm" fontWeight="semibold" color={appearance.text} truncate>
            {label}
          </Text>
          <Text fontSize="xs" color={appearance.textMuted} truncate>
            {file?.chatName || "Chat"} · {file?.senderName || "Unknown"}
          </Text>
          <Text fontSize="xs" color={appearance.textSubtle} truncate>
            {formatTime(file?.messageCreatedAt)}
            {typeof file?.size === "number" ? ` · ${formatBytes(file.size)}` : ""}
          </Text>
          <HStack mt={2} gap={1}>
            <IconButton
              aria-label="View file"
              size="xs"
              variant="outline"
              color={appearance.text}
              borderColor={appearance.border}
              bg={appearance.cardBg}
              _hover={{ bg: appearance.hoverBg }}
              disabled={!url}
              onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
            >
              <Eye size={14} />
            </IconButton>
            <IconButton
              aria-label="Download file"
              size="xs"
              bg="#7c3aed"
              color="white"
              _hover={{ bg: "#6d28d9" }}
              disabled={!url}
              onClick={() => {
                void downloadUrl(url, label).catch(() => {
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                });
              }}
            >
              <Download size={14} />
            </IconButton>
          </HStack>
        </Box>
      </HStack>
    </Box>
  );
}
