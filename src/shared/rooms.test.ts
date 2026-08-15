import { describe, expect, it } from "vitest";
import { RoomManager } from "./rooms.js";
import { canPlay, isWild } from "./deck.js";

describe("RoomManager", () => {
  it("creates a short room code and names the host", () => {
    const mgr = new RoomManager();
    const result = mgr.create("p1", "Kabuya");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(result.state.players[0]!.isHost).toBe(true);
    expect(result.state.players[0]!.name).toBe("Kabuya");
  });

  it("lets 7 players join a lobby", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "P1");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const code = created.state.code;
    for (let i = 2; i <= 7; i++) {
      const join = mgr.join(code, `p${i}`, `P${i}`);
      expect(join.ok).toBe(true);
    }
    expect(mgr.get(code)?.players).toHaveLength(7);
  });

  it("rejects a missing room and a mid-game join from a new player", () => {
    const mgr = new RoomManager();
    expect(mgr.join("ZZZZ", "x", "X").ok).toBe(false);
    const created = mgr.create("p1", "P1");
    if (!created.ok) return;
    mgr.join(created.state.code, "p2", "P2");
    expect(mgr.startGame(created.state.code, "p1").ok).toBe(true);
    expect(mgr.join(created.state.code, "p3", "P3").ok).toBe(false);
  });

  it("reconnects the same player during a game", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "P1");
    if (!created.ok) return;
    mgr.join(created.state.code, "p2", "P2");
    mgr.startGame(created.state.code, "p1");
    const again = mgr.join(created.state.code, "p2", "P2-renamed");
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.reconnected).toBe(true);
    expect(mgr.get(created.state.code)?.players.find((p) => p.id === "p2")?.name).toBe("P2-renamed");
  });

  it("only the host can start, then host transfers on leave", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "P1");
    if (!created.ok) return;
    const code = created.state.code;
    mgr.join(code, "p2", "P2");
    expect(mgr.startGame(code, "p2").ok).toBe(false);
    mgr.leave(code, "p1");
    const state = mgr.get(code)!;
    expect(state.players.find((p) => p.id === "p2")?.isHost).toBe(true);
  });

  it("randomizes teams and allows manual moves", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "P1");
    if (!created.ok) return;
    const code = created.state.code;
    for (let i = 2; i <= 7; i++) mgr.join(code, `p${i}`, `P${i}`);
    expect(mgr.randomizeTeams(code, "p1").ok).toBe(true);
    expect(mgr.get(code)?.teamMode).toBe(true);
    const target = mgr.get(code)!.players[3]!;
    const dest = target.teamId === "a" ? "b" : "a";
    expect(mgr.moveTeam(code, "p1", target.id, dest).ok).toBe(true);
    expect(mgr.get(code)?.players.find((p) => p.id === target.id)?.teamId).toBe(dest);
  });

  it("lets the host set card volume and lots of specials", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "P1");
    if (!created.ok) return;
    const code = created.state.code;
    mgr.join(code, "p2", "P2");
    expect(mgr.setCardVolume(code, "p2", "high").ok).toBe(false);
    expect(mgr.setCardVolume(code, "p1", "high").ok).toBe(true);
    expect(mgr.get(code)?.cardVolume).toBe("high");
    expect(mgr.setSpecialMix(code, "p1", "lots").ok).toBe(true);
    expect(mgr.get(code)?.specialMix).toBe("lots");
    expect(mgr.get(code)?.mode).toBe("party");
    expect(mgr.startGame(code, "p1").ok).toBe(true);
    expect(mgr.get(code)?.players.every((p) => p.hand.length === 9)).toBe(true);
  });

  it("rejects illegal plays through the room API", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "P1");
    if (!created.ok) return;
    mgr.join(created.state.code, "p2", "P2");
    mgr.startGame(created.state.code, "p1");
    const state = mgr.get(created.state.code)!;
    const current = state.currentPlayerId!;
    const other = state.players.find((p) => p.id !== current)!.id;
    expect(mgr.play(created.state.code, other, state.players[0]!.hand[0]!.id).ok).toBe(false);
    expect(mgr.play(created.state.code, current, "nope").ok).toBe(false);
  });
});

describe("7-player simulation", () => {
  it("plays a full game with 7 bots until there is a winner", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "Player 1");
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const code = created.state.code;
    for (let i = 2; i <= 7; i++) {
      expect(mgr.join(code, `p${i}`, `Player ${i}`).ok).toBe(true);
    }
    expect(mgr.randomizeTeams(code, "p1").ok).toBe(true);
    expect(mgr.startGame(code, "p1").ok).toBe(true);

    const firstView = mgr.viewFor(mgr.get(code)!, "p2");
    expect(firstView.you.hand.length).toBe(7);
    expect(JSON.stringify(firstView.players.find((p) => p.id === "p1"))).not.toMatch(/"type":/);

    let guard = 0;
    while (mgr.get(code)!.status === "playing" && guard < 4000) {
      guard += 1;
      const state = mgr.get(code)!;
      const playerId = state.currentPlayerId!;
      const view = mgr.viewFor(state, playerId);
      if (view.drawnCard) {
        const color = isWild(view.drawnCard) ? "red" : undefined;
        const played = mgr.play(code, playerId, view.drawnCard.id, color, view.you.hand.length <= 1);
        if (!played.ok) mgr.keep(code, playerId);
        continue;
      }
      const playable = view.you.hand.filter(
        (c) =>
          view.topCard &&
          view.currentColor &&
          canPlay(c, view.topCard, view.currentColor, view.pendingDraw),
      );
      if (playable[0]) {
        const card = playable[0];
        const color = isWild(card) ? "blue" : undefined;
        const result = mgr.play(code, playerId, card.id, color, view.you.hand.length <= 2);
        expect(result.ok).toBe(true);
      } else {
        expect(mgr.draw(code, playerId).ok).toBe(true);
      }
    }

    const end = mgr.get(code)!;
    expect(end.status).toBe("finished");
    expect(end.winnerId).toBeTruthy();
    expect(end.winningTeamId).toBeTruthy();
    expect(end.rankings[0]?.place).toBe(1);
    expect(guard).toBeLessThan(4000);
  });

  it("keeps the game alive when one of 7 players disconnects", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "P1");
    if (!created.ok) return;
    const code = created.state.code;
    for (let i = 2; i <= 7; i++) mgr.join(code, `p${i}`, `P${i}`);
    mgr.bindSocket(code, "p3", "sock3");
    mgr.startGame(code, "p1");
    const dropped = mgr.disconnect("sock3");
    expect(dropped?.state.players).toHaveLength(7);
    expect(dropped?.state.players.find((p) => p.id === "p3")?.connected).toBe(false);
    expect(mgr.get(code)?.status).toBe("playing");
    expect(mgr.timeoutTurn(code, mgr.get(code)!.currentPlayerId!).ok).toBe(true);
  });
});
