import { Box, Button, Flex, HStack, Text, IconButton, Input, Menu, VStack } from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { useChat } from "../context/ChatContext";
import UserAvatar from "./UserAvatar";
import { StatusIndicator, statusLine } from "./userStatus";
import { resolveUploadUrl } from "../utils/mediaUrl";
import { formatBytes } from "../settings/appSettings";
import FileViewerModal from "./FileViewerModal";

import {
  ArrowLeft,
  Paperclip,
  Link as LinkIcon,
  MoreVertical,
  Search,
  Pin,
  Star,
  BellOff,
  LogOut,
  Pencil,
  Trash2,
  TicketPlus,
  User,
  Users,
  ListChecks,
  X,
} from "lucide-react";

function attachmentName(file) {
  return file?.originalName || file?.fileName || "Attachment";
}

function isGifAttachment(file) {
  const name = attachmentName(file).toLowerCase();
  const mimetype = String(file?.mimetype || "").toLowerCase();
  const url = String(file?.url || "").toLowerCase();
  return (
    mimetype === "image/gif" ||
    name.endsWith(".gif") ||
    url.includes("/api/gifs/file/") ||
    url.includes("/gifs/")
  );
}

export default function ChatHeader({
  receiver,
  chatTheme,
  themeOptions = [],
  onThemeChange,
  onViewFiles,
  onViewPinned,
  onViewStarred,
  onSearchMessages,
  onViewProfile,
  files = [],
  links = [],
  loadingFiles = false,
  listFilter = "all",
  searchOpen = false,
  searchValue = "",
  onSearchValueChange,
  onCloseSearch,
  onViewTickets,
  onMuteChange,
  muted = false,
  muteLabel = "",
  muteOptions = [],
  onManageMembers,
  onManageSubjects,
  onDeleteGroup,
  onLeaveGroup,
  onEditGroup,
  groupAdmin,
  isGroupAdmin = false,
  organizationRole = "Member",
  isOrganizationMember = true,
  canLeaveOrganization = false,
  canManageOrganizationMembers = false,
  canManageOrganizationSubjects = false,
  onBack,
  appearance,
}) {
  const { typingUser, onlineUsers, statusByUser } = useChat();
  const [fileTab, setFileTab] = useState("media");
  const [lightboxFile, setLightboxFile] = useState(null);

  const id = receiver?._id ? String(receiver._id) : "";
  const isAnnouncement = receiver?.isAnnouncement === true;
  const isGroup = receiver?.isGroup === true;
  const isOrganization = receiver?.isOrganization === true;
  const isDirectChat = !isAnnouncement && !isGroup && !isOrganization;

  // ✅ FIX: typing logic (prevents stuck "typing...")
  const isTyping = Boolean(typingUser && String(typingUser) === id);

  const online = !isAnnouncement && !isGroup && !isOrganization && id && onlineUsers.includes(id);
  const liveStatus = id ? statusByUser?.[id] : null;
  const status = liveStatus?.status || receiver?.status || (online ? "available" : "away");
  const statusMessage =
    liveStatus?.statusMessage !== undefined
      ? liveStatus.statusMessage
      : receiver?.statusMessage;
  const visibleOnline = online && status !== "invisible";
  const displayStatus = visibleOnline ? status : "invisible";
  const displayStatusLine = statusLine(displayStatus, statusMessage);
  const menuItemProps = {
    color: appearance.text,
    _highlighted: {
      bg: appearance.hoverBg,
      color: appearance.text,
    },
  };
  const fileTabs = [
    ["media", "Media"],
    ["files", "Files"],
    ["links", "Links"],
  ];
  const filesForTab = useMemo(() => {
    const list = Array.isArray(files)
      ? files.filter((file) => !isGifAttachment(file))
      : [];
    if (fileTab === "media") {
      return list.filter((file) => file.type === "image" || file.type === "video");
    }
    if (fileTab === "files") {
      return list.filter((file) => file.type !== "image" && file.type !== "video");
    }
    return [];
  }, [fileTab, files]);
  const linksForTab = useMemo(() => (Array.isArray(links) ? links : []), [links]);
  const fileName = attachmentName;
  const fileExtension = (file) =>
    fileName(file).split(".").pop()?.slice(0, 4).toUpperCase() || "FILE";
  const isImageAttachment = (file) =>
    file?.type === "image" ||
    String(file?.mimetype || "").startsWith("image/") ||
    /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(fileName(file));
  const imageGallery = Array.isArray(files)
    ? files.filter((file) => isImageAttachment(file) && !isGifAttachment(file))
    : [];
  const linkHost = (href) => {
    try {
      return new URL(href).hostname;
    } catch {
      return href;
    }
  };

  if (searchOpen) {
    return (
      <Flex
        px={4}
        py={{ base: 2.5, md: 3 }}
        align="center"
        gap={3}
        bg={chatTheme.headerBg}
        borderBottom="1px solid"
        borderColor={appearance.border}
        color={appearance.text}
        position="sticky"
        top={0}
        zIndex={10}
      >
        <UserAvatar name={receiver?.name} avatarUrl={receiver?.avatarUrl} size="sm" />
        <Box position="relative" flex="1">
          <Search size={18} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: appearance.textMuted }} />
          <Input
            value={searchValue}
            onChange={(event) => onSearchValueChange?.(event.target.value)}
            placeholder="Search"
            h="44px"
            pl="42px"
            pr="42px"
            borderRadius="full"
            bg={appearance.inputBg}
            color={appearance.text}
            borderColor={appearance.border}
            autoFocus
          />
          <IconButton
            aria-label="Close search"
            size="sm"
            variant="ghost"
            position="absolute"
            right="4px"
            top="50%"
            transform="translateY(-50%)"
            borderRadius="full"
            color={appearance.textMuted}
            onClick={() => onCloseSearch?.()}
          >
            <X size={18} />
          </IconButton>
        </Box>
      </Flex>
    );
  }

  return (
    <>
    <Flex
      px={4}
      py={{ base: 2.5, md: 3 }}
      align="center"
      justify="space-between"
      bg={chatTheme.headerBg}
      backdropFilter="blur(10px)"
      borderBottom="1px solid"
      borderColor={appearance.border}
      color={appearance.text}
      position="sticky"
      top={0}
      zIndex={10}
    >
      {/* LEFT SIDE */}
      <Flex align="center" gap={{ base: 2, md: 3 }} minW={0} flex="1">
        <IconButton
          aria-label="Back to chats"
          display={{ base: "inline-flex", md: "none" }}
          variant="ghost"
          size="sm"
          borderRadius="full"
          color={appearance.text}
          onClick={() => onBack?.()}
        >
          <ArrowLeft size={20} />
        </IconButton>
        <Box position="relative" flexShrink={0}>
          <UserAvatar
            name={receiver?.name}
            avatarUrl={receiver?.avatarUrl}
            size="md"
          />

          {!isAnnouncement && !isGroup && !isOrganization && (
            <StatusIndicator
              position="absolute"
              bottom="0"
              right="0"
              borderColor={appearance.panelBg}
              status={displayStatus}
              size={17}
              iconSize={9}
            />
          )}
        </Box>

        <Box minW={0} flex="1">
          <Text fontWeight="semibold" noOfLines={1}>
            {receiver?.name}
          </Text>

          {/* STATUS (FIXED) */}
          <Text fontSize="xs" color={appearance.textMuted}>
            {isAnnouncement ? (
              "Company-wide updates"
            ) : isOrganization ? (
              `${receiver?.members?.length || 0} members`
            ) : isGroup ? (
              `${receiver?.members?.length || 0} members`
            ) : isTyping ? (
              <Text as="span" color={chatTheme.accent}>
                typing…
              </Text>
            ) : (
              displayStatusLine
            )}
          </Text>
        </Box>
      </Flex>

      {/* RIGHT ACTIONS */}
      <Flex gap={1} align="center" flexShrink={0}>
        {!(isOrganization && !isOrganizationMember) && (
          <>
          <IconButton
            aria-label="Pinned messages"
            variant={listFilter === "pinned" ? "solid" : "ghost"}
            size="sm"
            borderRadius="full"
            color={listFilter === "pinned" ? "white" : appearance.text}
            bg={listFilter === "pinned" ? chatTheme.accent : "transparent"}
            _hover={{ bg: listFilter === "pinned" ? chatTheme.accentHover : appearance.hoverBg }}
            onClick={() => onViewPinned?.()}
          >
            <Pin size={17} />
          </IconButton>
          <IconButton
            aria-label="Starred messages"
            variant={listFilter === "starred" ? "solid" : "ghost"}
            size="sm"
            borderRadius="full"
            color={listFilter === "starred" ? "white" : appearance.text}
            bg={listFilter === "starred" ? chatTheme.accent : "transparent"}
            _hover={{ bg: listFilter === "starred" ? chatTheme.accentHover : appearance.hoverBg }}
            onClick={() => onViewStarred?.()}
          >
            <Star size={17} />
          </IconButton>
          <IconButton
            aria-label="Search messages"
            variant="ghost"
            size="sm"
            borderRadius="full"
            color={appearance.text}
            _hover={{ bg: appearance.hoverBg }}
            onClick={() => onSearchMessages?.()}
          >
            <Search size={18} />
          </IconButton>
          <Menu.Root
            onOpenChange={(details) => {
              if (details.open && !isOrganization) onViewFiles?.();
            }}
          >
          <Menu.Trigger asChild>
            <IconButton
              aria-label="more"
              variant="ghost"
              size="sm"
              borderRadius="full"
              color={appearance.text}
              _hover={{ bg: appearance.hoverBg }}
            >
              <MoreVertical size={18} />
            </IconButton>
          </Menu.Trigger>

          <Menu.Positioner>
            <Menu.Content
              fontSize="sm"
              minW={{ base: "230px", md: "260px" }}
              w={{ base: "min(92vw, 320px)", md: "320px" }}
              maxW="320px"
              bg={appearance.modalBg}
              color={appearance.text}
              borderColor={appearance.border}
            >

              {isDirectChat && (
                <Menu.Item value="profile" onClick={() => onViewProfile?.()} {...menuItemProps}>
                  <User size={16} />
                  View Profile
                </Menu.Item>
              )}

              {!isOrganization && (
                <Box
                  px={3}
                  py={3}
                  borderTopWidth="1px"
                  borderColor={appearance.border}
                >
                  <HStack
                    gap={1}
                    overflowX="auto"
                    pb={2}
                    css={{
                      scrollbarWidth: "none",
                      "&::-webkit-scrollbar": { display: "none" },
                    }}
                  >
                    {fileTabs.map(([value, label]) => {
                      const selected = fileTab === value;
                      return (
                        <Button
                          key={value}
                          size="xs"
                          borderRadius="full"
                          variant="ghost"
                          flexShrink={0}
                          bg={selected ? chatTheme.soft : "transparent"}
                          color={selected ? chatTheme.accent : appearance.textMuted}
                          _hover={{ bg: appearance.hoverBg, color: appearance.text }}
                          onClick={(event) => {
                            event.stopPropagation();
                            setFileTab(value);
                          }}
                        >
                          {label}
                        </Button>
                      );
                    })}
                  </HStack>

                  <Box maxH="260px" overflowY="auto" pr={1}>
                    {loadingFiles ? (
                      <Text py={6} textAlign="center" color={appearance.textMuted}>
                        Loading files...
                      </Text>
                    ) : fileTab === "links" ? (
                      linksForTab.length ? (
                        <VStack align="stretch" gap={1.5}>
                          {linksForTab.slice(0, 12).map((link, index) => {
                            const host = linkHost(link.href);
                            return (
                              <Box
                                key={`${link.href}-${index}`}
                                as="a"
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                p={2}
                                borderRadius="md"
                                bg={appearance.inputBg}
                                borderWidth="1px"
                                borderColor={appearance.border}
                                _hover={{ bg: appearance.hoverBg }}
                                title={link.href}
                              >
                                <HStack align="flex-start" gap={2}>
                                  <LinkIcon size={15} color={chatTheme.accent} />
                                  <Box minW={0} flex="1">
                                    <Text
                                      fontSize="sm"
                                      fontWeight="semibold"
                                      color={appearance.text}
                                      truncate
                                    >
                                      {link.label}
                                    </Text>
                                    <Text fontSize="xs" color={appearance.textMuted} truncate>
                                      {host}
                                    </Text>
                                  </Box>
                                </HStack>
                              </Box>
                            );
                          })}
                        </VStack>
                      ) : (
                        <Text py={6} textAlign="center" color={appearance.textMuted}>
                          No links here
                        </Text>
                      )
                    ) : filesForTab.length ? (
                      fileTab === "files" ? (
                        <VStack align="stretch" gap={1.5}>
                          {filesForTab.slice(0, 18).map((file, index) => {
                            const url = resolveUploadUrl(file.url);
                            const isImage = isImageAttachment(file);
                            return (
                              <Box
                                key={`${file.messageId || file.url || fileName(file)}-${index}`}
                                as={url && !isImage ? "a" : "button"}
                                href={url && !isImage ? url : undefined}
                                target={url && !isImage ? "_blank" : undefined}
                                rel={url && !isImage ? "noopener noreferrer" : undefined}
                                type={isImage ? "button" : undefined}
                                onClick={
                                  isImage
                                    ? (event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setLightboxFile(file);
                                      }
                                    : undefined
                                }
                                p={2}
                                w="100%"
                                textAlign="left"
                                borderRadius="md"
                                bg={appearance.inputBg}
                                borderWidth="1px"
                                borderColor={appearance.border}
                                _hover={{ bg: appearance.hoverBg }}
                                title={fileName(file)}
                              >
                                <HStack gap={2} align="center">
                                  <Paperclip size={16} color={chatTheme.accent} />
                                  <Box minW={0} flex="1">
                                    <Text
                                      fontSize="sm"
                                      fontWeight="semibold"
                                      color={appearance.text}
                                      truncate
                                    >
                                      {fileName(file)}
                                    </Text>
                                    {typeof file.size === "number" && (
                                      <Text fontSize="xs" color={appearance.textMuted}>
                                        {formatBytes(file.size)}
                                      </Text>
                                    )}
                                  </Box>
                                </HStack>
                              </Box>
                            );
                          })}
                        </VStack>
                      ) : (
                      <Box
                        display="grid"
                        gridTemplateColumns="repeat(4, minmax(0, 1fr))"
                        gap={1.5}
                      >
                        {filesForTab.slice(0, 18).map((file, index) => {
                          const url = resolveUploadUrl(file.url);
                          const isImage = isImageAttachment(file);
                          return (
                            <Box
                              key={`${file.messageId || file.url || fileName(file)}-${index}`}
                              as={url && !isImage ? "a" : "button"}
                              href={url && !isImage ? url : undefined}
                              target={url && !isImage ? "_blank" : undefined}
                              rel={url && !isImage ? "noopener noreferrer" : undefined}
                              type={isImage ? "button" : undefined}
                              onClick={
                                isImage
                                  ? (event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setLightboxFile(file);
                                    }
                                  : undefined
                              }
                              h="68px"
                              w="100%"
                              borderRadius="md"
                              overflow="hidden"
                              bg={appearance.inputBg}
                              borderWidth="1px"
                              borderColor={appearance.border}
                              position="relative"
                              title={fileName(file)}
                            >
                              {isImage && url ? (
                                <Box
                                  as="img"
                                  src={url}
                                  alt={fileName(file)}
                                  w="100%"
                                  h="100%"
                                  objectFit="cover"
                                  display="block"
                                />
                              ) : (
                                <Flex
                                  h="100%"
                                  direction="column"
                                  align="center"
                                  justify="center"
                                  gap={1}
                                  px={1}
                                  textAlign="center"
                                >
                                  <Paperclip size={18} color={chatTheme.accent} />
                                  <Text fontSize="10px" fontWeight="bold" color={appearance.text}>
                                    {fileExtension(file)}
                                  </Text>
                                  {typeof file.size === "number" && (
                                    <Text fontSize="9px" color={appearance.textMuted}>
                                      {formatBytes(file.size)}
                                    </Text>
                                  )}
                                </Flex>
                              )}
                            </Box>
                          );
                        })}
                      </Box>
                      )
                    ) : (
                      <Text py={6} textAlign="center" color={appearance.textMuted}>
                        No files here
                      </Text>
                    )}
                  </Box>
                </Box>
              )}

              {isOrganization && (
                <Menu.Item value="tickets" onClick={() => onViewTickets?.()} {...menuItemProps}>
                  <TicketPlus size={16} />
                  View all tickets
                </Menu.Item>
              )}

              {muted && (
                <Box px={3} py={2} borderTopWidth="1px" borderColor={appearance.border}>
                  <Text fontSize="xs" color={appearance.textMuted}>
                    {muteLabel || "Muted"}
                  </Text>
                </Box>
              )}

              {muted && (
                <Menu.Item
                  value="unmute"
                  onClick={() => onMuteChange?.("off")}
                  {...menuItemProps}
                >
                  <BellOff size={16} />
                  Unmute chat
                </Menu.Item>
              )}

              {!muted && (
                <Menu.Root positioning={{ placement: "left-start" }}>
                  <Menu.Trigger asChild>
                    <Menu.Item value="mute-options" {...menuItemProps}>
                      <BellOff size={16} />
                      Mute notification
                    </Menu.Item>
                  </Menu.Trigger>
                  <Menu.Positioner>
                    <Menu.Content bg={appearance.modalBg} color={appearance.text} borderColor={appearance.border}>
                      {muteOptions.map((option) => (
                        <Menu.Item
                          key={option.id}
                          value={`mute-${option.id}`}
                          onClick={() => onMuteChange?.(option.id)}
                          {...menuItemProps}
                        >
                          {option.label}
                        </Menu.Item>
                      ))}
                    </Menu.Content>
                  </Menu.Positioner>
                </Menu.Root>
              )}

              {isGroup && (
                <Box px={3} py={2} borderTopWidth="1px" borderColor={appearance.border}>
                  <Text fontSize="xs" color={appearance.textMuted}>
                    Group admin
                  </Text>
                  <Text fontSize="sm" fontWeight="semibold" color={appearance.text} truncate>
                    {groupAdmin?.name || groupAdmin?.email || "Unknown"}
                  </Text>
                </Box>
              )}

              {isOrganization && (
                <Box px={3} py={2} borderTopWidth="1px" borderColor={appearance.border}>
                  <Text fontSize="xs" color={appearance.textMuted}>
                    Organization role
                  </Text>
                  <Text fontSize="sm" fontWeight="semibold" color={appearance.text} truncate>
                    {organizationRole}
                  </Text>
                </Box>
              )}

              {isOrganization && canManageOrganizationMembers && (
                <Menu.Item value="org-members" onClick={() => onManageMembers?.()} {...menuItemProps}>
                  <Users size={16} />
                  Manage members
                </Menu.Item>
              )}

              {isOrganization && canManageOrganizationSubjects && (
                <Menu.Item value="edit-organization" onClick={() => onEditGroup?.()} {...menuItemProps}>
                  <Pencil size={16} />
                  Edit organization
                </Menu.Item>
              )}

              {isOrganization && canManageOrganizationSubjects && (
                <Menu.Item value="org-subjects" onClick={() => onManageSubjects?.()} {...menuItemProps}>
                  <ListChecks size={16} />
                  Manage subjects
                </Menu.Item>
              )}

              {isGroup && (
                <Menu.Item value="members" onClick={() => onManageMembers?.()} {...menuItemProps}>
                  <Users size={16} />
                  {isGroupAdmin ? "Manage members" : "View members"}
                </Menu.Item>
              )}

              {isGroup && isGroupAdmin && (
                <>
                  <Menu.Item value="edit-group" onClick={() => onEditGroup?.()} {...menuItemProps}>
                    <Pencil size={16} />
                    Edit group
                  </Menu.Item>

                  <Menu.Item
                    value="delete-group"
                    color="red.400"
                    _highlighted={{ bg: appearance.hoverBg, color: "red.300" }}
                    onClick={() => onDeleteGroup?.()}
                  >
                    <Trash2 size={16} />
                    Delete group
                  </Menu.Item>
                </>
              )}

              {isGroup && !isGroupAdmin && (
                <Menu.Item
                  value="leave-group"
                  color="red.400"
                  _highlighted={{ bg: appearance.hoverBg, color: "red.300" }}
                  onClick={() => onLeaveGroup?.()}
                >
                  <LogOut size={16} />
                  Leave group
                </Menu.Item>
              )}

              {isOrganization && canLeaveOrganization && (
                <Menu.Item
                  value="leave-organization"
                  color="red.400"
                  _highlighted={{ bg: appearance.hoverBg, color: "red.300" }}
                  onClick={() => onLeaveGroup?.()}
                >
                  <LogOut size={16} />
                  Leave organization
                </Menu.Item>
              )}

              <Box px={3} py={2} borderTopWidth="1px" borderColor={appearance.border}>
                <Text fontSize="xs" fontWeight="semibold" color={appearance.textMuted} mb={2}>
                  Chat theme
                </Text>
                <HStack wrap="wrap" gap={2}>
                  {themeOptions.map((theme) => {
                    const selected = theme.id === chatTheme.id;
                    return (
                      <Button
                        key={theme.id}
                        size="xs"
                        variant={selected ? "solid" : "outline"}
                        bg={selected ? theme.accent : appearance.inputStrongBg}
                        color={selected ? "white" : appearance.text}
                        borderColor={theme.soft}
                        _hover={{
                          bg: selected ? theme.accentHover : theme.soft,
                        }}
                        onClick={() => onThemeChange?.(theme.id)}
                      >
                        <Box
                          w="10px"
                          h="10px"
                          borderRadius="full"
                          bg={theme.swatch}
                          border="1px solid"
                          borderColor="blackAlpha.200"
                        />
                        {theme.name}
                      </Button>
                    );
                  })}
                </HStack>
              </Box>

              {/* <Menu.Item value="mute">
                <BellOff size={16} />
                Mute Conversation
              </Menu.Item> */}

              {/* <Menu.Item value="block" color="red.500">
                <Ban size={16} />
                Block User
              </Menu.Item> */}

            </Menu.Content>
          </Menu.Positioner>

          </Menu.Root>
          </>
        )}

      </Flex>
    </Flex>
    <FileViewerModal
      isOpen={Boolean(lightboxFile)}
      onClose={() => setLightboxFile(null)}
      file={lightboxFile}
      gallery={imageGallery}
      appearance={appearance}
    />
    </>
  );
}
