import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { Box, Button, HStack, Input, Text, VStack } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import ChatLayout from "./layouts/ChatLayout";
import TicketsWorkspace from "./components/TicketsWorkspace";
import LoginForm, {
  clearChatSession,
  loadChatSession,
  saveChatSession,
} from "./components/LoginForm";
import { AppToaster } from "./toaster";
import {
  APPEARANCE_MODES,
  loadAppearanceMode,
  saveAppearanceMode,
} from "./settings/appearance";
import { API_BASE, authHeadersJSON } from "./services/api";
import { toaster } from "./toaster";

function ForcePasswordChangeModal({ session, appearance, onChanged }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toaster.create({ type: "error", title: "Password must be at least 8 characters" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toaster.create({ type: "error", title: "Passwords do not match" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/me/password`, {
        method: "PATCH",
        headers: authHeadersJSON(session.token),
        body: JSON.stringify({ currentPassword, newPassword }),
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
      onChanged(data);
      toaster.create({ type: "success", title: "Password changed" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box position="fixed" inset={0} zIndex={3000} bg={appearance.modalOverlay} display="flex" alignItems="center" justifyContent="center" p={4}>
      <Box as="form" onSubmit={submit} w="full" maxW="420px" bg={appearance.modalBg} color={appearance.text} borderRadius="lg" boxShadow="2xl" overflow="hidden">
        <Box p={4} borderBottomWidth="1px" borderColor={appearance.border}>
          <Text fontWeight="semibold">Change your password</Text>
          <Text fontSize="sm" color={appearance.textMuted} mt={1}>
            Your account is using a temporary password.
          </Text>
        </Box>
        <VStack align="stretch" gap={3} p={4}>
          <Input type="password" placeholder="Temporary password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} bg={appearance.inputStrongBg} borderColor={appearance.border} required />
          <Input type="password" placeholder="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} bg={appearance.inputStrongBg} borderColor={appearance.border} required />
          <Input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} bg={appearance.inputStrongBg} borderColor={appearance.border} required />
        </VStack>
        <Box p={3} borderTopWidth="1px" borderColor={appearance.border} textAlign="right">
          <Button type="submit" bg="#7c3aed" color="white" _hover={{ bg: "#6d28d9" }} loading={saving}>
            Save password
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

function TermsAndPrivacyModal({ session, appearance, onAgree, onDecline }) {
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!agreed) {
      toaster.create({ type: "error", title: "Please select I Agree to continue" });
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/me/terms`, {
        method: "PATCH",
        headers: authHeadersJSON(session.token),
        body: JSON.stringify({ agreed: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Could not save agreement",
          description: data?.message || "Please try again.",
        });
        return;
      }
      onAgree(data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={3100}
      bg={appearance.modalOverlay}
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={4}
    >
      <Box
        as="form"
        onSubmit={submit}
        w="full"
        maxW="560px"
        maxH="calc(100vh - 32px)"
        bg={appearance.modalBg}
        color={appearance.text}
        borderRadius="lg"
        boxShadow="2xl"
        overflow="hidden"
        display="flex"
        flexDirection="column"
      >
        <Box p={4} borderBottomWidth="1px" borderColor={appearance.border}>
          <Text fontWeight="semibold">Privacy Policy and Terms & Conditions</Text>
          <Text fontSize="sm" color={appearance.textMuted} mt={1}>
            Please review and accept before using Huni.
          </Text>
        </Box>

        <VStack align="stretch" gap={4} p={4} overflowY="auto">
          <Box>
            <Text fontWeight="semibold" mb={1}>
              Privacy Policy
            </Text>
            <Text fontSize="sm" color={appearance.textMuted} lineHeight="1.55">
              Huni stores your account profile, messages, attachments, activity
              status, and administrator actions needed to operate this internal
              workspace. Your conversations and attachments are used only for
              communication, support, security, moderation, and audit purposes
              within this project.
            </Text>
          </Box>

          <Box>
            <Text fontWeight="semibold" mb={1}>
              Terms & Conditions
            </Text>
            <Text fontSize="sm" color={appearance.textMuted} lineHeight="1.55">
              Use Huni for authorized work communication only. Do not share
              another person&apos;s account, upload harmful content, abuse other
              users, or attempt to bypass security and moderation controls.
              Administrators may manage accounts, upload limits, announcements,
              and moderated content when required.
            </Text>
          </Box>

          <Box>
            <Text fontWeight="semibold" mb={1}>
              Agreement Tracking
            </Text>
            <Text fontSize="sm" color={appearance.textMuted} lineHeight="1.55">
              When you accept, Huni records your agreement date and policy
              version so this prompt will not appear again for your account.
            </Text>
          </Box>

          <HStack
            as="label"
            gap={3}
            cursor="pointer"
            p={3}
            borderWidth="1px"
            borderColor={appearance.border}
            borderRadius="md"
            bg={appearance.inputBg}
          >
            <Box
              as="input"
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              w="18px"
              h="18px"
              accentColor="#7c3aed"
            />
            <Text fontSize="sm" fontWeight="semibold">
              I Agree to the Privacy Policy and Terms & Conditions
            </Text>
          </HStack>
        </VStack>

        <HStack
          justify="flex-end"
          gap={2}
          p={3}
          borderTopWidth="1px"
          borderColor={appearance.border}
        >
          <Button
            type="button"
            color={appearance.text}
            bg={appearance.inputStrongBg}
            borderColor={appearance.border}
            _hover={{ bg: appearance.hoverBg }}
            onClick={onDecline}
          >
            Do Not Agree
          </Button>
          <Button
            type="submit"
            bg="#7c3aed"
            color="white"
            _hover={{ bg: "#6d28d9" }}
            loading={saving}
          >
            Continue
          </Button>
        </HStack>
      </Box>
    </Box>
  );
}

export default function App() {
  const [session, setSession] = useState(() => loadChatSession());
  const [appearanceMode, setAppearanceMode] = useState(() =>
    loadAppearanceMode()
  );
  const appearance = APPEARANCE_MODES[appearanceMode] || APPEARANCE_MODES.light;

  const toggleAppearanceMode = () => {
    setAppearanceMode((mode) => {
      const next = mode === "dark" ? "light" : "dark";
      saveAppearanceMode(next);
      return next;
    });
  };

  const handleLogout = () => {
    clearChatSession();
    setSession(null);
  };

  useEffect(() => {
    if (!session) document.title = "Huni";
  }, [session]);

  const handleProfileUpdated = (user) => {
    setSession((s) => {
      if (!s) return s;
      const next = { ...s, user };
      saveChatSession(next);
      return next;
    });
  };

  const shell = (children) => (
    <ChakraProvider value={defaultSystem}>
      <AppToaster />
      {children}
    </ChakraProvider>
  );

  if (!session) {
    return shell(
      <LoginForm
        onSuccess={setSession}
        appearance={appearance}
        onToggleAppearance={toggleAppearanceMode}
      />
    );
  }

  const path = window.location.pathname || "";
  if (path === "/tickets") {
    const params = new URLSearchParams(window.location.search);
    return shell(
      <TicketsWorkspace
        token={session.token}
        appearance={appearance}
        userId={session.user._id}
        organizationId={params.get("organizationId") || ""}
        initialTab={params.get("tab") || "organization"}
      />
    );
  }

  return shell(
    <>
      <ChatLayout
        userId={session.user._id}
        token={session.token}
        user={session.user}
        onLogout={handleLogout}
        onProfileUpdated={handleProfileUpdated}
        appearance={appearance}
        onToggleAppearance={toggleAppearanceMode}
      />
      {!session.user?.termsAcceptedAt && (
        <TermsAndPrivacyModal
          session={session}
          appearance={appearance}
          onAgree={handleProfileUpdated}
          onDecline={handleLogout}
        />
      )}
      {session.user?.termsAcceptedAt && session.user?.mustChangePassword && (
        <ForcePasswordChangeModal
          session={session}
          appearance={appearance}
          onChanged={handleProfileUpdated}
        />
      )}
    </>
  );
}
