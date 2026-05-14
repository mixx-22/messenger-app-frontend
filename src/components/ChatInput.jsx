import {
  Flex,
  Textarea,
  IconButton,
  Box,
  Text,
  Button,
  HStack,
  VStack,
} from "@chakra-ui/react";
import { FileText, Image, Paperclip, Smile } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useChat } from "../context/ChatContext";
import { API_BASE, authHeadersJSON } from "../services/api";
import { pickId } from "../utils/messageUtils";
import { toaster } from "../toaster";
import { compressAttachmentFile } from "../utils/localMediaCompression";
import { encryptMessageContent } from "../utils/localMessageEncryption";
import { resolveUploadUrl } from "../utils/mediaUrl";

const EMOJI_OPTIONS = [
  "😀",
  "😂",
  "😍",
  "😮",
  "😢",
  "😡",
  "👍",
  "👏",
  "🙏",
  "❤️",
  "🔥",
  "🎉",
];

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

function formatLimitKb(bytes) {
  const kb = Number(bytes) / 1024;
  if (!Number.isFinite(kb) || kb <= 0) return "";
  return `${Math.max(1, Math.round(kb))} KB`;
}

export default function ChatInput({
  userId,
  receiver,
  replyTo,
  setReplyTo,
  chatTheme,
  appearance,
  readOnly = false,
  readOnlyMessage = "Announcements are read-only.",
  droppedFilesBatch = null,
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [attachmentMode, setAttachmentMode] = useState("file");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const replyImage = replyPhoto(replyTo);
  const replyImageUrl = resolveUploadUrl(replyImage?.url || replyImage?.thumbnailUrl);

  const {
    socket,
    token,
    appendLocalMessage,
    patchLocalMessage,
    maxAttachmentBytes,
  } = useChat();
  const attachmentLimitLabel = formatLimitKb(maxAttachmentBytes);
  const attachmentLimitMessage = attachmentLimitLabel
    ? `The maximum attachment file size is ${attachmentLimitLabel} per file.`
    : "The attachment is larger than the configured limit.";

  const fileRef = useRef(null);
  const inputRef = useRef(null);
  const processedDropIdRef = useRef(null);

  /* typing throttle */
  const typingRef = useRef(0);

  const emitTyping = () => {
    const peerId = receiver ? pickId(receiver) : "";
    if (!peerId || !socket) return;

    const now = Date.now();
    if (now - typingRef.current > 800) {
      socket.emit("typing", { senderId: userId, receiverId: peerId });
      typingRef.current = now;
    }
  };

  const sendMessage = async () => {
    const receiverId = pickId(receiver);
    const isAnnouncement = receiver?.isAnnouncement === true;
    const isGroup = receiver?.isGroup === true;
    const isOrganization = receiver?.isOrganization === true;
    const groupId = pickId(receiver?.groupId);
    const organizationId = pickId(receiver?.organizationId);
    if (!receiverId) return;
    if (readOnly) return;

    const trimmed = text.trim();

    if (!trimmed && !files.length) return;

    let attachments = [];

    if (files.length) {
      try {
        setUploadProgress(1);
        attachments = await Promise.all(
          files.map((item, index) =>
            uploadFile(item, (progress) => {
              const completed = index / files.length;
              const partial = progress / files.length;
              setUploadProgress(Math.round((completed + partial) * 100));
            }),
          ),
        );
        setUploadProgress(100);
      } catch (err) {
        setFiles([]);
        setUploadProgress(0);
        if (fileRef.current) fileRef.current.value = "";
        toaster.create({
          type: "error",
          title: "Attachment removed",
          description:
            err?.isSizeLimit || /large|size|limit/i.test(err?.message || "")
              ? attachmentLimitMessage
              : err?.message || "File upload failed.",
          duration: 4500,
          closable: true,
        });
        return;
      }
    }

    const encryptedContent = await encryptMessageContent(trimmed);

    const body = {
      ...(!isAnnouncement && !isGroup && !isOrganization ? { receiverId } : {}),
      content: encryptedContent,
      attachments,
      replyTo: !isAnnouncement && !isOrganization && replyTo ? pickId(replyTo) : null,
    };

    const clientId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const replyPreview =
      !isAnnouncement && replyTo && pickId(replyTo)
        ? {
            _id: pickId(replyTo),
            content: typeof replyTo.content === "string" ? replyTo.content : "",
            senderId: pickId(replyTo.senderId),
            senderName: replyTo.senderName || "",
            attachments: Array.isArray(replyTo.attachments)
              ? replyTo.attachments
              : [],
          }
        : null;

    appendLocalMessage(receiverId, {
      _id: clientId,
      clientId,
      senderId: userId,
      receiverId: isAnnouncement || isGroup || isOrganization ? null : receiverId,
      groupId: isGroup ? groupId : null,
      organizationId: isOrganization ? organizationId : null,
      channel: isAnnouncement
        ? "announcement"
        : isGroup
          ? "group"
          : isOrganization
            ? "organization"
            : "direct",
      content: trimmed,
      attachments,
      replyTo: isAnnouncement ? null : replyPreview,
      createdAt: new Date().toISOString(),
      pending: true,
    });

    const messageUrl = isOrganization
      ? `${API_BASE}/api/organizations/${organizationId}/messages`
      : `${API_BASE}/api/messages${
          isAnnouncement ? "/announcements" : isGroup ? `/groups/${groupId}` : ""
        }`;

    const res = await fetch(
      messageUrl,
      {
        method: "POST",
        headers: authHeadersJSON(token),
        body: JSON.stringify({ ...body, clientId }),
      },
    );

    const data = await res.json();
    if (!res.ok) {
      patchLocalMessage(receiverId, clientId, {
        pending: false,
        failed: true,
      });
      toaster.create({
        type: "error",
        title: "Message not sent",
        description: data?.message || "Please try again.",
        duration: 3500,
        closable: true,
      });
      return;
    }

    const hydratedData = replyPreview
      ? {
          ...data,
          content: trimmed,
          clientId,
          pending: false,
          replyTo: replyPreview,
        }
      : { ...data, content: trimmed, clientId, pending: false };

    // Debug: verify the locally-appended message actually contains replyTo
    // (helps track cases where backend/socket response is missing it).
    if (import.meta.env?.DEV) {
      console.debug("[ChatInput] replyTo state:", replyTo);
      console.debug("[ChatInput] api replyTo:", data?.replyTo);
      console.debug("[ChatInput] hydrated replyTo:", hydratedData?.replyTo);
    }

    if (res.ok) {
      appendLocalMessage(receiverId, hydratedData);
    }

    setText("");
    if (inputRef.current) inputRef.current.style.height = "40px";
    setFiles([]);
    setUploadProgress(0);
    setShowEmojiPicker(false);
    setReplyTo(null);
  };

  const uploadFile = async (item, onProgress) => {
    onProgress(0.05);
    const sourceFile = item.file || item;
    const mode = item.mode || "file";
    const uploadItem =
      mode === "photo" ? await compressAttachmentFile(sourceFile) : sourceFile;
    onProgress(0.15);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append("file", uploadItem);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(0.15 + (event.loaded / event.total) * 0.85);
        }
      };
      xhr.onload = () => {
        const data = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            ...data,
            type:
              mode === "photo" && data.type === "image"
                ? "image"
                : data.type === "pdf"
                  ? "pdf"
                  : "other",
          });
        } else {
          const error = new Error(data?.message || "Upload failed");
          error.isSizeLimit =
            xhr.status === 413 ||
            /large|size|limit/i.test(data?.message || "");
          reject(error);
        }
      };
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.open("POST", `${API_BASE}/api/upload`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(form);
    });
  };

  const addFiles = useCallback(
    (list, mode = attachmentMode) => {
      const next = Array.from(list || []);
      if (next.length) {
        const limit =
          typeof maxAttachmentBytes === "number" && maxAttachmentBytes > 0
            ? maxAttachmentBytes
            : null;
        const allowed = limit
          ? next.filter((file) => (file?.size || 0) <= limit)
          : next;
        const rejected = limit
          ? next.filter((file) => (file?.size || 0) > limit)
          : [];

        if (rejected.length) {
          const rejectedNames = rejected
            .map((file) => file?.name || "This file")
            .join(", ");
          toaster.create({
            type: "error",
            title: "File exceeds maximum size",
            description: `${rejectedNames} exceed${
              rejected.length === 1 ? "s" : ""
            } the maximum attachment file size. ${attachmentLimitMessage}`,
            duration: 4500,
            closable: true,
          });
        }

        if (!allowed.length) {
          setFiles([]);
          setUploadProgress(0);
          if (fileRef.current) fileRef.current.value = "";
          return;
        }

        setFiles((current) => [
          ...current,
          ...allowed.map((file) => ({
            file,
            mode:
              mode === "auto"
                ? file.type?.startsWith("image/")
                  ? "photo"
                  : "file"
                : mode,
          })),
        ]);
      }
    },
    [attachmentLimitMessage, attachmentMode, maxAttachmentBytes],
  );

  useEffect(() => {
    setFiles([]);
    setUploadProgress(0);
    setShowAttachMenu(false);
    setShowEmojiPicker(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [receiver?._id]);

  useEffect(() => {
    if (!droppedFilesBatch?.files?.length) return;
    if (processedDropIdRef.current === droppedFilesBatch.id) return;
    processedDropIdRef.current = droppedFilesBatch.id;
    addFiles(droppedFilesBatch.files, "auto");
  }, [addFiles, droppedFilesBatch]);

  const openAttachmentPicker = (mode) => {
    setAttachmentMode(mode);
    setShowAttachMenu(false);
    if (fileRef.current) {
      fileRef.current.accept = mode === "photo" ? "image/*" : "";
      fileRef.current.dataset.mode = mode;
      fileRef.current.value = "";
      fileRef.current.click();
    }
  };

  return (
    <Box
      px={{ base: 2, md: 3 }}
      py={{ base: 2, md: 2 }}
      bg={chatTheme.inputBg}
      color={appearance.text}
      outline={dragActive ? "2px solid" : "none"}
      outlineColor={chatTheme.accent}
      onDragOver={(e) => {
        e.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragActive(false);
        addFiles(e.dataTransfer.files, "auto");
      }}
    >
      {readOnly && (
        <Flex
          align="center"
          justify="center"
          p={3}
          bg={appearance.cardBg}
          borderWidth="1px"
          borderColor={chatTheme.soft}
          borderRadius="md"
        >
          <Text fontSize="sm" color={appearance.textMuted}>
            {readOnlyMessage}
          </Text>
        </Flex>
      )}

      {!readOnly && (
        <>
          {/* reply preview */}
          {replyTo && (
            <Flex
              mb={2}
              px={4}
              py={2}
              borderTopWidth="1px"
              borderColor={appearance.border}
              align="flex-start"
              justify="space-between"
              gap={3}
            >
              <Box minW={0}>
                <Text fontSize="sm" fontWeight="semibold" color={chatTheme.accent} noOfLines={1}>
                  Replying to {replyTo.senderName || "message"}
                </Text>
                <HStack gap={2} mt={replyImageUrl ? 1 : 0} align="center">
                  {replyImageUrl && (
                    <Box
                      as="img"
                      src={replyImageUrl}
                      alt={replyImage?.originalName || "Photo"}
                      w="42px"
                      h="42px"
                      objectFit="cover"
                      borderRadius="md"
                      flexShrink={0}
                    />
                  )}
                  <Text fontSize="xs" color={appearance.textMuted} noOfLines={1}>
                    {replyTo.content || (replyImageUrl ? "Photo" : "(attachment)")}
                  </Text>
                </HStack>
              </Box>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setReplyTo(null)}
              >
                ×
              </Button>
            </Flex>
          )}

          {/* file preview */}
          {files.length > 0 && (
            <VStack align="stretch" fontSize="xs" mb={2} gap={1}>
              {files.map((file, index) => (
                <HStack
                  key={`${file.file?.name || file.name || "attachment"}-${index}`}
                  spacing={2}
                >
                  <Text color={appearance.textMuted} noOfLines={1} flex="1">
                    {file.mode === "photo" ? "🖼️" : "📎"}{" "}
                    {file.file?.name || file.name}
                  </Text>
                  <Button
                    size="xs"
                    variant="ghost"
                    color={appearance.id === "dark" ? "#fca5a5" : "red.600"}
                    _hover={{
                      bg:
                        appearance.id === "dark"
                          ? "rgba(248, 113, 113, 0.14)"
                          : "red.50",
                    }}
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remove
                  </Button>
                </HStack>
              ))}
              {uploadProgress > 0 && uploadProgress < 100 && (
                <VStack align="stretch" gap={1}>
                  <Box
                    h="6px"
                    bg={appearance.inputBg}
                    borderRadius="full"
                    overflow="hidden"
                  >
                    <Box
                      h="full"
                      w={`${uploadProgress}%`}
                      bg={chatTheme.accent}
                    />
                  </Box>
                  <Text fontSize="2xs" color={appearance.textMuted}>
                    {uploadProgress < 15
                      ? "Compressing media locally..."
                      : "Uploading..."}
                  </Text>
                </VStack>
              )}
            </VStack>
          )}

          {showEmojiPicker && (
            <Flex
              mb={2}
              p={2}
              gap={1}
              wrap="wrap"
              bg={appearance.cardBg}
              borderWidth="1px"
              borderColor={chatTheme.soft}
              borderRadius="md"
              boxShadow="sm"
            >
              {EMOJI_OPTIONS.map((emoji) => (
                <Button
                  key={emoji}
                  type="button"
                  size="sm"
                  variant="ghost"
                  minW="32px"
                  fontSize="lg"
                  onClick={() => {
                    setText((value) => `${value}${emoji}`);
                    inputRef.current?.focus();
                  }}
                >
                  {emoji}
                </Button>
              ))}
            </Flex>
          )}

          <Flex align="flex-end" gap={{ base: 1.5, md: 2 }}>
            <Flex
              flex="1"
              align="flex-end"
              gap={1}
              px={2}
              py={1}
              minH="44px"
              borderRadius="22px"
              bg={appearance.inputStrongBg}
              borderWidth="1px"
              borderColor={chatTheme.soft}
              _focusWithin={{
                borderColor: chatTheme.accent,
                boxShadow: `0 0 0 3px ${chatTheme.soft}`,
              }}
            >
              <IconButton
                size={{ base: "xs", md: "md" }}
                aria-label="emoji"
                variant="ghost"
                color={appearance.textMuted}
                borderRadius="full"
                flexShrink={0}
                onClick={() => setShowEmojiPicker((value) => !value)}
              >
                <Smile size={18} />
              </IconButton>

              {/* input */}
              <Textarea
                ref={inputRef}
                rows={1}
                resize="none"
                minH="40px"
                maxH="150px"
                py="9px"
                px={1}
                lineHeight="1.2"
                display="flex"
                alignItems="center"
                fontSize={{ base: "sm", md: "md" }}
                overflowY="auto"
                borderRadius="0"
                bg="transparent"
                color={appearance.text}
                borderWidth="0"
                outline="none"
                _focus={{ boxShadow: "none", outline: "none" }}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  e.currentTarget.style.height = "auto";
                  e.currentTarget.style.height = `${Math.min(
                    e.currentTarget.scrollHeight,
                    150,
                  )}px`;
                  emitTyping();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.shiftKey) {
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Message"
              />

              <Box position="relative" flexShrink={0}>
                {showAttachMenu && (
                  <VStack
                    position="absolute"
                    bottom="44px"
                    right={0}
                    zIndex={5}
                    align="stretch"
                    gap={1}
                    minW="170px"
                    p={2}
                    bg={appearance.modalBg}
                    color={appearance.text}
                    borderWidth="1px"
                    borderColor={appearance.border}
                    borderRadius="lg"
                    boxShadow="xl"
                  >
                    <Button
                      size="sm"
                      justifyContent="flex-start"
                      variant="ghost"
                      color={appearance.text}
                      _hover={{ bg: appearance.hoverBg }}
                      onClick={() => openAttachmentPicker("photo")}
                    >
                      <Image size={17} />
                      Photo
                    </Button>
                    <Button
                      size="sm"
                      justifyContent="flex-start"
                      variant="ghost"
                      color={appearance.text}
                      _hover={{ bg: appearance.hoverBg }}
                      onClick={() => openAttachmentPicker("file")}
                    >
                      <FileText size={17} />
                      File
                    </Button>
                  </VStack>
                )}
                <IconButton
                  size={{ base: "xs", md: "md" }}
                  aria-label="attach"
                  variant="ghost"
                  color={appearance.textMuted}
                  borderRadius="full"
                  _hover={{ bg: appearance.hoverBg, color: appearance.text }}
                  onClick={() => setShowAttachMenu((value) => !value)}
                >
                  <Paperclip size={17} />
                </IconButton>
              </Box>
            </Flex>

            <input
              type="file"
              multiple
              hidden
              ref={fileRef}
              onChange={(e) => {
                addFiles(e.target.files, e.target.dataset.mode || attachmentMode);
                e.target.value = "";
              }}
            />

            {/* send */}
            <IconButton
              h="44px"
              minW="44px"
              alignSelf="center"
              size={{ base: "xs", md: "sm" }}
              aria-label="send"
              bg={chatTheme.accent}
              color="white"
              _hover={{ bg: chatTheme.accentHover }}
              onClick={sendMessage}
              isDisabled={!text.trim() && !files.length}
            >
              <span>➤</span>
            </IconButton>
          </Flex>
        </>
      )}
    </Box>
  );
}
