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

export function unlockAudio(): void {
  audio();
}

function envGain(ac: AudioContext, start: number, peak: number, dur: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  return g;
}

function beep(freq: number, dur: number, type: OscillatorType = "triangle", peak = 0.05, delay = 0): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = envGain(ac, t, peak, dur);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function sweep(from: number, to: number, dur: number, type: OscillatorType = "sawtooth", peak = 0.04): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const g = envGain(ac, t, peak, dur);
  osc.type = type;
  osc.frequency.setValueAtTime(from, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, peak = 0.03): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const g = envGain(ac, t, peak, dur);
  const filter = ac.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 800;
  src.connect(filter);
  filter.connect(g);
  g.connect(ac.destination);
  src.start(t);
  src.stop(t + dur);
}

function chord(freqs: number[], dur: number, peak = 0.03): void {
  for (const f of freqs) beep(f, dur, "triangle", peak / freqs.length);
}

export function playEventSounds(events: GameEvent[]): void {
  if (isMuted() || !events.length) return;
  let playedCard = false;
  for (const e of events) {
    if (e.type === "play") {
      if (playedCard) continue;
      playedCard = true;
      const t = e.card.type;
      if (t === "number") noise(0.08, 0.025);
      else if (t === "skip") beep(180, 0.18, "square", 0.04);
      else if (t === "reverse") {
        sweep(420, 220, 0.22);
        beep(560, 0.12, "triangle", 0.04, 0.12);
      } else if (t === "draw2") {
        noise(0.12, 0.04);
        beep(240, 0.16, "square", 0.045);
      } else if (t === "wildDraw4") {
        noise(0.16, 0.05);
        beep(160, 0.22, "sawtooth", 0.05);
        beep(320, 0.16, "square", 0.03, 0.08);
      } else if (t === "wild") chord([523, 659, 784], 0.2, 0.04);
      else if (t === "rotate") sweep(300, 520, 0.2);
      else if (t === "chaos") {
        sweep(180, 480, 0.18);
        sweep(480, 180, 0.18);
      } else if (t === "exchange") {
        beep(360, 0.1);
        beep(280, 0.12, "triangle", 0.04, 0.1);
      } else if (t === "gift") beep(620, 0.12, "sine", 0.04);
      else if (t === "bomb") {
        noise(0.2, 0.05);
        beep(90, 0.2, "sawtooth", 0.04);
      } else if (t === "king") chord([392, 523], 0.18, 0.04);
      else if (t === "spy") beep(880, 0.08, "square", 0.03);
      else if (t === "target") beep(500, 0.12, "triangle", 0.04);
      else noise(0.08, 0.02);
    }
    if (e.type === "stack") {
      beep(200, 0.1, "square", 0.04);
      beep(300, 0.12, "square", 0.04, 0.08);
    }
    if (e.type === "uno") chord([784, 988, 1174], 0.22, 0.045);
    if (e.type === "caught") {
      beep(140, 0.22, "sawtooth", 0.05);
      noise(0.16, 0.04);
    }
    if (e.type === "win" || e.type === "teamWin") {
      chord([523, 659, 784], 0.18, 0.04);
      beep(1046, 0.22, "triangle", 0.04, 0.16);
    }
    if (e.type === "draw" && e.count >= 2) beep(200, 0.12, "square", 0.03);
  }
}
