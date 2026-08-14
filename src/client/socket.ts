import { io, type Socket } from "socket.io-client";

export function socketUrl(): string {
  // スマホはページと同じオリジンだけを使う（別ポートの WebSocket は LAN で途切れやすい）
  return window.location.origin;
}

export function createSocket(): Socket {
  return io(socketUrl(), {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 400,
    reconnectionDelayMax: 4000,
    timeout: 10000,
    transports: ["polling"],
    upgrade: false,
    rememberUpgrade: false,
    forceNew: true,
  });
}
