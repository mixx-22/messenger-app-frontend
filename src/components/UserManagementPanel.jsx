import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  Menu,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  MoreVertical,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { API_BASE, authHeadersJSON } from "../services/api";
import { toaster } from "../toaster";
import { useChat } from "../context/ChatContext";
import { formatBytes } from "../settings/appSettings";
import { decryptMessagePayload } from "../utils/localMessageEncryption";
import { resolveUploadUrl } from "../utils/mediaUrl";
import { downloadUrl } from "../utils/downloadFile";
import { roleLabel, userRoles } from "../utils/roleUtils";

const initialForm = {
  name: "",
  email: "",
  department: "",
  roles: ["User"],
};

const LIST_PAGE_SIZE = 10;
const MODERATION_PREVIEW_LINES = 3;
const MODERATION_PREVIEW_CHARS = 280;
const DEPARTMENTS = [
  "System Administrator",
  "Admin",
  "Accounting",
  "Audit",
  "Information System Department",
  "Purchasing",
  "Human Resources Management",
  "Sales",
  "Clinic",
  "Quality Assurance",
  "Research and Development",
  "Production",
  "Raw Materials Warehouse",
  "Finish Goods Warehouse",
  "Engineering",
];
const USER_ROLES = ["Administrator", "Department Head", "Management", "User"];

function displayUser(user) {
  if (!user || typeof user !== "object") return "Unknown";
  return user.name || user.email || "Unknown";
}

function Section({ title, description, action, appearance, height, children }) {
  return (
    <Box
      bg={appearance.cardBg}
      borderWidth="1px"
      borderColor={appearance.border}
      borderRadius="lg"
      overflow="hidden"
      h={height}
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
        gap={3}
      >
        <Box minW={0}>
          <Text fontWeight="semibold">{title}</Text>
          {description && (
            <Text fontSize="xs" color={appearance.textMuted} mt={1}>
              {description}
            </Text>
          )}
        </Box>
        {action}
      </Flex>
      <Box p={3} flex={height ? "1" : undefined} minH={0} overflow="hidden">
        {children}
      </Box>
    </Box>
  );
}

function attachmentLabel(file) {
  return file?.originalName || file?.fileName || "Attachment";
}

function moderationBody(message) {
  const content = typeof message?.content === "string" ? message.content : "";
  if (content.trim()) return content;
  return `${message?.attachments?.length || 0} attachment(s)`;
}

function isLongModerationBody(value) {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  return lines.length > MODERATION_PREVIEW_LINES || value.length > MODERATION_PREVIEW_CHARS;
}

function loadMoreOnBottom(event, hasMore, loadMore) {
  if (!hasMore) return;
  const el = event.currentTarget;
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (remaining <= 24) loadMore();
}

function moderationPreviewBody(value) {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim());

  if (!lines.length) return value;

  const preview = lines.slice(0, MODERATION_PREVIEW_LINES).join("\n\n");
  if (preview.length <= MODERATION_PREVIEW_CHARS) return preview;
  return `${preview.slice(0, MODERATION_PREVIEW_CHARS).trimEnd()}...`;
}

async function downloadAttachment(file) {
  const url = resolveUploadUrl(file?.url);
  if (!url) return;
  await downloadUrl(url, attachmentLabel(file));
}

function ModerationAttachment({ file, appearance }) {
  const url = resolveUploadUrl(file?.url);
  const label = attachmentLabel(file);
  const isImage =
    file?.type === "image" || String(file?.mimetype || "").startsWith("image/");

  return (
    <Flex
      mt={2}
      p={2}
      gap={2}
      align="center"
      borderWidth="1px"
      borderColor={appearance.border}
      borderRadius="md"
      bg={appearance.cardBg}
    >
      {isImage && url ? (
        <Box
          as="img"
          src={url}
          alt=""
          w="42px"
          h="42px"
          objectFit="cover"
          borderRadius="md"
          flexShrink={0}
        />
      ) : (
        <Flex
          w="42px"
          h="42px"
          align="center"
          justify="center"
          borderRadius="md"
          bg={appearance.id === "dark" ? "#312e81" : "purple.100"}
          color={appearance.id === "dark" ? "#eef2ff" : "purple.700"}
          fontSize="xs"
          fontWeight="bold"
          flexShrink={0}
        >
          {file?.type === "pdf" ? "PDF" : "FILE"}
        </Flex>
      )}

      <Box minW={0} flex="1">
        <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
          {label}
        </Text>
        <Text fontSize="xs" color={appearance.textMuted}>
          {file?.mimetype || file?.type || "file"}
          {typeof file?.size === "number" ? ` | ${formatBytes(file.size)}` : ""}
        </Text>
      </Box>

      <HStack flexShrink={0}>
        <Button
          size="xs"
          variant="outline"
          color={appearance.text}
          bg={appearance.inputStrongBg}
          borderColor={appearance.border}
          _hover={{ bg: appearance.hoverBg }}
          disabled={!url}
          onClick={() =>
            url && window.open(url, "_blank", "noopener,noreferrer")
          }
        >
          Open
        </Button>
        <Button
          size="xs"
          bg="#7c3aed"
          color="white"
          _hover={{ bg: "#6d28d9" }}
          disabled={!url}
          onClick={() => {
            void downloadAttachment(file).catch(() => {
              if (url) window.open(url, "_blank", "noopener,noreferrer");
            });
          }}
        >
          Download
        </Button>
      </HStack>
    </Flex>
  );
}

export default function UserManagementPanel({ token, appearance }) {
  const { maxAttachmentBytes, refreshAttachmentLimits } = useChat();
  const [attachKb, setAttachKb] = useState("204800");
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [moderationMessages, setModerationMessages] = useState([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [visibleAccountCount, setVisibleAccountCount] = useState(LIST_PAGE_SIZE);
  const [moderationSearch, setModerationSearch] = useState("");
  const [moderationChannel, setModerationChannel] = useState("");
  const [visibleModerationCount, setVisibleModerationCount] = useState(LIST_PAGE_SIZE);
  const [loadingModeration, setLoadingModeration] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [showDepartmentOptions, setShowDepartmentOptions] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [generatedCredentials, setGeneratedCredentials] = useState(null);
  const [expandedModerationMessage, setExpandedModerationMessage] = useState(null);

  useEffect(() => {
    if (typeof maxAttachmentBytes === "number" && maxAttachmentBytes > 0) {
      const kib = Math.max(1, Math.round(maxAttachmentBytes / 1024));
      setAttachKb(String(kib));
    }
  }, [maxAttachmentBytes]);

  const loadUsers = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/users`, {
      headers: authHeadersJSON(token),
    });
    if (!res.ok) return;
    const data = await res.json();
    setUsers(Array.isArray(data) ? data : []);
  }, [token]);

  const loadAuditLogs = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/audit?limit=80`, {
      headers: authHeadersJSON(token),
    });
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    setAuditLogs(Array.isArray(data.items) ? data.items : []);
  }, [token]);

  const loadModerationMessages = useCallback(async () => {
    if (!token) return;
    setLoadingModeration(true);
    try {
      const params = new URLSearchParams({ limit: "160" });
      if (moderationChannel) params.set("channel", moderationChannel);
      const res = await fetch(`${API_BASE}/api/messages/moderation?${params}`, {
        headers: authHeadersJSON(token),
      });
      const data = await res.json().catch(() => ({}));
      const items =
        res.ok && Array.isArray(data.items)
          ? await Promise.all(data.items.map(decryptMessagePayload))
          : [];
      setModerationMessages(items);
    } finally {
      setLoadingModeration(false);
    }
  }, [moderationChannel, token]);

  useEffect(() => {
    if (!token) return;
    void loadUsers();
    void loadAuditLogs();
  }, [token, loadUsers, loadAuditLogs]);

  useEffect(() => {
    if (!token) return;
    void loadModerationMessages();
  }, [token, loadModerationMessages]);

  const suspendedCount = users.filter((user) => user.suspended).length;
  const adminCount = users.filter(
    (user) => userRoles(user).includes("Administrator"),
  ).length;

  const closeUserModal = () => {
    setShowUserModal(false);
    setEditingUserId(null);
    setForm(initialForm);
    setDepartmentSearch("");
    setShowDepartmentOptions(false);
  };

  const openAddUser = () => {
    setEditingUserId(null);
    setForm(initialForm);
    setDepartmentSearch("");
    setShowUserModal(true);
  };

  const startEdit = (user) => {
    const roles = userRoles(user).filter((role) => USER_ROLES.includes(role));
    setEditingUserId(user._id);
    setForm({
      name: user.name || "",
      email: user.email || "",
      department: user.department || "",
      roles: roles.length ? roles : ["User"],
    });
    setDepartmentSearch("");
    setShowUserModal(true);
  };

  const saveUser = async (e) => {
    e.preventDefault();
    const isEdit = Boolean(editingUserId);
    const url = isEdit
      ? `${API_BASE}/api/users/${editingUserId}`
      : `${API_BASE}/api/users`;
    const method = isEdit ? "PUT" : "POST";
    const body = {
      name: form.name,
      email: form.email,
      department: form.department,
      roles: form.roles?.length ? form.roles : ["User"],
    };

    const res = await fetch(url, {
      method,
      headers: authHeadersJSON(token),
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Failed to save user",
        description: data?.message || "Please check your input.",
      });
      return;
    }

    toaster.create({
      type: "success",
      title: isEdit ? "User updated" : "User created",
    });
    if (!isEdit) {
      setGeneratedCredentials({
        email: data.user?.email || form.email,
        password: data.temporaryPassword || "",
      });
    }
    closeUserModal();
    await loadUsers();
    await loadAuditLogs();
  };

  const saveAttachmentLimit = async () => {
    const kib = Number.parseInt(String(attachKb).replace(",", ""), 10);
    if (!Number.isFinite(kib) || kib <= 0) {
      toaster.create({
        type: "error",
        title: "Invalid value",
        description: "Enter a positive number of kilobytes.",
      });
      return;
    }
    const res = await fetch(`${API_BASE}/api/settings/attachments`, {
      method: "PUT",
      headers: authHeadersJSON(token),
      body: JSON.stringify({ maxAttachmentKilobytes: kib }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Could not update limit",
        description: data?.message || `HTTP ${res.status}`,
      });
      return;
    }
    toaster.create({ type: "success", title: "Upload size limit updated" });
    await refreshAttachmentLimits();
    await loadAuditLogs();
  };

  const toggleSuspension = async (user) => {
    const nextSuspended = !user.suspended;
    const reason = nextSuspended
      ? window.prompt("Reason for suspension?", user.suspendReason || "")
      : "";
    if (nextSuspended && reason === null) return;

    const res = await fetch(`${API_BASE}/api/users/${user._id}/suspension`, {
      method: "PATCH",
      headers: authHeadersJSON(token),
      body: JSON.stringify({
        suspended: nextSuspended,
        reason: reason || "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: nextSuspended ? "Suspend failed" : "Restore failed",
        description: data?.message || "Please try again.",
      });
      return;
    }

    toaster.create({
      type: "success",
      title: nextSuspended ? "Account suspended" : "Account restored",
    });
    await loadUsers();
    await loadAuditLogs();
  };

  const removeUser = async (id) => {
    const res = await fetch(`${API_BASE}/api/users/${id}`, {
      method: "DELETE",
      headers: authHeadersJSON(token),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Delete failed",
        description: data?.message || "Could not delete user.",
      });
      return;
    }
    toaster.create({ type: "success", title: "User deleted" });
    await loadUsers();
    await loadAuditLogs();
  };

  const copyCredentials = async (credentials = generatedCredentials) => {
    if (!credentials) return;
    const value = `Email: ${credentials.email}\nPassword: ${credentials.password}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        throw new Error("Clipboard API unavailable");
      }
      toaster.create({ type: "success", title: "Credentials copied" });
    } catch {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      area.style.top = "0";
      document.body.appendChild(area);
      area.focus();
      area.select();
      const copied = document.execCommand("copy");
      area.remove();

      toaster.create({
        type: copied ? "success" : "error",
        title: copied ? "Credentials copied" : "Could not copy credentials",
      });
    }
  };

  const resetUserPassword = async (user) => {
    const res = await fetch(
      `${API_BASE}/api/users/${user._id}/password-reset`,
      {
        method: "POST",
        headers: authHeadersJSON(token),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Password reset failed",
        description: data?.message || "Please try again.",
      });
      return;
    }
    setGeneratedCredentials({
      email: data.user?.email || user.email,
      password: data.temporaryPassword || "",
    });
    toaster.create({ type: "success", title: "Temporary password generated" });
    await loadUsers();
    await loadAuditLogs();
  };

  const moderateMessage = async (message) => {
    const reason = window.prompt("Reason for removing this message?", "");
    if (reason === null) return;

    const res = await fetch(
      `${API_BASE}/api/messages/moderation/${message._id}`,
      {
        method: "PATCH",
        headers: authHeadersJSON(token),
        body: JSON.stringify({ reason }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toaster.create({
        type: "error",
        title: "Message not moderated",
        description: data?.message || "Please try again.",
      });
      return;
    }

    toaster.create({ type: "success", title: "Message removed" });
    await loadModerationMessages();
    await loadAuditLogs();
  };

  const moderationRows = useMemo(() => {
    const q = moderationSearch.trim().toLowerCase();
    return moderationMessages.filter((message) => {
      if (!q) return true;
      const sender = message.senderId || {};
      const receiver = message.receiverId || {};
      return [
        message.content,
        message.channel,
        sender.name,
        sender.email,
        receiver.name,
        receiver.email,
        message.groupId?.name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [moderationMessages, moderationSearch]);

  const accountRows = useMemo(() => {
    const q = accountSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((user) =>
      [
        user.name,
        user.email,
        user.department,
        roleLabel(user),
        user.suspendReason,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [accountSearch, users]);

  useEffect(() => {
    setVisibleAccountCount(LIST_PAGE_SIZE);
  }, [accountSearch, users]);

  useEffect(() => {
    setVisibleModerationCount(LIST_PAGE_SIZE);
  }, [moderationChannel, moderationSearch, moderationMessages]);

  const visibleAccountRows = accountRows.slice(0, visibleAccountCount);
  const visibleModerationRows = moderationRows.slice(0, visibleModerationCount);
  const hasMoreAccounts = visibleAccountRows.length < accountRows.length;
  const hasMoreModeration = visibleModerationRows.length < moderationRows.length;
  const filteredDepartments = DEPARTMENTS.filter((department) =>
    department.toLowerCase().includes(departmentSearch.trim().toLowerCase()),
  );

  const moderationTitle = (message) => {
    const sender = displayUser(message.senderId);
    if (message.channel === "group") {
      return `${sender} to ${message.groupId?.name || "Group chat"}`;
    }
    if (message.channel === "announcement") {
      return `${sender} to Announcement`;
    }
    return `${sender} to ${displayUser(message.receiverId)}`;
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

  return (
    <Flex
      direction="column"
      h="100%"
      minH={0}
      bg={appearance.emptyBg}
      color={appearance.text}
      overflow="hidden"
    >
      <Box
        p={{ base: 3, md: 4 }}
        borderBottom="1px solid"
        borderColor={appearance.border}
        bg={appearance.panelBg}
        flexShrink={0}
      >
        <Flex justify="space-between" align="center" gap={3} flexWrap="wrap">
          <Box>
            <Text fontSize="xl" fontWeight="bold">
              Settings
            </Text>
            <Text fontSize="sm" color={appearance.textMuted}>
              Accounts, upload policy, moderation, and audit activity.
            </Text>
          </Box>
          <Button size="sm" {...primaryButtonProps} onClick={openAddUser}>
            Add user
          </Button>
        </Flex>
      </Box>

      <Box flex="1" minH={0} overflowY="auto" p={{ base: 3, md: 4 }}>
        <Flex gap={3} mb={4} wrap="wrap">
          {[
            ["Users", users.length],
            ["Administrators", adminCount],
            ["Suspended", suspendedCount],
            [
              "Upload limit",
              typeof maxAttachmentBytes === "number" && maxAttachmentBytes > 0
                ? formatBytes(maxAttachmentBytes)
                : "-",
            ],
          ].map(([label, value]) => (
            <Box
              key={label}
              flex={{ base: "1 1 140px", md: "1 1 180px" }}
              bg={appearance.cardBg}
              borderWidth="1px"
              borderColor={appearance.border}
              borderRadius="lg"
              px={4}
              py={3}
            >
              <Text fontSize="xs" color={appearance.textMuted}>
                {label}
              </Text>
              <Text fontSize="lg" fontWeight="bold">
                {value}
              </Text>
            </Box>
          ))}
        </Flex>

        <Flex
          align="stretch"
          gap={4}
          direction={{ base: "column", "2xl": "row" }}
          minW={0}
        >
          <VStack align="stretch" gap={4} flex="0.95" w="full" minW={0}>
            <Section
              title="Account Access"
              description="Create accounts, edit roles, suspend access, or remove users."
              appearance={appearance}
              height={{ base: "auto", lg: "720px" }}
              action={
                <Button size="sm" {...primaryButtonProps} onClick={openAddUser}>
                  Add user
                </Button>
              }
            >
              <Input
                value={accountSearch}
                onChange={(e) => setAccountSearch(e.target.value)}
                placeholder="Search users, email, department, role"
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
                mb={3}
              />
              <VStack
                align="stretch"
                gap={2}
                h={{ base: "420px", md: "560px" }}
                overflowY="auto"
                pr={1}
                onScroll={(event) =>
                  loadMoreOnBottom(event, hasMoreAccounts, () =>
                    setVisibleAccountCount((count) => count + LIST_PAGE_SIZE),
                  )
                }
              >
                {visibleAccountRows.map((user) => (
                  <Flex
                    key={user._id}
                    justify="space-between"
                    align={{ base: "stretch", md: "center" }}
                    direction={{ base: "column", md: "row" }}
                    gap={3}
                    borderWidth="1px"
                    borderColor={appearance.border}
                    borderRadius="md"
                    px={3}
                    py={2.5}
                    bg={appearance.inputBg}
                  >
                    <Box minW={0}>
                      <HStack gap={2} flexWrap="wrap">
                        <Text fontWeight="semibold">{user.name}</Text>
                        {user.suspended && (
                          <Text
                            fontSize="10px"
                            fontWeight="bold"
                            color="red.400"
                            textTransform="uppercase"
                          >
                            Suspended
                          </Text>
                        )}
                      </HStack>
                      <Text fontSize="sm" color={appearance.textMuted} truncate>
                        {user.email}
                      </Text>
                      <Text fontSize="xs" color={appearance.textSubtle}>
                        {user.department || "-"} | {roleLabel(user)}
                      </Text>
                      <Text fontSize="xs" color={appearance.textSubtle}>
                        Terms:{" "}
                        {user.termsAcceptedAt
                          ? `Accepted ${new Date(user.termsAcceptedAt).toLocaleDateString()}`
                          : "Pending"}
                      </Text>
                      {user.suspendReason && (
                        <Text fontSize="xs" color="red.400" noOfLines={1}>
                          {user.suspendReason}
                        </Text>
                      )}
                    </Box>
                    <Menu.Root>
                      <Menu.Trigger asChild>
                        <IconButton
                          aria-label={`Actions for ${user.name || user.email}`}
                          size="sm"
                          variant="ghost"
                          color={appearance.text}
                          flexShrink={0}
                          _hover={{ bg: appearance.hoverBg }}
                        >
                          <MoreVertical size={18} />
                        </IconButton>
                      </Menu.Trigger>
                      <Menu.Positioner>
                        <Menu.Content fontSize="sm" minW="190px" zIndex={2600}>
                          <Menu.Item value="edit" onClick={() => startEdit(user)}>
                            <Pencil size={16} />
                            Edit
                          </Menu.Item>
                          <Menu.Item
                            value="suspend"
                            onClick={() => void toggleSuspension(user)}
                          >
                            {user.suspended ? (
                              <ShieldCheck size={16} />
                            ) : (
                              <Ban size={16} />
                            )}
                            {user.suspended ? "Restore account" : "Suspend account"}
                          </Menu.Item>
                          <Menu.Item
                            value="reset-password"
                            onClick={() => void resetUserPassword(user)}
                          >
                            <RotateCcw size={16} />
                            Reset password
                          </Menu.Item>
                          <Menu.Item
                            value="delete"
                            color="red.600"
                            onClick={() => void removeUser(user._id)}
                          >
                            <Trash2 size={16} />
                            Delete
                          </Menu.Item>
                        </Menu.Content>
                      </Menu.Positioner>
                    </Menu.Root>
                  </Flex>
                ))}
                {hasMoreAccounts && (
                  <Text color={appearance.textMuted} fontSize="xs" textAlign="center" py={2}>
                    Scroll for more users
                  </Text>
                )}
                {!accountRows.length && (
                  <Text color={appearance.textMuted} fontSize="sm" p={2}>
                    No users found.
                  </Text>
                )}
              </VStack>
            </Section>

            <Section
              title="Upload Policy"
              description="Set the maximum attachment size for everyone."
              appearance={appearance}
            >
              <HStack align="flex-end" flexWrap="wrap" gap={2}>
                <Box>
                  <Text fontSize="xs" mb={1} color={appearance.textMuted}>
                    Max size in KB
                  </Text>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    w={{ base: "130px", md: "150px" }}
                    bg={appearance.inputStrongBg}
                    borderColor={appearance.border}
                    value={attachKb}
                    onChange={(e) => setAttachKb(e.target.value)}
                  />
                </Box>
                <Button
                  size="sm"
                  {...primaryButtonProps}
                  onClick={() => void saveAttachmentLimit()}
                >
                  Save limit
                </Button>
              </HStack>
            </Section>
          </VStack>

          <VStack align="stretch" gap={4} flex="1.35" w="full" minW={0}>
            <Section
              title="Content Moderation"
              description="Review recent messages. Text search is local after decryption."
              appearance={appearance}
              height={{ base: "auto", lg: "720px" }}
              action={
                <Button
                  size="sm"
                  loading={loadingModeration}
                  {...neutralButtonProps}
                  onClick={() => void loadModerationMessages()}
                >
                  Refresh
                </Button>
              }
            >
              <HStack mb={3} gap={2} flexWrap="wrap">
                <Input
                  value={moderationSearch}
                  onChange={(e) => setModerationSearch(e.target.value)}
                  placeholder="Search messages, users, groups"
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                  flex={{ base: "1 1 220px", md: "1" }}
                />
                <Box
                  as="select"
                  value={moderationChannel}
                  onChange={(e) => setModerationChannel(e.target.value)}
                  h="40px"
                  px={2}
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor={appearance.border}
                  bg={appearance.inputStrongBg}
                  color={appearance.text}
                >
                  <option value="">All threads</option>
                  <option value="direct">Direct</option>
                  <option value="group">Group</option>
                  <option value="announcement">Announcement</option>
                </Box>
              </HStack>
              <VStack
                align="stretch"
                gap={2}
                h={{ base: "420px", md: "560px" }}
                overflowY="auto"
                pr={1}
                onScroll={(event) =>
                  loadMoreOnBottom(event, hasMoreModeration, () =>
                    setVisibleModerationCount((count) => count + LIST_PAGE_SIZE),
                  )
                }
              >
                {visibleModerationRows.map((message) => {
                  const body = moderationBody(message);
                  const longBody = isLongModerationBody(body);
                  const previewBody = longBody ? moderationPreviewBody(body) : body;
                  return (
                    <Box
                      key={message._id}
                      borderWidth="1px"
                      borderColor={appearance.border}
                      borderRadius="md"
                      px={3}
                      py={2}
                      bg={appearance.inputBg}
                    >
                      <HStack justify="space-between" align="flex-start" gap={3}>
                        <Box minW={0}>
                          <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                            {moderationTitle(message)}
                          </Text>
                          <Text fontSize="xs" color={appearance.textMuted}>
                            {message.channel || "direct"} |{" "}
                            {new Date(message.createdAt).toLocaleString()}
                          </Text>
                        </Box>
                        <Button
                          size="xs"
                          bg="#dc2626"
                          color="white"
                          flexShrink={0}
                          _hover={{ bg: "#b91c1c" }}
                          disabled={message.deleted}
                          onClick={() => void moderateMessage(message)}
                        >
                          {message.deleted ? "Removed" : "Remove"}
                        </Button>
                      </HStack>
                      <Text
                        fontSize="sm"
                        color={appearance.text}
                        whiteSpace="pre-wrap"
                        mt={2}
                      >
                        {previewBody}
                      </Text>
                      {longBody && (
                        <Button
                          size="xs"
                          variant="plain"
                          px={0}
                          mt={1}
                          color="#7c3aed"
                          onClick={() => setExpandedModerationMessage(message)}
                        >
                          See more
                        </Button>
                      )}
                      {Array.isArray(message.attachments) &&
                        message.attachments.map((file, index) => (
                          <ModerationAttachment
                            key={`${message._id}-${file?.url || index}`}
                            file={file}
                            appearance={appearance}
                          />
                        ))}
                    </Box>
                  );
                })}
                {hasMoreModeration && (
                  <Text color={appearance.textMuted} fontSize="xs" textAlign="center" py={2}>
                    Scroll for more messages
                  </Text>
                )}
                {!moderationRows.length && (
                  <Text color={appearance.textMuted} fontSize="sm" p={2}>
                    No moderation messages loaded.
                  </Text>
                )}
              </VStack>
            </Section>

            <Section
              title="Audit Log"
              description="Recent administrator actions."
              appearance={appearance}
            >
              <VStack
                align="stretch"
                gap={2}
                maxH={{ base: "none", xl: "360px" }}
                overflowY="auto"
              >
                {auditLogs.map((log) => (
                  <Box
                    key={log._id}
                    borderWidth="1px"
                    borderColor={appearance.border}
                    borderRadius="md"
                    px={3}
                    py={2}
                    bg={appearance.inputBg}
                  >
                    <Text fontSize="sm" fontWeight="semibold">
                      {log.action}
                    </Text>
                    <Text fontSize="xs" color={appearance.textMuted}>
                      {log.actorName || "Unknown"} |{" "}
                      {new Date(log.createdAt).toLocaleString()}
                    </Text>
                    <Text fontSize="xs" color={appearance.textSubtle}>
                      {log.targetName || log.targetId || log.targetType || "-"}
                    </Text>
                  </Box>
                ))}
                {!auditLogs.length && (
                  <Text color={appearance.textMuted} fontSize="sm">
                    No audit records yet.
                  </Text>
                )}
              </VStack>
            </Section>
          </VStack>
        </Flex>

        <Text
          mt={6}
          pt={4}
          borderTopWidth="1px"
          borderColor={appearance.border}
          textAlign="center"
          fontSize="xs"
          color={appearance.textSubtle}
        >
          Copyright 2026 RoadJim. All rights reserved.
        </Text>
      </Box>

      {showUserModal && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2500}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={closeUserModal}
        >
          <Box
            as="form"
            onSubmit={saveUser}
            w="full"
            maxW="460px"
            bg={appearance.modalBg}
            color={appearance.text}
            borderRadius="lg"
            boxShadow="2xl"
            overflow="hidden"
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
              <Box>
                <Text fontWeight="semibold">
                  {editingUserId ? "Edit user" : "Add user"}
                </Text>
                <Text fontSize="xs" color={appearance.textMuted}>
                  {editingUserId
                    ? "Update account details."
                    : "Create a new account."}
                </Text>
              </Box>
              <Button
                size="sm"
                variant="ghost"
                {...ghostButtonProps}
                onClick={closeUserModal}
              >
                Close
              </Button>
            </Flex>
            <VStack align="stretch" gap={3} p={4}>
              <Input
                placeholder="Name"
                value={form.name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, name: e.target.value }))
                }
                required
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
              />
              <Input
                type="email"
                placeholder="Email"
                value={form.email}
                onChange={(e) =>
                  setForm((s) => ({ ...s, email: e.target.value }))
                }
                required
                bg={appearance.inputStrongBg}
                borderColor={appearance.border}
              />
              <Box position="relative">
                <Input
                  placeholder="Search department"
                  value={showDepartmentOptions ? departmentSearch : form.department}
                  onFocus={() => {
                    setDepartmentSearch(form.department || "");
                    setShowDepartmentOptions(true);
                  }}
                  onChange={(e) => {
                    setDepartmentSearch(e.target.value);
                    setForm((s) => ({ ...s, department: e.target.value }));
                    setShowDepartmentOptions(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setShowDepartmentOptions(false), 120);
                  }}
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                />
                {showDepartmentOptions && (
                  <Box
                    position="absolute"
                    zIndex={2700}
                    top="calc(100% + 4px)"
                    left={0}
                    right={0}
                    maxH="220px"
                    overflowY="auto"
                    bg={appearance.modalBg}
                    borderWidth="1px"
                    borderColor={appearance.border}
                    borderRadius="md"
                    boxShadow="lg"
                  >
                    {filteredDepartments.map((department) => (
                      <Button
                        key={department}
                        type="button"
                        variant="ghost"
                        justifyContent="flex-start"
                        w="full"
                        borderRadius={0}
                        color={appearance.text}
                        _hover={{ bg: appearance.hoverBg }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setForm((s) => ({ ...s, department }));
                          setDepartmentSearch(department);
                          setShowDepartmentOptions(false);
                        }}
                      >
                        {department}
                      </Button>
                    ))}
                    {!filteredDepartments.length && (
                      <Text color={appearance.textMuted} fontSize="sm" p={3}>
                        No department found
                      </Text>
                    )}
                  </Box>
                )}
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={2}>
                  Roles
                </Text>
                <VStack align="stretch" gap={2}>
                  {USER_ROLES.map((role) => {
                    const checked = form.roles.includes(role);
                    return (
                      <HStack key={role} gap={2}>
                        <Box
                          as="input"
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setForm((s) => {
                              const current = Array.isArray(s.roles) ? s.roles : [];
                              const next = e.target.checked
                                ? [...new Set([...current, role])]
                                : current.filter((item) => item !== role);
                              return { ...s, roles: next.length ? next : ["User"] };
                            });
                          }}
                          w="16px"
                          h="16px"
                          accentColor="#7c3aed"
                        />
                        <Text fontSize="sm">{role}</Text>
                      </HStack>
                    );
                  })}
                </VStack>
              </Box>
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
                onClick={closeUserModal}
              >
                Cancel
              </Button>
              <Button type="submit" {...primaryButtonProps}>
                {editingUserId ? "Save changes" : "Add user"}
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
      {expandedModerationMessage && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2540}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setExpandedModerationMessage(null)}
        >
          <Box
            w="full"
            maxW="720px"
            maxH="86vh"
            bg={appearance.modalBg}
            color={appearance.text}
            borderRadius="lg"
            boxShadow="2xl"
            overflow="hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <Flex
              px={4}
              py={3}
              borderBottomWidth="1px"
              borderColor={appearance.border}
              justify="space-between"
              align="center"
              gap={3}
            >
              <Box minW={0}>
                <Text fontWeight="semibold" noOfLines={1}>
                  {moderationTitle(expandedModerationMessage)}
                </Text>
                <Text fontSize="xs" color={appearance.textMuted}>
                  {expandedModerationMessage.channel || "direct"} |{" "}
                  {new Date(expandedModerationMessage.createdAt).toLocaleString()}
                </Text>
              </Box>
              <Button
                size="sm"
                variant="ghost"
                {...ghostButtonProps}
                onClick={() => setExpandedModerationMessage(null)}
              >
                Close
              </Button>
            </Flex>
            <Box p={4} maxH="70vh" overflowY="auto">
              <Text fontSize="sm" whiteSpace="pre-wrap">
                {moderationBody(expandedModerationMessage)}
              </Text>
              {Array.isArray(expandedModerationMessage.attachments) &&
                expandedModerationMessage.attachments.map((file, index) => (
                  <ModerationAttachment
                    key={`${expandedModerationMessage._id}-${file?.url || index}`}
                    file={file}
                    appearance={appearance}
                  />
                ))}
            </Box>
          </Box>
        </Box>
      )}
      {generatedCredentials && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2550}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => setGeneratedCredentials(null)}
        >
          <Box
            w="full"
            maxW="430px"
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
              <Text fontWeight="semibold">Temporary Password</Text>
              <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                Share this with the user. They must change it on first login.
              </Text>
            </Box>
            <VStack align="stretch" gap={3} p={4}>
              <Box
                p={3}
                bg={appearance.inputBg}
                borderRadius="md"
                borderWidth="1px"
                borderColor={appearance.border}
              >
                <Text fontSize="xs" color={appearance.textMuted}>
                  Email
                </Text>
                <Text fontWeight="semibold">{generatedCredentials.email}</Text>
                <Text fontSize="xs" color={appearance.textMuted} mt={3}>
                  Generated password
                </Text>
                <Text fontFamily="mono" fontSize="lg" fontWeight="bold">
                  {generatedCredentials.password}
                </Text>
              </Box>
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
                onClick={() => setGeneratedCredentials(null)}
              >
                Close
              </Button>
              <Button
                {...primaryButtonProps}
                onClick={() => void copyCredentials()}
              >
                Copy Email & Password
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </Flex>
  );
}
