import { Box, Text } from "@chakra-ui/react";

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi;
const BARE_LINK_RE = /(https?:\/\/[^\s<)]+|www\.[^\s<)]+)/gi;

function cleanUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return raw;
  if (/^www\./i.test(raw)) return `https://${raw}`;
  return "";
}

function splitHighlight(text, highlight) {
  const raw = String(text || "");
  const q = String(highlight || "").trim();
  if (!q) return [raw];
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return raw.split(new RegExp(`(${escaped})`, "gi"));
}

function renderInline(text, highlight) {
  const parts = String(text || "").split(/(\*\*[^*]+\*\*)/g);

  return parts.map((part, index) => {
    const bold = part.startsWith("**") && part.endsWith("**");
    const content = bold ? part.slice(2, -2) : part;
    if (!content) return null;

    return (
      <Text as={bold ? "strong" : "span"} key={`${part}-${index}`}>
        {renderLinks(content, highlight)}
      </Text>
    );
  });
}

function renderHighlightedText(text, highlight, keyPrefix) {
  return splitHighlight(text, highlight).map((chunk, chunkIndex) => {
    const matched =
      highlight &&
      chunk.toLowerCase() === String(highlight).trim().toLowerCase();
    return matched ? (
      <Text
        as="mark"
        key={`${keyPrefix}-${chunk}-${chunkIndex}`}
        bg="yellow.300"
        color="gray.900"
        px="1px"
        borderRadius="2px"
      >
        {chunk}
      </Text>
    ) : (
      <Text as="span" key={`${keyPrefix}-${chunk}-${chunkIndex}`}>
        {chunk}
      </Text>
    );
  });
}

function renderLinks(text, highlight) {
  const chunks = [];
  const raw = String(text || "");
  let cursor = 0;

  raw.replace(MARKDOWN_LINK_RE, (match, label, href, offset) => {
    if (offset > cursor) {
      chunks.push({ type: "text", value: raw.slice(cursor, offset) });
    }
    chunks.push({ type: "link", label, href: cleanUrl(href) });
    cursor = offset + match.length;
    return match;
  });
  if (cursor < raw.length) chunks.push({ type: "text", value: raw.slice(cursor) });

  return chunks.flatMap((chunk, index) => {
    if (chunk.type === "link") {
      return (
        <Text
          as="a"
          key={`md-link-${chunk.href}-${index}`}
          href={chunk.href}
          target="_blank"
          rel="noopener noreferrer"
          color="blue.300"
          textDecoration="underline"
          onClick={(event) => event.stopPropagation()}
        >
          {renderHighlightedText(chunk.label, highlight, `md-link-label-${index}`)}
        </Text>
      );
    }

    const textParts = [];
    let textCursor = 0;
    String(chunk.value).replace(BARE_LINK_RE, (match, offset) => {
      if (offset > textCursor) {
        textParts.push({
          type: "text",
          value: String(chunk.value).slice(textCursor, offset),
        });
      }
      textParts.push({ type: "link", label: match, href: cleanUrl(match) });
      textCursor = offset + match.length;
      return match;
    });
    if (textCursor < String(chunk.value).length) {
      textParts.push({ type: "text", value: String(chunk.value).slice(textCursor) });
    }

    return textParts.map((part, partIndex) =>
      part.type === "link" ? (
        <Text
          as="a"
          key={`bare-link-${part.href}-${index}-${partIndex}`}
          href={part.href}
          target="_blank"
          rel="noopener noreferrer"
          color="blue.300"
          textDecoration="underline"
          onClick={(event) => event.stopPropagation()}
        >
          {renderHighlightedText(part.label, highlight, `bare-link-label-${index}-${partIndex}`)}
        </Text>
      ) : (
        renderHighlightedText(part.value, highlight, `plain-${index}-${partIndex}`)
      ),
    );
  });
}

export default function MarkdownMessage({ children, color, highlight, ...rest }) {
  const lines = String(children || "").split(/\r?\n/);

  return (
    <Box color={color} fontSize="inherit" lineHeight="1.55" {...rest}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <Box key={`blank-${index}`} h="0.8em" />;
        }

        const bullet = trimmed.match(/^[-*]\s+(.+)$/);
        if (bullet) {
          return (
            <Text
              key={`${line}-${index}`}
              as="p"
              mb={1}
              pl={4}
              position="relative"
              overflowWrap="anywhere"
              _before={{
                content: '"•"',
                position: "absolute",
                left: 0,
              }}
            >
              {renderInline(bullet[1], highlight)}
            </Text>
          );
        }

        return (
          <Text
            key={`${line}-${index}`}
            as="p"
            mb={1}
            overflowWrap="anywhere"
          >
            {renderInline(line, highlight)}
          </Text>
        );
      })}
    </Box>
  );
}
