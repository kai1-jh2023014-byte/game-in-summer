const PID = "nanairo.playerId";
const NAME = "nanairo.name";
const MUTE = "nanairo.mute";

let memoryId = "";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getPlayerId(): string {
  const existing = read(PID);
  if (existing) return existing;
  if (memoryId) return memoryId;
  const id = newId();
  memoryId = id;
  write(PID, id);
  return id;
}

export function getSavedName(): string {
  return read(NAME) ?? "";
}

export function saveName(name: string): void {
  write(NAME, name.trim().slice(0, 16));
}

export function isMuted(): boolean {
  return read(MUTE) === "1";
}

export function setMuted(muted: boolean): void {
  write(MUTE, muted ? "1" : "0");
}

const SKIP_DEMO = "nanairo.skipDemo";

export function shouldSkipDemo(): boolean {
  return read(SKIP_DEMO) === "1";
}

export function setSkipDemo(skip: boolean): void {
  write(SKIP_DEMO, skip ? "1" : "0");
}
