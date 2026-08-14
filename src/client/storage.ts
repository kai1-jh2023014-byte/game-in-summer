const PID = "nanairo.playerId";
const NAME = "nanairo.name";
const MUTE = "nanairo.mute";

export function getPlayerId(): string {
  let id = localStorage.getItem(PID);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(PID, id);
  }
  return id;
}

export function getSavedName(): string {
  return localStorage.getItem(NAME) ?? "";
}

export function saveName(name: string): void {
  localStorage.setItem(NAME, name.trim().slice(0, 16));
}

export function isMuted(): boolean {
  return localStorage.getItem(MUTE) === "1";
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTE, muted ? "1" : "0");
}
