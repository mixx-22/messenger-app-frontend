import { io } from "socket.io-client";
import { API_BASE } from "./api";

const SOCKET_URL = API_BASE;

let socket;

export const connectSocket = (userId, token) => {
  const uid = userId != null ? String(userId).trim() : "";
  socket = io(SOCKET_URL, {
    // Allow polling fallback (helps with dev proxies / some hosts).
    transports: ["websocket", "polling"],
    path: "/socket.io",
    auth: token ? { token } : undefined,
  });

  socket.on("connect", () => {
    console.log("Connected:", socket.id);

    // Backend verifies the token and only joins this authenticated user's room.
    if (uid) socket.emit("join", uid);
  });

  return socket;
};

export const getSocket = () => socket;
