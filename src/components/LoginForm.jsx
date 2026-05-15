import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Image,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from "lucide-react";
import { useState } from "react";
import { API_BASE, authHeadersJSON } from "../services/api";
import huniLogo from "../assets/huni-logo.png";

const SESSION_KEY = "chatSession";
const REMEMBER_KEY = "chatRememberSession";

function isDesktopApp() {
  return Boolean(window.huniDesktop);
}

export function loadChatSession() {
  try {
    const raw =
      localStorage.getItem(REMEMBER_KEY) || sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveChatSession(session, remember = false) {
  const value = JSON.stringify(session);
  if (remember || isDesktopApp()) {
    localStorage.setItem(REMEMBER_KEY, value);
    sessionStorage.removeItem(SESSION_KEY);
  } else {
    sessionStorage.setItem(SESSION_KEY, value);
    localStorage.removeItem(REMEMBER_KEY);
  }
}

export function clearChatSession() {
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(REMEMBER_KEY);
}

export default function LoginForm({ onSuccess, appearance, onToggleAppearance }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    try {
      return Boolean(localStorage.getItem(REMEMBER_KEY));
    } catch {
      return false;
    }
  });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: authHeadersJSON(),
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Login failed");
        return;
      }
      const session = { token: data.token, user: data.user };
      saveChatSession(session, rememberMe);
      onSuccess(session);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex
      minH="100vh"
      bg={appearance.heroBg}
      color={appearance.text}
      align="center"
      justify="center"
      px={{ base: 5, md: 8, xl: 14 }}
      py={{ base: 6, lg: 12 }}
    >
      <IconButton
        aria-label={`Switch to ${appearance.id === "dark" ? "light" : "dark"} mode`}
        position="fixed"
        top={{ base: 3, md: 5 }}
        right={{ base: 3, md: 5 }}
        zIndex={2}
        borderRadius="full"
        bg={appearance.cardBg}
        color={appearance.text}
        borderWidth="1px"
        borderColor={appearance.border}
        _hover={{ bg: appearance.hoverBg }}
        onClick={onToggleAppearance}
      >
        {appearance.id === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </IconButton>
      <Flex
        w="full"
        maxW="1180px"
        align="center"
        justify="space-between"
        gap={{ base: 6, lg: 14 }}
        direction={{ base: "column", lg: "row" }}
      >
        <Box
          as="form"
          onSubmit={submit}
          w="full"
          maxW={{ base: "420px", lg: "360px" }}
          flexShrink={0}
        >
          <VStack align="stretch" gap={7}>
            <Box>
              <Text
                as="h1"
                fontSize={{ base: "3xl", md: "4xl" }}
                lineHeight="1"
                fontWeight="800"
                letterSpacing="0"
                color={appearance.text}
                textTransform="lowercase"
              >
                sign in
              </Text>
              <Text mt={3} fontSize="md" color={appearance.textMuted} lineHeight="1.45">
                Enter your email or username and password to continue
              </Text>
            </Box>

            <VStack align="stretch" gap={4}>
              <Box>
                <Text fontWeight="semibold" mb={2}>
                  Email or Username{" "}
                  <Text as="span" color="#7c3aed">
                    *
                  </Text>
                </Text>
                <HStack
                  gap={3}
                  h="46px"
                  px={3}
                  borderWidth="1px"
                  borderColor={error ? "red.400" : "purple.300"}
                  bg={appearance.inputStrongBg}
                  borderRadius="md"
                  boxShadow="0 0 0 3px rgba(124,58,237,0.08)"
                  _focusWithin={{
                    borderColor: "#7c3aed",
                    boxShadow: "0 0 0 3px rgba(124,58,237,0.16)",
                  }}
                >
                  <UserRound size={18} color={appearance.textSubtle} />
                  <Input
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    border="0"
                    p={0}
                    h="full"
                    color={appearance.text}
                    _focus={{ boxShadow: "none", outline: "none" }}
                  />
                </HStack>
              </Box>

              <Box>
                <Text fontWeight="semibold" mb={2}>
                  Password{" "}
                  <Text as="span" color="#7c3aed">
                    *
                  </Text>
                </Text>
                <HStack
                  gap={3}
                  h="46px"
                  px={3}
                  borderWidth="1px"
                  borderColor="transparent"
                  bg={appearance.inputBg}
                  borderRadius="md"
                  _focusWithin={{
                    bg: appearance.inputStrongBg,
                    borderColor: "#7c3aed",
                    boxShadow: "0 0 0 3px rgba(124,58,237,0.14)",
                  }}
                >
                  <LockKeyhole size={18} color={appearance.textSubtle} />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    border="0"
                    p={0}
                    h="full"
                    color={appearance.text}
                    _focus={{ boxShadow: "none", outline: "none" }}
                  />
                  <IconButton
                    type="button"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    size="xs"
                    variant="ghost"
                    color={appearance.textMuted}
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </IconButton>
                </HStack>
              </Box>

              <Flex justify="space-between" align="center" gap={3}>
                <HStack gap={2}>
                  <Box
                    as="input"
                    type="checkbox"
                    w="18px"
                    h="18px"
                    accentColor="#7c3aed"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <Text fontSize="sm" color={appearance.textMuted}>
                    Remember me
                  </Text>
                </HStack>
                {/* <Button
                  type="button"
                  variant="plain"
                  size="sm"
                  px={0}
                  color="#6d28d9"
                >
                  Forgot Password
                </Button> */}
              </Flex>

              {error && (
                <Text color="red.500" fontSize="sm">
                  {error}
                </Text>
              )}

              <Button
                type="submit"
                h="52px"
                borderRadius="md"
                bg="#7c3aed"
                color="white"
                fontWeight="700"
                loading={loading}
                _hover={{ bg: "#6d28d9" }}
                _active={{ bg: "#5b21b6" }}
              >
                Sign In
              </Button>

              <Text textAlign="center" fontSize="sm" color={appearance.textSubtle}>
                Don&apos;t have an account?{" "}
                <Text as="span" color="#6d28d9" fontWeight="semibold">
                  Ask an admin.
                </Text>
              </Text>
            </VStack>
          </VStack>
        </Box>

        <Flex
          flex="1"
          minH={{ base: "260px", sm: "320px", md: "460px", xl: "520px" }}
          w="full"
          borderRadius="2xl"
          overflow="hidden"
          position="relative"
          align="center"
          px={{ base: 6, md: 12 }}
          py={{ base: 8, md: 14 }}
          color="white"
          bg="#4c1d95"
          boxShadow="0 28px 70px rgba(64, 28, 115, 0.28)"
          _before={{
            content: '""',
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(135deg, rgba(76,29,149,0.94), rgba(91,33,182,0.84)), repeating-radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18) 0 1px, transparent 1px 18px)",
          }}
          _after={{
            content: '""',
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.10) 42%, transparent 76%)",
          }}
        >
          <Box position="relative" zIndex={1} maxW="520px">
            <HStack gap={4} align="center">
              <Image
                src={huniLogo}
                alt="Huni logo"
                w={{ base: "52px", md: "74px" }}
                h={{ base: "52px", md: "74px" }}
                objectFit="cover"
                borderRadius="2xl"
                bg="whiteAlpha.200"
                boxShadow="0 12px 30px rgba(0,0,0,0.22)"
              />
              <Text
                fontSize={{ base: "3xl", md: "5xl" }}
                lineHeight="1"
                fontWeight="700"
                letterSpacing="0"
              >
                Huni
              </Text>
            </HStack>

            <Text
              mt={{ base: 5, md: 7 }}
              fontSize={{ base: "md", md: "xl" }}
              lineHeight="1.45"
              color="whiteAlpha.900"
              maxW="560px"
            >
              Huni helps your team stay connected, share updates, and keep
              every conversation moving in one secure workspace.
            </Text>
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
}
