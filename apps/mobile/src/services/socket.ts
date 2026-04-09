import { io, type Socket } from "socket.io-client";
import { getAuthToken } from "./api";

let socket: Socket | null = null;

export function connectSocket(userId: string) {
  if (socket?.connected) {
    return socket;
  }
  const token = getAuthToken();
  const url = process.env.EXPO_PUBLIC_NEST_API_URL ?? "http://localhost:4000";
  socket = io(url, {
    transports: ["websocket"],
    query: { userId },
    auth: token ? { token } : {},
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}
