import { Box, Button, Flex, Text } from "@chakra-ui/react";
import { useEffect, useMemo } from "react";

function MenuBtn({ icon, label, destructive, disabled, onClick, appearance }) {
  return (
    <Button
      variant="ghost"
      justifyContent="flex-start"
      gap={3}
      w="100%"
      h="auto"
      py={2}
      px={3}
      fontWeight="normal"
      borderRadius={0}
      color={destructive ? "red.500" : appearance.text}
      disabled={disabled}
      _hover={{ bg: appearance.hoverBg }}
      onClick={onClick}
    >
      <Text as="span" fontSize="md" opacity={0.85} w="22px" textAlign="center">
        {icon}
      </Text>
      <Text as="span" fontSize="sm">
        {label}
      </Text>
    </Button>
  );
}

const REACTION_OPTIONS = [
  { type: "like", emoji: "👍" },
  { type: "love", emoji: "❤️" },
  { type: "haha", emoji: "😂" },
  { type: "wow", emoji: "😮" },
  { type: "sad", emoji: "😢" },
  { type: "angry", emoji: "😡" },
];

export default function MessageContextMenu({
  anchor,
  msg,
  userId,
  onClose,
  onReply,
  onEdit,
  onDelete,
  onCopy,
  onForward,
  onQuickReaction,
  onPin,
  onStar,
  mode = "actions",
  canReply = true,
  canEdit = true,
  canDelete = true,
  appearance,
}) {
  const pos = useMemo(() => {
    if (!anchor) return { left: 0, top: 0 };
    const menuW = 268;
    const menuH = 320;
    const pad = 8;
    const lx = Math.min(anchor.x, window.innerWidth - menuW - pad);
    const ly = Math.min(anchor.y, window.innerHeight - menuH - pad);
    return {
      left: Math.max(pad, lx),
      top: Math.max(pad, ly),
    };
  }, [anchor]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!anchor || !msg) return null;

  const isMine = String(msg.senderId) === String(userId);
  const hasText =
    typeof msg.content === "string" && msg.content.trim().length > 0;

  const runEmoji = (type) => {
    onQuickReaction?.(msg, type);
    onClose();
  };

  if (mode === "reactions") {
    return (
      <Box position="fixed" inset={0} zIndex={1998} onClick={onClose}>
        <Flex
          role="dialog"
          aria-label="Message reactions"
          position="fixed"
          zIndex={1999}
          left={`${pos.left}px`}
          top={`${pos.top}px`}
          gap={1}
          px={2}
          py={1.5}
          bg={appearance.modalBg}
          color={appearance.text}
          borderRadius="full"
          boxShadow="xl"
          borderWidth="1px"
          borderColor={appearance.border}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {REACTION_OPTIONS.map(({ type, emoji }) => (
            <Button
              key={type}
              size="sm"
              variant="ghost"
              minW="34px"
              h="34px"
              p={0}
              borderRadius="full"
              fontSize="xl"
              aria-label={`React ${type}`}
              _hover={{ bg: appearance.hoverBg, transform: "translateY(-2px)" }}
              onClick={() => runEmoji(type)}
            >
              {emoji}
            </Button>
          ))}
        </Flex>
      </Box>
    );
  }

  return (
    <Box position="fixed" inset={0} zIndex={1998} onClick={onClose}>
      <Box
        role="dialog"
        aria-label="Message actions"
        position="fixed"
        zIndex={1999}
        left={`${pos.left}px`}
        top={`${pos.top}px`}
        w="268px"
        bg={appearance.modalBg}
        color={appearance.text}
        borderRadius="lg"
        boxShadow="xl"
        borderWidth="1px"
        borderColor={appearance.border}
        overflow="hidden"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {canReply && (
          <MenuBtn
            icon="↩"
            label="Reply"
            appearance={appearance}
            onClick={() => {
              onReply(msg);
              onClose();
            }}
          />
        )}

        <MenuBtn
          icon="⧉"
          label="Copy text"
          disabled={!hasText}
          appearance={appearance}
          onClick={() => {
            void onCopy?.(msg);
            onClose();
          }}
        />

        <MenuBtn
          icon="➤"
          label="Forward"
          disabled={Boolean(msg.deleted)}
          appearance={appearance}
          onClick={() => {
            if (!msg.deleted) {
              onForward?.(msg);
            }
            onClose();
          }}
        />

        <MenuBtn
          icon="📌"
          label={msg.pinnedBy?.length ? "Unpin" : "Pin"}
          disabled={Boolean(msg.deleted)}
          appearance={appearance}
          onClick={() => {
            if (!msg.deleted) onPin?.(msg);
            onClose();
          }}
        />

        <MenuBtn
          icon="★"
          label={
            msg.starredBy?.some((id) => String(id) === String(userId))
              ? "Unstar"
              : "Star"
          }
          disabled={Boolean(msg.deleted)}
          appearance={appearance}
          onClick={() => {
            if (!msg.deleted) onStar?.(msg);
            onClose();
          }}
        />

        {isMine && canEdit && (
          <MenuBtn
            icon="✎"
            label="Edit"
            disabled={Boolean(msg.deleted)}
            appearance={appearance}
            onClick={() => {
              if (!msg.deleted) {
                onEdit(msg);
              }
              onClose();
            }}
          />
        )}

        {isMine && canDelete && (
          <MenuBtn
            icon="🗑"
            label="Delete"
            destructive
            appearance={appearance}
            onClick={() => {
              onDelete(msg._id);
              onClose();
            }}
          />
        )}
      </Box>
    </Box>
  );
}
