import type { GameEvent } from "../shared/types";
import { isMuted } from "./storage";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (isMuted()) return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.06): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export function unlockAudio(): void {
  audio();
}

export function playEventSounds(events: GameEvent[]): void {
  for (const e of events) {
    if (e.type === "play") tone(520, 0.12, "triangle");
    if (e.type === "draw") tone(220, 0.14, "square", 0.04);
    if (e.type === "skip") tone(180, 0.2, "sawtooth", 0.04);
    if (e.type === "reverse") {
      tone(400, 0.1);
      setTimeout(() => tone(560, 0.1), 80);
    }
    if (e.type === "uno") tone(880, 0.18, "square", 0.05);
    if (e.type === "caught") tone(140, 0.3, "sawtooth", 0.05);
    if (e.type === "win" || e.type === "teamWin") {
      tone(523, 0.15);
      setTimeout(() => tone(659, 0.15), 120);
      setTimeout(() => tone(784, 0.25), 240);
    }
    if (e.type === "chaos" || e.type === "rotate" || e.type === "exchange") {
      tone(300, 0.12);
      setTimeout(() => tone(480, 0.16), 90);
    }
    if (e.type === "extraTurn") tone(760, 0.12, "triangle", 0.05);
    if (e.type === "spy" || e.type === "king" || e.type === "gift" || e.type === "target" || e.type === "bomb") {
      tone(500, 0.1, "square", 0.04);
    }
  }
}
