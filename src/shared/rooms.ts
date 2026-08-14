import type { Color, GameEvent, GameMode, GameState, Player, PlayExtras, SecretPayload, TeamId } from "./types.js";
import { MAX_PLAYERS, MIN_PLAYERS } from "./types.js";
import {
  callUno,
  catchUno,
  dealAndStart,
  drawCard,
  forcePass,
  keepDrawn,
  playCard,
  returnToLobby,
} from "./engine.js";
import { assignBalancedTeams, makeTeams, movePlayerToTeam } from "./teams.js";
import { sanitizeFor } from "./sanitize.js";
import type { ActionResult } from "./types.js";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(existing: Set<string>): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]!;
    }
    if (!existing.has(code)) return code;
  }
  return `X${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

export function createEmptyState(code: string, host: Player): GameState {
  return {
    code,
    status: "lobby",
    phase: "lobby",
    players: [host],
    teams: makeTeams(2),
    teamMode: false,
    teamCount: 2,
    deck: [],
    discard: [],
    currentPlayerId: null,
    direction: 1,
    currentColor: null,
    drawnCard: null,
    winnerId: null,
    winningTeamId: null,
    rankings: [],
    gameNumber: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    mode: "classic",
    specialRules: [],
    luckyNumber: null,
    bonusAction: false,
    chaosUsed: false,
  };
}

export function makePlayer(id: string, name: string, isHost: boolean): Player {
  const trimmed = name.trim().slice(0, 16) || "プレイヤー";
  return {
    id,
    name: trimmed,
    socketId: null,
    hand: [],
    calledUno: false,
    connected: true,
    teamId: null,
    isHost,
    winCount: 0,
  };
}

export type RoomResult =
  | { ok: true; state: GameState; events: GameEvent[]; reconnected?: boolean; secrets?: SecretPayload[] }
  | { ok: false; error: string };

function asRoom(result: ActionResult, state: GameState): RoomResult {
  if (!result.ok) return result;
  state.updatedAt = Date.now();
  return { ok: true, state, events: result.events, secrets: result.secrets };
}

export class RoomManager {
  readonly rooms = new Map<string, GameState>();

  get(code: string): GameState | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  create(playerId: string, name: string): RoomResult {
    const code = generateCode(new Set(this.rooms.keys()));
    const host = makePlayer(playerId, name, true);
    const state = createEmptyState(code, host);
    this.rooms.set(code, state);
    return { ok: true, state, events: [{ type: "host", playerId }] };
  }

  join(code: string, playerId: string, name: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };

    const existing = state.players.find((p) => p.id === playerId);
    if (existing) {
      existing.connected = true;
      if (name.trim()) existing.name = name.trim().slice(0, 16);
      state.updatedAt = Date.now();
      return { ok: true, state, events: [], reconnected: true };
    }

    if (state.status !== "lobby") {
      return { ok: false, error: "ゲームはすでに始まっています" };
    }
    if (state.players.length >= MAX_PLAYERS) {
      return { ok: false, error: "このルームは満員です" };
    }

    state.players.push(makePlayer(playerId, name, false));
    state.updatedAt = Date.now();
    return { ok: true, state, events: [] };
  }

  bindSocket(code: string, playerId: string, socketId: string): void {
    const player = this.get(code)?.players.find((p) => p.id === playerId);
    if (player) {
      player.socketId = socketId;
      player.connected = true;
    }
  }

  transferHost(state: GameState): GameEvent[] {
    const events: GameEvent[] = [];
    const host = state.players.find((p) => p.isHost);
    if (host && host.connected) return events;
    for (const p of state.players) p.isHost = false;
    const next = state.players.find((p) => p.connected) ?? state.players[0];
    if (next) {
      next.isHost = true;
      events.push({ type: "host", playerId: next.id });
    }
    return events;
  }

  disconnect(socketId: string): { state: GameState; events: GameEvent[] } | null {
    for (const state of this.rooms.values()) {
      const player = state.players.find((p) => p.socketId === socketId);
      if (!player) continue;
      player.connected = false;
      player.socketId = null;
      state.updatedAt = Date.now();
      const events = this.transferHost(state);
      return { state, events };
    }
    return null;
  }

  leave(code: string, playerId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    const idx = state.players.findIndex((p) => p.id === playerId);
    if (idx < 0) return { ok: false, error: "このルームにいません" };

    if (state.status === "playing") {
      const player = state.players[idx]!;
      player.connected = false;
      player.socketId = null;
      const events = this.transferHost(state);
      return { ok: true, state, events };
    }

    const wasHost = state.players[idx]!.isHost;
    state.players.splice(idx, 1);
    if (state.players.length === 0) {
      this.rooms.delete(state.code);
      return { ok: true, state, events: [] };
    }
    const events = wasHost ? this.transferHost(state) : [];
    state.updatedAt = Date.now();
    return { ok: true, state, events };
  }

  requireHost(state: GameState, playerId: string): string | null {
    const player = state.players.find((p) => p.id === playerId);
    if (!player?.isHost) return "ホストだけが操作できます";
    return null;
  }

  setTeamMode(code: string, playerId: string, enabled: boolean): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    if (state.status !== "lobby") return { ok: false, error: "ロビーでのみ変更できます" };
    const hostErr = this.requireHost(state, playerId);
    if (hostErr) return { ok: false, error: hostErr };
    state.teamMode = enabled;
    if (enabled) {
      state.teams = makeTeams(state.teamCount);
      if (!state.players.every((p) => p.teamId)) {
        assignBalancedTeams(state.players, state.teamCount);
      }
    } else {
      for (const p of state.players) p.teamId = null;
    }
    state.updatedAt = Date.now();
    return { ok: true, state, events: [] };
  }

  setTeamCount(code: string, playerId: string, count: number): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    if (state.status !== "lobby") return { ok: false, error: "ロビーでのみ変更できます" };
    const hostErr = this.requireHost(state, playerId);
    if (hostErr) return { ok: false, error: hostErr };
    const n = Math.min(4, Math.max(2, Math.floor(count)));
    state.teamCount = n;
    state.teams = makeTeams(n);
    if (state.teamMode) assignBalancedTeams(state.players, n);
    state.updatedAt = Date.now();
    return { ok: true, state, events: [] };
  }

  randomizeTeams(code: string, playerId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    if (state.status !== "lobby") return { ok: false, error: "ロビーでのみ変更できます" };
    const hostErr = this.requireHost(state, playerId);
    if (hostErr) return { ok: false, error: hostErr };
    state.teamMode = true;
    state.teams = makeTeams(state.teamCount);
    assignBalancedTeams(state.players, state.teamCount);
    state.updatedAt = Date.now();
    return { ok: true, state, events: [] };
  }

  moveTeam(code: string, hostId: string, playerId: string, teamId: TeamId): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    if (state.status !== "lobby") return { ok: false, error: "ロビーでのみ変更できます" };
    const hostErr = this.requireHost(state, hostId);
    if (hostErr) return { ok: false, error: hostErr };
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return { ok: false, error: "プレイヤーが見つかりません" };
    state.teamMode = true;
    if (!movePlayerToTeam(player, teamId, state.teams)) {
      return { ok: false, error: "そのチームには移せません" };
    }
    state.updatedAt = Date.now();
    return { ok: true, state, events: [] };
  }

  setMode(code: string, playerId: string, mode: GameMode): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    if (state.status !== "lobby") return { ok: false, error: "ロビーでのみ変更できます" };
    const hostErr = this.requireHost(state, playerId);
    if (hostErr) return { ok: false, error: hostErr };
    state.mode = mode === "party" ? "party" : "classic";
    state.updatedAt = Date.now();
    return { ok: true, state, events: [] };
  }

  startGame(code: string, playerId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    if (state.status === "playing") return { ok: false, error: "すでにゲーム中です" };
    const hostErr = this.requireHost(state, playerId);
    if (hostErr) return { ok: false, error: hostErr };
    if (state.players.length < MIN_PLAYERS) {
      return { ok: false, error: "2人以上いないと始められません" };
    }
    return asRoom(dealAndStart(state), state);
  }

  play(
    code: string,
    playerId: string,
    cardId: string,
    color?: Color,
    sayUno?: boolean,
    extras: PlayExtras = {},
  ): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    return asRoom(playCard(state, playerId, cardId, color, sayUno, Math.random, extras), state);
  }

  draw(code: string, playerId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    return asRoom(drawCard(state, playerId), state);
  }

  keep(code: string, playerId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    return asRoom(keepDrawn(state, playerId), state);
  }

  uno(code: string, playerId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    return asRoom(callUno(state, playerId), state);
  }

  catch(code: string, byPlayerId: string, targetId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    return asRoom(catchUno(state, byPlayerId, targetId), state);
  }

  timeoutTurn(code: string, playerId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    return asRoom(forcePass(state, playerId), state);
  }

  playAgain(code: string, playerId: string): RoomResult {
    return this.startGame(code, playerId);
  }

  toLobby(code: string, playerId: string): RoomResult {
    const state = this.get(code);
    if (!state) return { ok: false, error: "ルームが見つかりません" };
    const hostErr = this.requireHost(state, playerId);
    if (hostErr) return { ok: false, error: hostErr };
    returnToLobby(state);
    return { ok: true, state, events: [] };
  }

  viewFor(state: GameState, playerId: string) {
    return sanitizeFor(state, playerId);
  }

  prune(maxAgeMs = 1000 * 60 * 60 * 3): number {
    const now = Date.now();
    let removed = 0;
    for (const [code, state] of this.rooms) {
      const idle = now - state.updatedAt;
      const allGone = state.players.every((p) => !p.connected);
      if (idle > maxAgeMs || (allGone && idle > 1000 * 60 * 30)) {
        this.rooms.delete(code);
        removed += 1;
      }
    }
    return removed;
  }
}
