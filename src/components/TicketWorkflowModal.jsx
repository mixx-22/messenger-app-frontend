import { Box, Button, Flex, HStack, IconButton, Text, Textarea, VStack } from "@chakra-ui/react";
import { Paperclip } from "lucide-react";
import { useRef, useState } from "react";
import { API_BASE } from "../services/api";
import { formatBytes } from "../settings/appSettings";
import { compressAttachmentFile } from "../utils/localMediaCompression";
import { toaster } from "../toaster";

function modalCopy(action) {
  if (action?.requiresActionTaken) {
    return {
      title: "Action Taken",
      label: "Action taken *",
      field: "actionTaken",
      placeholder: "Describe the action taken before sending this ticket for verification.",
    };
  }
  if (action?.requiresVerificationComment) {
    return {
      title: "Verification",
      label: "Verification comment *",
      field: "verificationComment",
      placeholder: "Explain why this ticket is not resolved.",
    };
  }
  if (action?.requiresVerification) {
    return {
      title: "Verification",
      label: "Verification note *",
      field: "verificationComment",
      placeholder: "Confirm the resolution before moving this ticket to Resolved.",
    };
  }
  return null;
}

export default function TicketWorkflowModal({
  action,
  ticket,
  token,
  appearance,
  maxAttachmentBytes,
  onClose,
  onSubmit,
}) {
  const copy = modalCopy(action);
  const [value, setValue] = useState("");
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  if (!copy || !ticket) return null;

  const limit =
    typeof maxAttachmentBytes === "number"
      ? formatBytes(maxAttachmentBytes)
      : "200MB";

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
    if (!res.ok) throw new Error(data?.message || "Attachment upload failed");
    return [data];
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!value.trim()) {
      toaster.create({ type: "error", title: `${copy.label.replace(" *", "")} is required` });
      return;
    }
    setSaving(true);
    try {
      const attachments = await uploadAttachment();
      await onSubmit?.({
        status: action.status,
        [copy.field]: value.trim(),
        attachments,
      });
    } catch (err) {
      toaster.create({
        type: "error",
        title: "Ticket not updated",
        description: err?.message || "Please try again.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      position="fixed"
      inset={0}
      zIndex={2600}
      bg={appearance.modalOverlay}
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={{ base: 2, md: 4 }}
      onClick={() => !saving && onClose?.()}
    >
      <Box
        as="form"
        onSubmit={submit}
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
          <Text fontWeight="semibold">{copy.title}</Text>
          <Text fontSize="xs" color={appearance.textMuted} mt={1}>
            {ticket.ticketNumber || "Ticket pending"} · {ticket.subject}
          </Text>
        </Box>

        <VStack align="stretch" gap={3} p={4}>
          <Box>
            <Text fontSize="sm" fontWeight="semibold" mb={1}>
              {copy.label}
            </Text>
            <Textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              minH="130px"
              resize="vertical"
              bg={appearance.inputStrongBg}
              borderColor={appearance.border}
              placeholder={copy.placeholder}
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

        <Flex justify="flex-end" gap={2} p={3} borderTopWidth="1px" borderColor={appearance.border}>
          <Button
            type="button"
            variant="ghost"
            color={appearance.text}
            _hover={{ bg: appearance.hoverBg }}
            disabled={saving}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" bg="#7c3aed" color="white" _hover={{ bg: "#6d28d9" }} loading={saving}>
            Submit
          </Button>
        </Flex>
      </Box>
    </Box>
  );
}
