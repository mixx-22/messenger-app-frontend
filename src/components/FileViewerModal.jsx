import {
  Box,
  Button,
  Flex,
  IconButton,
  Text
} from "@chakra-ui/react";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from "lucide-react";
import { downloadUrl } from "../utils/downloadFile";
import { resolveUploadUrl } from "../utils/mediaUrl";

export default function FileViewerModal({ isOpen, onClose, file, gallery = [], appearance }) {
  const [zoom, setZoom] = useState(1);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!file) return;
    const index = gallery.findIndex((item) => item.url === file.url);
    setActiveIndex(index >= 0 ? index : 0);
    setZoom(1);
  }, [file, gallery]);

  if (!isOpen || !file) return null;
  const activeFile = gallery[activeIndex] || file;
  const activeUrl = resolveUploadUrl(activeFile.url);
  const activeLabel = activeFile.originalName || activeFile.fileName || "";
  const isImageLightbox =
    activeFile.type === "image" ||
    String(activeFile.mimetype || "").startsWith("image/") ||
    /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(activeLabel);

  const handleDownload = async () => {
    try {
      await downloadUrl(
        resolveUploadUrl(activeFile.url),
        activeFile.originalName || activeFile.fileName || "attachment"
      );
    } catch {
      window.open(resolveUploadUrl(activeFile.url), "_blank", "noopener,noreferrer");
    }
  };

  if (isImageLightbox) {
    return (
      <Box
        position="fixed"
        inset={0}
        bg="rgba(0,0,0,0.92)"
        zIndex={2600}
        display="flex"
        alignItems="center"
        justifyContent="center"
        p={{ base: 2, md: 6 }}
        onClick={onClose}
      >
        <Flex
          position="absolute"
          top={{ base: 3, md: 5 }}
          left={{ base: 3, md: 5 }}
          right={{ base: 3, md: 5 }}
          align="center"
          justify="space-between"
          gap={3}
          color="white"
          zIndex={1}
        >
          <Text fontSize="sm" fontWeight="semibold" noOfLines={1} minW={0}>
            {activeFile.originalName || activeFile.fileName || "Image"}
          </Text>
          <Flex gap={2} flexShrink={0}>
            <IconButton aria-label="Zoom out" size="sm" variant="ghost" color="white" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(0.5, z - 0.2)); }}>
              <ZoomOut size={18} />
            </IconButton>
            <IconButton aria-label="Zoom in" size="sm" variant="ghost" color="white" onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(3, z + 0.2)); }}>
              <ZoomIn size={18} />
            </IconButton>
            <IconButton aria-label="Download image" size="sm" variant="ghost" color="white" onClick={(e) => { e.stopPropagation(); void handleDownload(); }}>
              <Download size={18} />
            </IconButton>
            <IconButton aria-label="Close image" size="sm" variant="ghost" color="white" onClick={onClose}>
              <X size={20} />
            </IconButton>
          </Flex>
        </Flex>

        {gallery.length > 1 && (
          <IconButton
            aria-label="Previous image"
            position="absolute"
            left={{ base: 2, md: 5 }}
            top="50%"
            transform="translateY(-50%)"
            zIndex={1}
            borderRadius="full"
            bg="whiteAlpha.200"
            color="white"
            _hover={{ bg: "whiteAlpha.300" }}
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((index) => (index === 0 ? gallery.length - 1 : index - 1));
            }}
          >
            <ChevronLeft size={24} />
          </IconButton>
        )}

        <Box maxW="100%" maxH="100%" overflow="auto" onClick={(e) => e.stopPropagation()}>
          <img
            src={activeUrl}
            alt={activeFile.originalName || ""}
            style={{
              transform: `scale(${zoom})`,
              maxWidth: "94vw",
              maxHeight: "88dvh",
              objectFit: "contain",
              transition: "0.2s",
              display: "block",
            }}
          />
        </Box>

        {gallery.length > 1 && (
          <IconButton
            aria-label="Next image"
            position="absolute"
            right={{ base: 2, md: 5 }}
            top="50%"
            transform="translateY(-50%)"
            zIndex={1}
            borderRadius="full"
            bg="whiteAlpha.200"
            color="white"
            _hover={{ bg: "whiteAlpha.300" }}
            onClick={(e) => {
              e.stopPropagation();
              setActiveIndex((index) => (index === gallery.length - 1 ? 0 : index + 1));
            }}
          >
            <ChevronRight size={24} />
          </IconButton>
        )}
      </Box>
    );
  }

  return (
    <Box
      position="fixed"
      inset={0}
      bg={appearance?.modalOverlay || "blackAlpha.700"}
      zIndex={2000}
      display="flex"
      alignItems="center"
      justifyContent="center"
      p={{ base: 2, md: 4 }}
      onClick={onClose}
    >
      <Box
        bg={appearance?.modalBg || "white"}
        color={appearance?.text || "gray.900"}
        borderRadius="md"
        w="min(1100px, 96vw)"
        maxH={{ base: "94dvh", md: "92vh" }}
        display="flex"
        flexDirection="column"
        overflow="hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <Flex
          justify="space-between"
          p={{ base: 2, md: 3 }}
          align="center"
          gap={2}
          borderBottomWidth="1px"
          borderColor={appearance?.border}
        >
          <Text fontSize="sm" fontWeight="medium" noOfLines={1} minW={0}>
            {activeFile.originalName}
          </Text>

          <Flex gap={2} flexShrink={0}>
            <Button
              size={{ base: "xs", md: "sm" }}
              onClick={handleDownload}
            >
              Download
            </Button>
            <Button
              size={{ base: "xs", md: "sm" }}
              onClick={onClose}
            >
              Close
            </Button>
          </Flex>
        </Flex>

        <Box flex="1" p={{ base: 2, md: 4 }} display="flex" justifyContent="center" alignItems="center" overflow="auto">
          {activeFile.type === "image" && (
            <img
              src={activeUrl}
              alt={activeFile.originalName}
              style={{
                transform: `scale(${zoom})`,
                maxHeight: "78dvh",
                maxWidth: "100%",
                transition: "0.2s"
              }}
            />
          )}

          {(activeFile.type === "pdf" ||
            String(activeFile.mimetype || "") === "application/pdf" ||
            /\.pdf$/i.test(activeLabel)) && (
            <iframe
              src={activeUrl}
              width="100%"
              height="min(600px, 75dvh)"
              title={activeFile.originalName}
            />
          )}
          {!isImageLightbox &&
            activeFile.type !== "pdf" &&
            String(activeFile.mimetype || "") !== "application/pdf" &&
            !/\.pdf$/i.test(activeLabel) && (
            <Flex direction="column" align="center" gap={3} textAlign="center">
              <Text fontWeight="semibold">
                {activeFile.originalName || activeFile.fileName || "Attachment"}
              </Text>
              <Text fontSize="sm" color={appearance?.textMuted || "gray.500"}>
                Preview is not available for this file type.
              </Text>
              <Button onClick={() => window.open(activeUrl, "_blank", "noopener,noreferrer")}>
                Open file
              </Button>
            </Flex>
          )}
        </Box>

        {activeFile.type === "image" && (
          <Flex justify="center" p={{ base: 2, md: 3 }} gap={3} borderTopWidth="1px" borderColor={appearance?.border}>
            {gallery.length > 1 && (
              <Button
                size={{ base: "sm", md: "md" }}
                onClick={() =>
                  setActiveIndex((index) =>
                    index === 0 ? gallery.length - 1 : index - 1
                  )
                }
              >
                Prev
              </Button>
            )}
            <Button
              size={{ base: "sm", md: "md" }}
              onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            >
              Zoom Out
            </Button>

            <Button
              size={{ base: "sm", md: "md" }}
              onClick={() => setZoom((z) => Math.min(3, z + 0.2))}
            >
              Zoom In
            </Button>
            {gallery.length > 1 && (
              <Button
                size={{ base: "sm", md: "md" }}
                onClick={() =>
                  setActiveIndex((index) =>
                    index === gallery.length - 1 ? 0 : index + 1
                  )
                }
              >
                Next
              </Button>
            )}
          </Flex>
        )}
      </Box>
    </Box>
  );
}
