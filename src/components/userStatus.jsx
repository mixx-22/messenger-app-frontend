import { Flex } from "@chakra-ui/react";
import { Ban, CircleDot, Clock3, EyeOff } from "lucide-react";

export const STATUS_OPTIONS = [
  {
    value: "available",
    label: "Online",
    color: "green.400",
    icon: CircleDot,
  },
  {
    value: "away",
    label: "Idle",
    color: "yellow.400",
    icon: Clock3,
  },
  {
    value: "busy",
    label: "Do Not Disturb",
    color: "red.400",
    icon: Ban,
  },
  {
    value: "invisible",
    label: "Invisible",
    color: "gray.400",
    icon: EyeOff,
  },
];

export const CUSTOM_STATUS_EMOJIS = ["🙂", "💼", "☕", "📞", "🔕", "🚀"];

export function statusMeta(status) {
  return (
    STATUS_OPTIONS.find((option) => option.value === status) ||
    STATUS_OPTIONS[0]
  );
}

export function statusLine(status, statusMessage = "") {
  const label = statusMeta(status).label;
  const message = String(statusMessage || "").trim();
  return message ? `${label} - ${message}` : label;
}

export function StatusIndicator({
  status,
  size = 18,
  iconSize = 10,
  borderColor,
  borderWidth = "2px",
  ...rest
}) {
  const meta = statusMeta(status);
  const Icon = meta.icon;

  return (
    <Flex
      w={`${size}px`}
      h={`${size}px`}
      align="center"
      justify="center"
      borderRadius="full"
      bg={meta.color}
      color="white"
      border={borderColor ? `${borderWidth} solid` : undefined}
      borderColor={borderColor}
      boxShadow="0 1px 2px rgba(0,0,0,0.18)"
      {...rest}
    >
      <Icon size={iconSize} strokeWidth={3} />
    </Flex>
  );
}
