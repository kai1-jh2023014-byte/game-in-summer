import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import express from "express";
import { Server } from "socket.io";
import { RoomManager } from "../shared/rooms.js";
import { attachSockets } from "./socket.js";

const require = createRequire(import.meta.url);
const WsServer = require("ws").Server as new (...args: unknown[]) => unknown;

export interface AppHandles {
  app: express.Express;
  httpServer: http.Server;
  io: Server;
  manager: RoomManager;
}

export function createApp(): AppHandles {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: true, methods: ["GET", "POST"] },
    pingInterval: 10000,
    pingTimeout: 20000,
    connectTimeout: 20000,
    perMessageDeflate: false,
    allowUpgrades: false,
    transports: ["polling", "websocket"],
    wsEngine: WsServer,
  });
  const manager = new RoomManager();
  attachSockets(io, manager);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: manager.rooms.size });
  });

  const dist = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: 0 }));
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/socket.io")) return next();
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    console.warn("⚠ dist がありません。スマホ用画面を出すには npm run build が必要です。");
  }

  return { app, httpServer, io, manager };
}
