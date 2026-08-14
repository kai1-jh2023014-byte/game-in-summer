import { io, type Socket } from "socket.io-client";

export function socketUrl(): string {
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }
  return window.location.origin;
}

export function createSocket(): Socket {
  return io(socketUrl(), {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
    timeout: 8000,
    transports: ["websocket", "polling"],
  });
}
