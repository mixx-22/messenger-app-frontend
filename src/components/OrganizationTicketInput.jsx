import {
  Box,
  Button,
  Flex,
  HStack,
  IconButton,
  Input,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react";
import { Megaphone, Paperclip, TicketPlus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useChat } from "../context/ChatContext";
import { API_BASE, authHeadersJSON } from "../services/api";
import { formatBytes } from "../settings/appSettings";
import { compressAttachmentFile } from "../utils/localMediaCompression";
import { pickId } from "../utils/messageUtils";
import { toaster } from "../toaster";

function subjectRows(receiver) {
  return (Array.isArray(receiver?.subjects) ? receiver.subjects : [])
    .filter((subject) => subject && subject.active !== false)
    .map((subject) => String(subject.name || subject).trim())
    .filter(Boolean);
}

export default function OrganizationTicketInput({
  receiver,
  chatTheme,
  appearance,
  canCreateTicketForOthers = false,
  canPostAnnouncement = false,
}) {
  const { token, appendLocalMessage, maxAttachmentBytes } = useChat();
  const [open, setOpen] = useState(false);
  const [announcementOpen, setAnnouncementOpen] = useState(false);
  const [dateNeeded, setDateNeeded] = useState("");
  const [createdForId, setCreatedForId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [announcementSubject, setAnnouncementSubject] = useState("Announcement");
  const [announcementContent, setAnnouncementContent] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  const subjects = useMemo(() => subjectRows(receiver), [receiver]);
  const memberOptions = useMemo(
    () =>
      (Array.isArray(receiver?.members) ? receiver.members : [])
        .map((member) => member?.userId || member)
        .filter(Boolean),
    [receiver],
  );
  const organizationId = pickId(receiver?.organizationId);
  const limit =
    typeof maxAttachmentBytes === "number"
      ? formatBytes(maxAttachmentBytes)
      : "200MB";
  const dateInputCss =
    appearance.id === "dark"
      ? {
          colorScheme: "dark",
          "&::-webkit-calendar-picker-indicator": {
            filter: "invert(1)",
            opacity: 0.85,
          },
        }
      : { colorScheme: "light" };

  const reset = () => {
    setDateNeeded("");
    setCreatedForId("");
    setSubject("");
    setDescription("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submitAnnouncement = async (e) => {
    e.preventDefault();
    if (!organizationId || !announcementContent.trim()) {
      toaster.create({ type: "error", title: "Announcement message is required" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/organizations/${organizationId}/announcements`,
        {
          method: "POST",
          headers: authHeadersJSON(token),
          body: JSON.stringify({
            subject: announcementSubject || "Announcement",
            content: announcementContent,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Announcement not posted",
          description: data?.message || "Please try again.",
        });
        return;
      }
      if (data.message) appendLocalMessage(receiver._id, data.message);
      setAnnouncementSubject("Announcement");
      setAnnouncementContent("");
      setAnnouncementOpen(false);
      toaster.create({ type: "success", title: "Announcement posted" });
    } finally {
      setSubmitting(false);
    }
  };

  const uploadAttachment = async () => {
    if (!file) return [];
    const uploadItem = await compressAttachmentFile(file);
    const form = new FormData();
    form.append("file", uploadItem);
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.message || "Attachment upload failed");
    }
    return [data];
  };

  const submitTicket = async (e) => {
    e.preventDefault();
    if (!organizationId) return;
    if (!dateNeeded || !subject || !description.trim()) {
      toaster.create({
        type: "error",
        title: "Complete the required ticket fields",
      });
      return;
    }

    setSubmitting(true);
    try {
      const attachments = await uploadAttachment();
      const res = await fetch(
        `${API_BASE}/api/organizations/${organizationId}/tickets`,
        {
          method: "POST",
          headers: authHeadersJSON(token),
            body: JSON.stringify({
              dateNeeded,
              ...(canCreateTicketForOthers && createdForId ? { createdForId } : {}),
              subject,
              description,
              attachments,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Ticket not created",
          description: data?.message || "Please try again.",
        });
        return;
      }

      if (data.message) {
        appendLocalMessage(receiver._id, data.message);
      }
      toaster.create({ type: "success", title: "Ticket submitted" });
      reset();
      setOpen(false);
    } catch (err) {
      toaster.create({
        type: "error",
        title: "Ticket not created",
        description: err?.message || "Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box
      px={{ base: 2, md: 3 }}
      py={{ base: 2, md: 2 }}
      bg={chatTheme.inputBg}
      color={appearance.text}
    >
      <HStack gap={2}>
        <Button
          flex="1"
          justifyContent="flex-start"
          bg={appearance.inputStrongBg}
          color={appearance.textMuted}
          borderWidth="1px"
          borderColor={chatTheme.soft}
          borderRadius="20px"
          fontWeight="normal"
          _hover={{ bg: appearance.hoverBg }}
          onClick={() => setOpen(true)}
        >
          <TicketPlus size={18} />
          Create a ticket
        </Button>
        <Button
          bg={chatTheme.accent}
          color="white"
          _hover={{ bg: chatTheme.accentHover }}
          onClick={() => setOpen(true)}
        >
          New Ticket
        </Button>
        {canPostAnnouncement && (
          <IconButton
            aria-label="Post announcement"
            bg={appearance.inputStrongBg}
            color={appearance.text}
            borderWidth="1px"
            borderColor={appearance.border}
            _hover={{ bg: appearance.hoverBg }}
            onClick={() => setAnnouncementOpen(true)}
          >
            <Megaphone size={18} />
          </IconButton>
        )}
      </HStack>

      {open && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2350}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => !submitting && setOpen(false)}
        >
          <Box
            as="form"
            onSubmit={submitTicket}
            w="full"
            maxW="520px"
            maxH={{ base: "92dvh", md: "86vh" }}
            overflow="hidden"
            bg={appearance.modalBg}
            color={appearance.text}
            borderRadius={{ base: "md", md: "lg" }}
            boxShadow="2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <Box px={4} py={3} borderBottomWidth="1px" borderColor={appearance.border}>
              <Text fontWeight="semibold">Create ticket</Text>
              <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                {receiver?.name || "Organization channel"}
              </Text>
            </Box>

            <VStack align="stretch" gap={3} p={4} overflowY="auto" maxH="65dvh">
              {canCreateTicketForOthers && (
                <Box>
                  <Text fontSize="sm" fontWeight="semibold" mb={1}>
                    Request For
                  </Text>
                  <Box
                    as="select"
                    value={createdForId}
                    onChange={(event) => setCreatedForId(event.target.value)}
                    h="40px"
                    px={3}
                    borderWidth="1px"
                    borderRadius="md"
                    borderColor={appearance.border}
                    bg={appearance.inputStrongBg}
                    color={appearance.text}
                  >
                    <option value="">Myself</option>
                    {memberOptions.map((member) => (
                      <option key={pickId(member)} value={pickId(member)}>
                        {member.name || member.email || "Member"}
                      </option>
                    ))}
                  </Box>
                </Box>
              )}

              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={1}>
                  Date Needed *
                </Text>
                <Input
                  type="date"
                  value={dateNeeded}
                  onChange={(event) => setDateNeeded(event.target.value)}
                  bg={appearance.inputStrongBg}
                  color={appearance.text}
                  borderColor={appearance.border}
                  css={dateInputCss}
                  required
                />
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={1}>
                  Subject *
                </Text>
                <Box
                  as="select"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  h="40px"
                  px={3}
                  borderWidth="1px"
                  borderRadius="md"
                  borderColor={appearance.border}
                  bg={appearance.inputStrongBg}
                  color={appearance.text}
                  required
                >
                  <option value="">Select subject</option>
                  {subjects.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Box>
                {!subjects.length && (
                  <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                    No subjects yet. Ask a Main Admin to add subjects.
                  </Text>
                )}
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={1}>
                  Description *
                </Text>
                <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  minH="120px"
                  resize="vertical"
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                  required
                />
              </Box>

              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={1}>
                  Attachment
                </Text>
                <HStack gap={2}>
                  <IconButton
                    type="button"
                    aria-label="Attach file"
                    bg={appearance.inputStrongBg}
                    color={appearance.text}
                    borderWidth="1px"
                    borderColor={appearance.border}
                    _hover={{ bg: appearance.hoverBg }}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip size={18} />
                  </IconButton>
                  <Text fontSize="sm" color={appearance.textMuted} noOfLines={1}>
                    {file ? file.name : `Optional file, max ${limit}`}
                  </Text>
                  {file && (
                    <Button size="xs" variant="ghost" onClick={() => setFile(null)}>
                      Remove
                    </Button>
                  )}
                </HStack>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                />
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
                type="button"
                variant="ghost"
                color={appearance.text}
                _hover={{ bg: appearance.hoverBg }}
                disabled={submitting}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                bg="#7c3aed"
                color="white"
                _hover={{ bg: "#6d28d9" }}
                loading={submitting}
              >
                Submit Ticket
              </Button>
            </Flex>
          </Box>
        </Box>
      )}

      {announcementOpen && (
        <Box
          position="fixed"
          inset={0}
          zIndex={2350}
          bg={appearance.modalOverlay}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={{ base: 2, md: 4 }}
          onClick={() => !submitting && setAnnouncementOpen(false)}
        >
          <Box
            as="form"
            onSubmit={submitAnnouncement}
            w="full"
            maxW="520px"
            bg={appearance.modalBg}
            color={appearance.text}
            borderRadius={{ base: "md", md: "lg" }}
            boxShadow="2xl"
            overflow="hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <Box px={4} py={3} borderBottomWidth="1px" borderColor={appearance.border}>
              <Text fontWeight="semibold">Post organization announcement</Text>
              <Text fontSize="xs" color={appearance.textMuted} mt={1}>
                {receiver?.name || "Organization channel"}
              </Text>
            </Box>
            <VStack align="stretch" gap={3} p={4}>
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={1}>
                  Subject
                </Text>
                <Input
                  value={announcementSubject}
                  onChange={(event) => setAnnouncementSubject(event.target.value)}
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                />
              </Box>
              <Box>
                <Text fontSize="sm" fontWeight="semibold" mb={1}>
                  Message *
                </Text>
                <Textarea
                  value={announcementContent}
                  onChange={(event) => setAnnouncementContent(event.target.value)}
                  minH="150px"
                  resize="vertical"
                  bg={appearance.inputStrongBg}
                  borderColor={appearance.border}
                  required
                />
              </Box>
            </VStack>
            <Flex justify="flex-end" gap={2} p={3} borderTopWidth="1px" borderColor={appearance.border}>
              <Button
                type="button"
                variant="ghost"
                color={appearance.text}
                _hover={{ bg: appearance.hoverBg }}
                disabled={submitting}
                onClick={() => setAnnouncementOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                bg="#7c3aed"
                color="white"
                _hover={{ bg: "#6d28d9" }}
                loading={submitting}
              >
                Post
              </Button>
            </Flex>
          </Box>
        </Box>
      )}
    </Box>
  );
}
