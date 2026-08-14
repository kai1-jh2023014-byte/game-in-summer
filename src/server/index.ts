import { createApp } from "./app.js";
import { getLanAddresses } from "./network.js";

export { createApp } from "./app.js";
export type { AppHandles } from "./app.js";

const DEFAULT_PORTS = [3001, 3002, 8080, 5174];

function requestedPort(): number {
  const fromEnv = Number(process.env.PORT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 3001;
}

function printReady(port: number): void {
  const lan = getLanAddresses();
  console.log("");
  console.log("🎴  NANAIRO  — カードパーティー");
  console.log("────────────────────────────────");
  console.log(`   Local:   http://localhost:${port}`);
  for (const ip of lan) {
    console.log(`   Phone:   http://${ip}:${port}`);
  }
  console.log("────────────────────────────────");
  console.log("スマホから Phone のURLを開いてください。");
  console.log("");
}

export function startServer(port = requestedPort()) {
  const { httpServer } = createApp();
  const tried = new Set<number>();
  const queue = [port, ...DEFAULT_PORTS.filter((p) => p !== port)];

  const tryListen = (next: number): void => {
    if (tried.has(next)) {
      const remaining = queue.find((p) => !tried.has(p));
      if (remaining) return tryListen(remaining);
      console.error("空きポートが見つかりません。PORT=3001 などで指定してください。");
      process.exit(1);
    }
    tried.add(next);
    httpServer.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.warn(`ポート ${next} は使用中です。別のポートを試します...`);
        const remaining = queue.find((p) => !tried.has(p));
        if (remaining) tryListen(remaining);
        else {
          console.error("空きポートが見つかりません。PORT=3001 などで指定してください。");
          process.exit(1);
        }
        return;
      }
      throw err;
    });
    httpServer.listen(next, "0.0.0.0", () => {
      printReady(next);
    });
  };

  tryListen(port);
  return httpServer;
}

startServer();
