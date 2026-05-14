import { Box, Button, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { downloadUrl } from "../utils/downloadFile";
import { resolveUploadUrl } from "../utils/mediaUrl";
import { pickId } from "../utils/messageUtils";
import huniLogo from "../assets/huni-logo.png";

export const TICKET_STATUS_COLUMNS = [
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Accepted" },
  { id: "in_progress", label: "In Progress" },
  { id: "waiting", label: "Waiting" },
  { id: "verify", label: "Verify" },
  { id: "resolved", label: "Resolved" },
];

function ticketStatusLabel(status) {
  return String(status || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ticketOwner(ticket) {
  const user = ticket?.createdForId || ticket?.requestorId;
  if (!user || typeof user !== "object") return "Unknown";
  return user.name || user.email || "Unknown";
}

function organizationName(ticket) {
  const org = ticket?.organizationId;
  if (!org || typeof org !== "object") return "";
  return org.name || "";
}

function attachmentLabel(file, index) {
  return file?.originalName || file?.fileName || `Attachment ${index + 1}`;
}

function workflowTimeline(ticket, kind) {
  const rows = Array.isArray(ticket?.history) ? ticket.history : [];
  const matches = rows.filter((row) => {
    if (!row) return false;
    if (kind === "action") {
      return row.toStatus === "verify" || row.note === ticket.actionTaken;
    }
    return (
      row.fromStatus === "verify" ||
      row.toStatus === "resolved" ||
      row.toStatus === "waiting" ||
      row.note === ticket.verificationComment
    );
  });
  const timeline = matches
    .map((row) => ({
      id: `${row.createdAt || ""}-${row.toStatus || ""}-${row.note || ""}`,
      actorName: row.actorName || "Update",
      createdAt: row.createdAt || "",
      text: row.note || "",
      attachments: Array.isArray(row.attachments) ? row.attachments : [],
    }))
    .filter((row) => row.text || row.attachments.length)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (!timeline.length && kind === "action" && ticket.actionTaken) {
    return [{
      id: "current-action-taken",
      actorName: "Action Taken",
      createdAt: "",
      text: ticket.actionTaken,
      attachments: [],
    }];
  }

  if (!timeline.length && kind === "verification" && ticket.verificationComment) {
    return [{
      id: "current-verification-comment",
      actorName: "Verification Comment",
      createdAt: "",
      text: ticket.verificationComment,
      attachments: [],
    }];
  }

  return timeline;
}

function AttachmentList({ files, appearance, accent }) {
  const rows = Array.isArray(files) ? files : [];
  if (!rows.length) {
    return (
      <Text fontSize="xs" color={appearance.textSubtle}>
        No attachments.
      </Text>
    );
  }

  return (
    <VStack align="stretch" gap={1}>
      {rows.map((file, index) => {
        const url = resolveUploadUrl(file?.url);
        const label = attachmentLabel(file, index);
        return (
          <Flex
            key={`${url}-${index}`}
            gap={1}
            align="stretch"
            direction="column"
            minW={0}
          >
            <Text
              fontSize="xs"
              color={appearance.textMuted}
              overflowWrap="anywhere"
              minW={0}
              flex="1"
            >
              {label}
            </Text>
            <HStack gap={1} flexShrink={0}>
              <Button
                size="2xs"
                variant="outline"
                color={appearance.text}
                bg={appearance.cardBg}
                borderColor={appearance.border}
                _hover={{ bg: appearance.hoverBg }}
                disabled={!url}
                onClick={() =>
                  url && window.open(url, "_blank", "noopener,noreferrer")
                }
              >
                Open
              </Button>
              <Button
                size="2xs"
                bg={accent}
                color="white"
                _hover={{ bg: "#6d28d9" }}
                disabled={!url}
                onClick={() => {
                  void downloadUrl(url, label).catch(() => {
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                  });
                }}
              >
                Download
              </Button>
            </HStack>
          </Flex>
        );
      })}
    </VStack>
  );
}

function TimelineItem({ item, appearance, accent, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const date = item.createdAt ? new Date(item.createdAt) : null;
  const dateLabel =
    date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : "";

  return (
    <Box position="relative" pl={4}>
      <Box
        position="absolute"
        left="3px"
        top="8px"
        bottom="-10px"
        borderLeft="1px solid"
        borderColor={appearance.border}
      />
      <Box
        position="absolute"
        left="0"
        top="7px"
        w="7px"
        h="7px"
        borderRadius="full"
        bg={accent}
      />
      <Box borderWidth="1px" borderColor={appearance.border} borderRadius="md" bg={appearance.inputBg}>
        <Button
          type="button"
          w="full"
          h="auto"
          py={2}
          px={2}
          justifyContent="space-between"
          borderRadius="0"
          variant="ghost"
          color={appearance.text}
          _hover={{ bg: appearance.hoverBg }}
          onClick={() => setOpen((value) => !value)}
        >
          <Box textAlign="left" minW={0}>
            <Text fontSize="xs" fontWeight="semibold" noOfLines={1}>
              {item.actorName}
            </Text>
            {dateLabel && (
              <Text fontSize="2xs" color={appearance.textSubtle} noOfLines={1}>
                {dateLabel}
              </Text>
            )}
          </Box>
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </Button>
        {open && (
          <VStack align="stretch" gap={2} px={2} pb={2}>
            <Text
              fontSize="xs"
              color={appearance.textMuted}
              whiteSpace="pre-wrap"
            >
              {item.text}
            </Text>
            <Box>
              <Text fontSize="xs" fontWeight="semibold" color={appearance.text}>
                Attachments:
              </Text>
              <Box mt={1}>
                <AttachmentList
                  files={item.attachments}
                  appearance={appearance}
                  accent={accent}
                />
              </Box>
            </Box>
          </VStack>
        )}
      </Box>
    </Box>
  );
}

function TicketTimelineSection({ title, items, appearance, accent }) {
  const [open, setOpen] = useState(false);
  const rows = Array.isArray(items) ? items : [];

  return (
    <Box
      mt={2}
      borderWidth="1px"
      borderColor={appearance.border}
      borderRadius="md"
      bg={appearance.cardBg}
      overflow="hidden"
    >
      <Button
        type="button"
        w="full"
        h="auto"
        py={2}
        px={2}
        justifyContent="space-between"
        borderRadius="0"
        variant="ghost"
        color={appearance.text}
        _hover={{ bg: appearance.hoverBg }}
        onClick={() => setOpen((value) => !value)}
      >
        <Text fontSize="xs" fontWeight="semibold">
          {title}
        </Text>
        {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </Button>
      {open && (
        <VStack align="stretch" gap={2} px={2} pb={2}>
          {rows.map((item, index) => (
            <TimelineItem
              key={item.id || index}
              item={item}
              appearance={appearance}
              accent={accent}
              defaultOpen={index === 0}
            />
          ))}
          {!rows.length && (
            <Text fontSize="xs" color={appearance.textSubtle}>
              No timeline entries.
            </Text>
          )}
        </VStack>
      )}
    </Box>
  );
}

export default function TicketKanbanBoard({
  tickets,
  appearance,
  accent = "#7c3aed",
  canManage = false,
  currentUserId = "",
  updatingTicketId = "",
  onStatusChange,
}) {
  const rows = Array.isArray(tickets) ? tickets : [];
  const finalRows = rows.filter((ticket) =>
    ["closed", "invalid"].includes(ticket.status),
  );
  const printTicket = (ticket) => {
    const html = buildTicketReportHtml(ticket);
    const win = window.open("", "_blank");
    if (!win) return;
    win.opener = null;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  return (
    <VStack align="stretch" gap={3}>
      <Flex
        gap={2}
        overflowX={{ base: "auto", xl: "visible" }}
        pb={2}
        align="stretch"
        w="full"
      >
        {TICKET_STATUS_COLUMNS.map((column) => {
          const columnTickets = rows.filter(
            (ticket) => ticket.status === column.id,
          );
          return (
            <Box
              key={column.id}
              minW={{ base: "240px", xl: "0" }}
              flex={{ base: "0 0 260px", xl: "1 1 0" }}
              borderWidth="1px"
              borderColor={appearance.border}
              borderRadius="lg"
              bg={appearance.cardBg}
              overflow="hidden"
            >
              <Flex
                align="center"
                justify="space-between"
                px={3}
                py={2}
                borderBottomWidth="1px"
                borderColor={appearance.border}
                bg={appearance.inputBg}
              >
                <Text fontWeight="semibold" fontSize="sm">
                  {column.label}
                </Text>
                <Text fontSize="xs" color={appearance.textMuted}>
                  {columnTickets.length}
                </Text>
              </Flex>

              <VStack align="stretch" gap={2} p={2} minH="280px">
                {columnTickets.map((ticket) => {
                  const loading = updatingTicketId === ticket._id;
                  const actions = workflowActions(ticket, {
                    canManage,
                    currentUserId,
                  });
                  const actionTimeline = workflowTimeline(
                    ticket,
                    "action",
                  );
                  const verificationTimeline = workflowTimeline(
                    ticket,
                    "verification",
                  );
                  return (
                    <Box
                      key={ticket._id}
                      p={3}
                      borderWidth="1px"
                      borderColor={appearance.border}
                      borderRadius="md"
                      bg={appearance.inputStrongBg}
                      boxShadow="sm"
                    >
                      <HStack
                        justify="space-between"
                        align="flex-start"
                        gap={2}
                      >
                        <Box minW={0}>
                          <Text
                            fontWeight="semibold"
                            fontSize="sm"
                            noOfLines={1}
                          >
                            {ticket.ticketNumber || "Ticket pending"}
                          </Text>
                          <Text
                            fontSize="xs"
                            color={accent}
                            fontWeight="semibold"
                          >
                            {ticketStatusLabel(ticket.status)}
                          </Text>
                        </Box>
                        <Text
                          fontSize="xs"
                          color={appearance.textSubtle}
                          flexShrink={0}
                        >
                          {ticket.dateNeeded
                            ? new Date(ticket.dateNeeded).toLocaleDateString()
                            : "-"}
                        </Text>
                      </HStack>

                      <Text
                        mt={2}
                        fontSize="sm"
                        color={appearance.text}
                        noOfLines={2}
                      >
                        {ticket.subject}
                      </Text>
                      <Text
                        mt={1}
                        fontSize="xs"
                        color={appearance.textMuted}
                        noOfLines={2}
                      >
                        {ticket.description}
                      </Text>
                      <Text
                        mt={2}
                        fontSize="xs"
                        color={appearance.textSubtle}
                        noOfLines={1}
                      >
                        Requestor: {ticketOwner(ticket)}
                      </Text>
                      {organizationName(ticket) && (
                        <Text
                          fontSize="xs"
                          color={appearance.textSubtle}
                          noOfLines={1}
                        >
                          Organization: {organizationName(ticket)}
                        </Text>
                      )}
                      {ticket.actionTaken && (
                        <TicketTimelineSection
                          title="Action Taken"
                          items={actionTimeline}
                          appearance={appearance}
                          accent={accent}
                        />
                      )}
                      {ticket.verificationComment && (
                        <TicketTimelineSection
                          title="Verification Comment"
                          items={verificationTimeline}
                          appearance={appearance}
                          accent={accent}
                        />
                      )}
                      {actions.length > 0 && (
                        <HStack mt={3} gap={2} wrap="wrap">
                          {actions.map((action) => (
                            <Button
                              key={action.status}
                              size="xs"
                              bg={action.tone === "danger" ? "#dc2626" : accent}
                              color="white"
                              _hover={{
                                bg:
                                  action.tone === "danger"
                                    ? "#b91c1c"
                                    : "#6d28d9",
                              }}
                              disabled={loading}
                              loading={loading}
                              onClick={() =>
                                onStatusChange?.(ticket, action.status, action)
                              }
                            >
                              {action.label}
                            </Button>
                          ))}
                        </HStack>
                      )}
                    </Box>
                  );
                })}

                {!columnTickets.length && (
                  <Text color={appearance.textMuted} fontSize="xs" p={2}>
                    No tickets.
                  </Text>
                )}
              </VStack>
            </Box>
          );
        })}
      </Flex>
      {finalRows.length > 0 && (
        <Box
          borderWidth="1px"
          borderColor={appearance.border}
          borderRadius="lg"
          bg={appearance.cardBg}
          p={3}
        >
          <Text fontWeight="semibold" fontSize="sm" mb={2}>
            Closed / Invalid
          </Text>
          <VStack align="stretch" gap={2}>
            {finalRows.map((ticket) => (
              <Flex
                key={ticket._id}
                justify="space-between"
                gap={3}
                p={3}
                borderRadius="md"
                bg={appearance.inputBg}
                borderWidth="1px"
                borderColor={appearance.border}
                align={{ base: "stretch", md: "center" }}
                direction={{ base: "column", md: "row" }}
              >
                <Box minW={0}>
                  <HStack gap={2} mb={1} wrap="wrap">
                    <Text fontSize="sm" fontWeight="semibold" noOfLines={1}>
                      {ticket.ticketNumber || "Ticket"}
                    </Text>
                    <Text
                      fontSize="10px"
                      px={2}
                      py="2px"
                      borderRadius="full"
                      bg={ticket.status === "closed" ? "green.500" : "red.500"}
                      color="white"
                      fontWeight="bold"
                      textTransform="uppercase"
                    >
                      {ticketStatusLabel(ticket.status)}
                    </Text>
                  </HStack>
                  <Text fontSize="sm" color={appearance.text} noOfLines={1}>
                    {ticket.subject}
                  </Text>
                  <Text fontSize="xs" color={appearance.textMuted} noOfLines={2}>
                    {ticket.description}
                  </Text>
                  <HStack mt={1} gap={3} wrap="wrap">
                    <Text fontSize="xs" color={appearance.textSubtle}>
                      Requestor: {ticketOwner(ticket)}
                    </Text>
                    <Text fontSize="xs" color={appearance.textSubtle}>
                      Needed: {ticket.dateNeeded ? new Date(ticket.dateNeeded).toLocaleDateString() : "-"}
                    </Text>
                  </HStack>
                </Box>
                <Button
                  size="sm"
                  bg={accent}
                  color="white"
                  _hover={{ bg: "#6d28d9" }}
                  alignSelf={{ base: "flex-start", md: "center" }}
                  onClick={() => printTicket(ticket)}
                >
                  Print Report
                </Button>
              </Flex>
            ))}
          </VStack>
        </Box>
      )}
    </VStack>
  );
}

function isTicketRequestor(ticket, currentUserId) {
  const id = String(currentUserId || "");
  return (
    id &&
    (pickId(ticket?.requestorId) === id || pickId(ticket?.createdForId) === id)
  );
}

function buildTicketReportHtml(ticket) {
  const esc = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const history = Array.isArray(ticket.history) ? ticket.history : [];
  const logoUrl =
    typeof window !== "undefined" ? new URL(huniLogo, window.location.origin).href : huniLogo;
  const historyHtml = history
    .map((row) => `
      <tr>
        <td>${esc(row.createdAt ? new Date(row.createdAt).toLocaleString() : "")}</td>
        <td>${esc(row.actorName || "")}</td>
        <td>${esc(ticketStatusLabel(row.fromStatus || ""))} -> ${esc(ticketStatusLabel(row.toStatus || ""))}</td>
        <td>${esc(row.note || "")}</td>
      </tr>
    `)
    .join("");

  return `<!doctype html>
  <html>
    <head>
      <title>${esc(ticket.ticketNumber || "Ticket Report")}</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111827; padding: 28px; }
        .header { display: flex; align-items: center; justify-content: space-between; gap: 24px; border-bottom: 2px solid #7c3aed; padding-bottom: 16px; margin-bottom: 22px; }
        .brand { display: flex; align-items: center; gap: 12px; }
        .logo { width: 54px; height: 54px; border-radius: 12px; object-fit: cover; }
        .system { font-size: 22px; font-weight: 800; color: #4c1d95; line-height: 1; }
        .subtitle { color: #6b7280; font-size: 12px; margin-top: 4px; }
        h1 { margin: 0 0 4px; font-size: 24px; }
        .muted { color: #6b7280; font-size: 12px; }
        .report-meta { text-align: right; }
        .status { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #ede9fe; color: #5b21b6; font-size: 12px; font-weight: 700; text-transform: uppercase; }
        .grid { display: grid; grid-template-columns: 160px 1fr; gap: 8px 16px; margin: 20px 0; }
        .label { font-weight: 700; }
        .box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; margin-top: 14px; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        th, td { border: 1px solid #d1d5db; padding: 8px; font-size: 12px; vertical-align: top; text-align: left; }
        th { background: #f3f4f6; }
        @media print { body { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="brand">
          <img class="logo" src="${esc(logoUrl)}" alt="Huni logo" />
          <div>
            <div class="system">Huni</div>
            <div class="subtitle">Organization Ticketing System</div>
          </div>
        </div>
        <div class="report-meta">
          <h1>${esc(ticket.ticketNumber || "Ticket Report")}</h1>
          <div class="status">${esc(ticketStatusLabel(ticket.status))}</div>
          <div class="muted">Generated ${esc(new Date().toLocaleString())}</div>
        </div>
      </div>
      <div class="grid">
        <div class="label">Status</div><div>${esc(ticketStatusLabel(ticket.status))}</div>
        <div class="label">Subject</div><div>${esc(ticket.subject)}</div>
        <div class="label">Requestor</div><div>${esc(ticketOwner(ticket))}</div>
        <div class="label">Date Needed</div><div>${esc(ticket.dateNeeded ? new Date(ticket.dateNeeded).toLocaleDateString() : "-")}</div>
      </div>
      <div class="box"><strong>Description</strong><br/>${esc(ticket.description)}</div>
      <div class="box"><strong>Action Taken</strong><br/>${esc(ticket.actionTaken || "-")}</div>
      <div class="box"><strong>Verification Comment</strong><br/>${esc(ticket.verificationComment || "-")}</div>
      <div class="box">
        <strong>History</strong>
        <table>
          <thead><tr><th>Date</th><th>Actor</th><th>Status</th><th>Note</th></tr></thead>
          <tbody>${historyHtml || '<tr><td colspan="4">No history.</td></tr>'}</tbody>
        </table>
      </div>
      <script>
        window.addEventListener("load", function () {
          window.focus();
          setTimeout(function () {
            window.print();
          }, 150);
        });
      </script>
    </body>
  </html>`;
}

function workflowActions(ticket, { canManage, currentUserId }) {
  const requestor = isTicketRequestor(ticket, currentUserId);
  if (ticket.status === "verify") {
    return requestor
      ? [
          { status: "resolved", label: "Resolved", requiresVerification: true },
          {
            status: "waiting",
            label: "Not Resolved",
            requiresVerificationComment: true,
          },
        ]
      : [];
  }
  if (!canManage) return [];

  switch (ticket.status) {
    case "pending":
      return [{ status: "accepted", label: "Accept" }];
    case "accepted":
      return [{ status: "in_progress", label: "Start" }];
    case "in_progress":
      return [
        ...(ticket.actionTaken
          ? []
          : [{ status: "accepted", label: "Back to Accepted" }]),
        { status: "waiting", label: "Move to Waiting" },
      ];
    case "waiting":
      return [
        {
          status: "in_progress",
          label: "Back to In Progress",
        },
        {
          status: "verify",
          label: "Send to Verify",
          requiresActionTaken: true,
        },
      ];
    case "resolved":
      return [
        { status: "closed", label: "Close" },
        { status: "invalid", label: "Invalid", tone: "danger" },
      ];
    default:
      return [];
  }
}
