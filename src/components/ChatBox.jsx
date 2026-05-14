import {
  Box,
  Input,
  Button,
  VStack,
  Text
} from "@chakra-ui/react";
import { useState } from "react";
import { useChat } from "../context/ChatContext";

export default function ChatBox({ userId, receiverId }) {
  const { messages, socket, typingUser } = useChat();
  const [text, setText] = useState("");

  const sendMessage = () => {
    if (!text.trim()) return;

    const message = {
      senderId: userId,
      receiverId,
      content: text
    };

    socket.emit("send_message", {
      receiverId,
      message
    });

    setText("");
  };

  const handleTyping = () => {
    socket.emit("typing", { senderId: userId, receiverId });

    setTimeout(() => {
      socket.emit("stop_typing", { senderId: userId, receiverId });
    }, 1000);
  };

  return (
    <Box borderWidth="1px" p={4} rounded="md">
      <VStack align="stretch" h="300px" overflowY="auto">
        {messages.map((msg, i) => (
          <Box
            key={i}
            alignSelf={msg.senderId === userId ? "flex-end" : "flex-start"}
            bg={msg.senderId === userId ? "blue.100" : "gray.100"}
            p={2}
            rounded="md"
          >
            <Text>{msg.content}</Text>

            {/* ✔✔ Seen */}
            {msg.senderId === userId && (
              <Text fontSize="xs">
                {msg.isRead ? "✔✔ Seen" : "✔ Sent"}
              </Text>
            )}
          </Box>
        ))}
      </VStack>

      {/* Typing Indicator */}
      {typingUser === receiverId && (
        <Text fontSize="sm">Typing...</Text>
      )}

      <Input
        mt={2}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          handleTyping();
        }}
        placeholder="Type a message"
      />

      <Button mt={2} onClick={sendMessage}>
        Send
      </Button>
    </Box>
  );
}