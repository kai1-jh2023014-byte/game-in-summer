import type { Server, Socket } from "socket.io";
import type { Color, GameEvent, GameMode, PlayExtras, TeamId } from "../shared/types.js";
import type { RoomManager, RoomResult } from "../shared/rooms.js";

export type Ack = { ok: true } | { ok: false; error: string };

const TURN_MS = 90_000;
const SPEED_TURN_MS = 30_000;
const DISCONNECT_TURN_MS = 20_000;

interface Session {
  playerId: string;
  code: string;
}

export function attachSockets(io: Server, manager: RoomManager): void {
  const sessions = new Map<string, Session>();
  const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearTurn(code: string): void {
    const t = turnTimers.get(code);
    if (t) clearTimeout(t);
    turnTimers.delete(code);
  }

  function broadcast(code: string, events: GameEvent[] = []): void {
    const state = manager.get(code);
    if (!state) return;
    for (const player of state.players) {
      if (!player.socketId) continue;
      io.to(player.socketId).emit("room:state", manager.viewFor(state, player.id));
    }
    if (events.length) {
      io.to(code).emit("game:event", events);
    }
    scheduleTurn(code);
  }

  function sendSecrets(result: RoomResult): void {
    if (!result.ok || !result.secrets?.length) return;
    for (const secret of result.secrets) {
      const player = result.state.players.find((p) => p.id === secret.to);
      if (!player?.socketId) continue;
      io.to(player.socketId).emit("game:secret", secret);
    }
  }

  function scheduleTurn(code: string): void {
    clearTurn(code);
    const state = manager.get(code);
    if (!state || state.status !== "playing" || !state.currentPlayerId) return;
    const current = state.players.find((p) => p.id === state.currentPlayerId);
    if (!current) return;
    const wait = current.connected
      ? state.mode === "party" && state.specialRules.includes("speed")
        ? SPEED_TURN_MS
        : TURN_MS
      : DISCONNECT_TURN_MS;
    const playerId = current.id;
    const timer = setTimeout(() => {
      const result = manager.timeoutTurn(code, playerId);
      if (result.ok) broadcast(code, result.events);
    }, wait);
    timer.unref();
    turnTimers.set(code, timer);
  }

  function reply(socket: Socket, result: RoomResult, ack?: (a: Ack) => void): void {
    if (!result.ok) {
      socket.emit("room:error", result.error);
      ack?.({ ok: false, error: result.error });
      return;
    }
    const session = sessions.get(socket.id);
    if (session) {
      socket.join(result.state.code);
      manager.bindSocket(result.state.code, session.playerId, socket.id);
    }
    const playerId = session?.playerId;
    if (playerId) {
      // ack より先に本人へ状態を返す（スマホの ack 待ちで止まらないようにする）
      socket.emit("room:state", manager.viewFor(result.state, playerId));
    }
    ack?.({ ok: true });
    sendSecrets(result);
    broadcast(result.state.code, result.events);
  }

  io.on("connection", (socket) => {
    socket.emit("server:hello", { ok: true });

    socket.on(
      "room:create",
      ({ name, playerId }: { name: string; playerId: string }, ack?: (a: Ack) => void) => {
        try {
          if (!playerId || !name?.trim()) {
            ack?.({ ok: false, error: "名前を入力してください" });
            return;
          }
          const result = manager.create(playerId, name);
          if (result.ok) {
            sessions.set(socket.id, { playerId, code: result.state.code });
            socket.join(result.state.code);
            manager.bindSocket(result.state.code, playerId, socket.id);
            console.log(`room:create ${result.state.code} by ${name.trim()}`);
          }
          reply(socket, result, ack);
        } catch (err) {
          console.error("room:create failed", err);
          ack?.({ ok: false, error: "ルームを作れませんでした" });
        }
      },
    );

    socket.on(
      "room:join",
      (
        { code, name, playerId }: { code: string; name: string; playerId: string },
        ack?: (a: Ack) => void,
      ) => {
        try {
          if (!playerId || !name?.trim() || !code?.trim()) {
            ack?.({ ok: false, error: "名前とルームコードを入力してください" });
            return;
          }
          const result = manager.join(code.trim().toUpperCase(), playerId, name);
          if (result.ok) {
            sessions.set(socket.id, { playerId, code: result.state.code });
            socket.join(result.state.code);
            manager.bindSocket(result.state.code, playerId, socket.id);
            console.log(`room:join ${result.state.code} by ${name.trim()}`);
          }
          reply(socket, result, ack);
        } catch (err) {
          console.error("room:join failed", err);
          ack?.({ ok: false, error: "ルームに入れませんでした" });
        }
      },
    );

    socket.on("room:leave", (ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) {
        ack?.({ ok: true });
        return;
      }
      const result = manager.leave(session.code, session.playerId);
      sessions.delete(socket.id);
      socket.leave(session.code);
      ack?.({ ok: true });
      if (result.ok && manager.get(session.code)) {
        broadcast(session.code, result.events);
      }
    });

    socket.on(
      "lobby:teamMode",
      ({ enabled }: { enabled: boolean }, ack?: (a: Ack) => void) => {
        const session = sessions.get(socket.id);
        if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
        reply(socket, manager.setTeamMode(session.code, session.playerId, enabled), ack);
      },
    );

    socket.on("lobby:teamCount", ({ count }: { count: number }, ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.setTeamCount(session.code, session.playerId, count), ack);
    });

    socket.on("lobby:randomTeams", (ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.randomizeTeams(session.code, session.playerId), ack);
    });

    socket.on("lobby:mode", ({ mode }: { mode: GameMode }, ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.setMode(session.code, session.playerId, mode), ack);
    });

    socket.on(
      "lobby:moveTeam",
      ({ playerId, teamId }: { playerId: string; teamId: TeamId }, ack?: (a: Ack) => void) => {
        const session = sessions.get(socket.id);
        if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
        reply(socket, manager.moveTeam(session.code, session.playerId, playerId, teamId), ack);
      },
    );

    socket.on("game:start", (ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.startGame(session.code, session.playerId), ack);
    });

    socket.on(
      "game:play",
      (
        {
          cardId,
          color,
          sayUno,
          targetPlayerId,
          giftCardId,
        }: { cardId: string; color?: Color; sayUno?: boolean } & PlayExtras,
        ack?: (a: Ack) => void,
      ) => {
        const session = sessions.get(socket.id);
        if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
        reply(
          socket,
          manager.play(session.code, session.playerId, cardId, color, sayUno, {
            targetPlayerId,
            giftCardId,
          }),
          ack,
        );
      },
    );

    socket.on("game:draw", (ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.draw(session.code, session.playerId), ack);
    });

    socket.on("game:keep", (ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.keep(session.code, session.playerId), ack);
    });

    socket.on("game:uno", (ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.uno(session.code, session.playerId), ack);
    });

    socket.on("game:catch", ({ targetId }: { targetId: string }, ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.catch(session.code, session.playerId, targetId), ack);
    });

    socket.on("game:again", (ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.playAgain(session.code, session.playerId), ack);
    });

    socket.on("game:lobby", (ack?: (a: Ack) => void) => {
      const session = sessions.get(socket.id);
      if (!session) return ack?.({ ok: false, error: "ルームに参加してください" });
      reply(socket, manager.toLobby(session.code, session.playerId), ack);
    });

    socket.on("disconnect", () => {
      const session = sessions.get(socket.id);
      sessions.delete(socket.id);
      const dropped = manager.disconnect(socket.id);
      if (dropped) broadcast(dropped.state.code, dropped.events);
      else if (session && manager.get(session.code)) {
        broadcast(session.code, []);
      }
    });
  });

  setInterval(() => manager.prune(), 60_000).unref();
}
