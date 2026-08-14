import os from "node:os";

export function getLanAddresses(): string[] {
  const nets = os.networkInterfaces();
  const result: string[] = [];
  for (const addrs of Object.values(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family === "IPv4" && !addr.internal) {
        result.push(addr.address);
      }
    }
  }
  return result;
}
