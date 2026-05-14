import { Box, Button, Flex, HStack, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import TicketKanbanBoard from "./TicketKanbanBoard";
import TicketWorkflowModal from "./TicketWorkflowModal";
import { API_BASE, authHeadersJSON } from "../services/api";
import { toaster } from "../toaster";

const DEFAULT_ACCENT = "#7c3aed";

export default function TicketsWorkspace({
  token,
  appearance,
  userId = "",
  organizationId = "",
  initialTab = "organization",
}) {
  const [ticketTab, setTicketTab] = useState(initialTab);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [updatingTicketId, setUpdatingTicketId] = useState("");
  const [ticketWorkflow, setTicketWorkflow] = useState(null);

  const loadTickets = useCallback(async (tab = ticketTab) => {
    if (!token) return;
    if (tab === "organization" && !organizationId) return;
    setLoading(true);
    try {
      const url =
        tab === "organization"
          ? `${API_BASE}/api/organizations/${organizationId}/tickets`
          : tab === "managed"
          ? `${API_BASE}/api/organizations/tickets/managed`
          : `${API_BASE}/api/organizations/tickets/my`;
      const res = await fetch(url, { headers: authHeadersJSON(token) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setTickets(Array.isArray(data.items) ? data.items : []);
    } finally {
      setLoading(false);
    }
  }, [organizationId, ticketTab, token]);

  useEffect(() => {
    void loadTickets(ticketTab);
  }, [loadTickets, ticketTab]);

  const performTicketUpdate = async (ticket, body) => {
    if (!ticket?._id || !token) return;
    setUpdatingTicketId(ticket._id);
    try {
      const res = await fetch(`${API_BASE}/api/organizations/tickets/${ticket._id}`, {
        method: "PATCH",
        headers: authHeadersJSON(token),
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toaster.create({
          type: "error",
          title: "Ticket not updated",
          description: data?.message || "Please try again.",
        });
        return;
      }
      if (data.ticket) {
        setTickets((rows) =>
          rows.map((row) => (row._id === data.ticket._id ? { ...row, ...data.ticket } : row)),
        );
      }
      toaster.create({ type: "success", title: "Ticket updated" });
    } finally {
      setUpdatingTicketId("");
    }
  };

  const updateTicketStatus = async (ticket, status, action = {}) => {
    if (action.requiresActionTaken || action.requiresVerificationComment || action.requiresVerification) {
      setTicketWorkflow({ ticket, action: { ...action, status } });
      return;
    }
    await performTicketUpdate(ticket, { status });
  };

  const tabs = [
    ...(organizationId ? [["organization", "This Organization"]] : []),
    ["managed", "Users Tickets"],
    ["mine", "My Tickets"],
  ];

  return (
    <Flex h="100dvh" direction="column" bg={appearance.emptyBg} color={appearance.text}>
      <Flex
        px={{ base: 3, md: 5 }}
        py={4}
        align="center"
        justify="space-between"
        borderBottomWidth="1px"
        borderColor={appearance.border}
        bg={appearance.panelBg}
        gap={3}
        wrap="wrap"
      >
        <Box>
          <Text fontSize="xl" fontWeight="bold">
            Tickets
          </Text>
          <Text fontSize="sm" color={appearance.textMuted}>
            Organization ticket Kanban board
          </Text>
        </Box>
        <HStack gap={2} wrap="wrap">
          {tabs.map(([id, label]) => (
            <Button
              key={id}
              size="sm"
              bg={ticketTab === id ? DEFAULT_ACCENT : appearance.inputStrongBg}
              color={ticketTab === id ? "white" : appearance.text}
              borderWidth="1px"
              borderColor={appearance.border}
              _hover={{ bg: ticketTab === id ? "#6d28d9" : appearance.hoverBg }}
              onClick={() => setTicketTab(id)}
            >
              {label}
            </Button>
          ))}
        </HStack>
      </Flex>

      <Box flex="1" minH={0} overflow="auto" p={{ base: 3, md: 5 }}>
        {loading ? (
          <Text color={appearance.textMuted}>Loading tickets...</Text>
        ) : tickets.length ? (
          <TicketKanbanBoard
            tickets={tickets}
            appearance={appearance}
            accent={DEFAULT_ACCENT}
            currentUserId={userId}
            canManage={ticketTab !== "mine"}
            updatingTicketId={updatingTicketId}
            onStatusChange={updateTicketStatus}
          />
        ) : (
          <Text color={appearance.textMuted}>No tickets found.</Text>
        )}
      </Box>

      {ticketWorkflow && (
        <TicketWorkflowModal
          action={ticketWorkflow.action}
          ticket={ticketWorkflow.ticket}
          token={token}
          appearance={appearance}
          onClose={() => setTicketWorkflow(null)}
          onSubmit={async (body) => {
            await performTicketUpdate(ticketWorkflow.ticket, body);
            setTicketWorkflow(null);
          }}
        />
      )}
    </Flex>
  );
}
