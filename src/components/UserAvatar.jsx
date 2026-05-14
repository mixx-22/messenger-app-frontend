import { AvatarFallback, AvatarImage, AvatarRoot } from "@chakra-ui/react";
import { resolveUploadUrl } from "../utils/mediaUrl";

export default function UserAvatar({
  name = "",
  avatarUrl,
  size = "sm",
  ...rest
}) {
  const src = resolveUploadUrl(avatarUrl);
  return (
    <AvatarRoot size={size} flexShrink={0} {...rest}>
      {src ? <AvatarImage src={src} alt="" /> : null}
      <AvatarFallback name={name || "?"} />
    </AvatarRoot>
  );
}
