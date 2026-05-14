import { Flex, Box } from "@chakra-ui/react";
import Sidebar from "../components/Sidebar";
import ChatWindow from "../components/ChatWindow";
import { useMemo, useState } from "react";
import { ChatProvider } from "../context/ChatContext";
import { organizationThreadId, pickId } from "../utils/messageUtils";
import { withAppearanceChatTheme } from "../settings/appearance";

const CHAT_THEME_STORAGE_KEY = "chatThemes";

const CHAT_THEMES = {
  purple: {
    id: "purple",
    name: "Purple",
    swatch: "#7c3aed",
    accent: "#7c3aed",
    accentHover: "#6d28d9",
    soft: "#ede9fe",
    headerBg: "rgba(250,245,255,0.92)",
    inputBg: "#faf5ff",
    listBg: "#f5f0ff",
    windowBg: "linear-gradient(135deg, #f6f0ff 0%, #ede9fe 100%)",
  },
  blue: {
    id: "blue",
    name: "Blue",
    swatch: "#2563eb",
    accent: "#2563eb",
    accentHover: "#1d4ed8",
    soft: "#dbeafe",
    headerBg: "rgba(239,246,255,0.92)",
    inputBg: "#eff6ff",
    listBg: "#f0f7ff",
    windowBg: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
  },
  green: {
    id: "green",
    name: "Green",
    swatch: "#059669",
    accent: "#059669",
    accentHover: "#047857",
    soft: "#d1fae5",
    headerBg: "rgba(236,253,245,0.92)",
    inputBg: "#ecfdf5",
    listBg: "#effaf5",
    windowBg: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)",
  },
  rose: {
    id: "rose",
    name: "Rose",
    swatch: "#e11d48",
    accent: "#e11d48",
    accentHover: "#be123c",
    soft: "#ffe4e6",
    headerBg: "rgba(255,241,242,0.92)",
    inputBg: "#fff1f2",
    listBg: "#fff6f7",
    windowBg: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)",
  },
  amber: {
    id: "amber",
    name: "Amber",
    swatch: "#d97706",
    accent: "#d97706",
    accentHover: "#b45309",
    soft: "#fef3c7",
    headerBg: "rgba(255,251,235,0.92)",
    inputBg: "#fffbeb",
    listBg: "#fff8e6",
    windowBg: "linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)",
  },
};

function loadChatThemes() {
  try {
    const raw = localStorage.getItem(CHAT_THEME_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function ChatLayout({
  userId,
  token,
  user,
  onLogout,
  onProfileUpdated,
  appearance,
  onToggleAppearance,
}) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [activeView, setActiveView] = useState("chat");
  const [groupsVersion, setGroupsVersion] = useState(0);
  const [chatThemeByPeer, setChatThemeByPeer] = useState(() => loadChatThemes());
  const [pendingThreadId, setPendingThreadId] = useState("");

  const handleSelectUser = (peer) => {
    setSelectedUser(peer);
    setActiveView("chat");
    setPendingThreadId("");
  };

  const handleBackToList = () => {
    setSelectedUser(null);
    setActiveView("chat");
  };

  const selectedPeerId = selectedUser ? pickId(selectedUser) || "" : "";
  const selectedThemeId = chatThemeByPeer[selectedPeerId] || "purple";
  const selectedTheme = withAppearanceChatTheme(
    CHAT_THEMES[selectedThemeId] || CHAT_THEMES.purple,
    appearance
  );

  const setSelectedThemeId = (themeId) => {
    if (!selectedPeerId || !CHAT_THEMES[themeId]) return;
    setChatThemeByPeer((prev) => {
      const next = { ...prev, [selectedPeerId]: themeId };
      localStorage.setItem(CHAT_THEME_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const handleGroupUpdated = (group) => {
    setGroupsVersion((value) => value + 1);
    if (!group) {
      setSelectedUser(null);
      return;
    }
    if (group.members?.some((member) => member?.role)) {
      setSelectedUser({
        _id: organizationThreadId(group),
        organizationId: pickId(group),
        name: group.name,
        avatarUrl: group.avatarUrl,
        members: group.members || [],
        subjects: group.subjects || [],
        createdBy: group.createdBy,
        isMember: group.isMember ?? true,
        isOrganization: true,
      });
      return;
    }
    setSelectedUser({
      _id: `group:${pickId(group)}`,
      groupId: pickId(group),
      name: group.name,
      avatarUrl: group.avatarUrl,
      members: group.members || [],
      createdBy: group.createdBy,
      isGroup: true,
    });
  };

  const themeOptions = useMemo(() => Object.values(CHAT_THEMES), []);

  return (
    <ChatProvider
      userId={userId}
      token={token}
      activePeerId={
        selectedUser ? pickId(selectedUser) || null : null
      }
      onNotificationOpen={(threadId) => {
        setPendingThreadId(String(threadId || ""));
        setActiveView("chat");
      }}
    >
      <Flex h="100dvh" minH={0} overflow="hidden" bg={appearance.shellBg}>
        <Box
          w={{ base: "100%", md: "350px" }}
          maxW={{ base: "none", md: "350px" }}
          display={{
            base: selectedUser || activeView === "admin" ? "none" : "block",
            md: "block",
          }}
          borderRight="1px solid"
          borderColor={appearance.borderStrong}
          overflow="hidden"
          bg={appearance.panelMutedBg}
          flexShrink={0}
        >
          <Sidebar
            currentUser={user}
            selectedUser={selectedUser}
            onSelectUser={handleSelectUser}
            onLogout={onLogout}
            onProfileUpdated={onProfileUpdated}
            groupsVersion={groupsVersion}
            pendingThreadId={pendingThreadId}
            appearance={appearance}
            onToggleAppearance={onToggleAppearance}
            activeView={activeView}
            onBackToChats={handleBackToList}
            onOpenUserManagement={() => {
              setSelectedUser(null);
              setActiveView("admin");
            }}
          />
        </Box>

        <Box
          flex="1"
          minW={0}
          display={{
            base: selectedUser || activeView === "admin" ? "block" : "none",
            md: "block",
          }}
          bg={appearance.chatFallbackBg}
        >
          <ChatWindow
            userId={userId}
            receiver={selectedUser}
            mode={activeView}
            currentUser={user}
            token={token}
            chatTheme={selectedTheme}
            themeOptions={themeOptions}
            onThemeChange={setSelectedThemeId}
            onGroupUpdated={handleGroupUpdated}
            onBack={handleBackToList}
            appearance={appearance}
          />
        </Box>
      </Flex>
    </ChatProvider>
  );
}
