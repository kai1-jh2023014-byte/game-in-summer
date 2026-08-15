import { describe, expect, it } from "vitest";
import { canPlay } from "./deck.js";
import { catchUno, drawCard, getPlayer, playCard } from "./engine.js";
import { createEmptyState, makePlayer } from "./rooms.js";
import type { Card, GameState } from "./types.js";

function lobby(n: number): GameState {
  const host = makePlayer("p0", "Host", true);
  const state = createEmptyState("TEST", host);
  for (let i = 1; i < n; i++) state.players.push(makePlayer(`p${i}`, `P${i}`, false));
  state.status = "playing";
  state.phase = "play";
  state.currentPlayerId = "p0";
  state.currentColor = "red";
  state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
  state.deck = Array.from({ length: 20 }, (_, i) => ({
    id: `d${i}`,
    type: "number" as const,
    color: "blue" as const,
    value: i % 9,
  }));
  return state;
}

function give(state: GameState, id: string, cards: Card[]): void {
  getPlayer(state, id)!.hand = cards;
}

describe("draw stacking", () => {
  it("stacks +2 onto +2 and the last player draws the total", () => {
    const state = lobby(3);
    give(state, "p0", [{ id: "a", type: "draw2", color: "red" }, { id: "k0", type: "number", color: "green", value: 3 }]);
    give(state, "p1", [{ id: "b", type: "draw2", color: "blue" }, { id: "k1", type: "number", color: "green", value: 4 }]);
    give(state, "p2", [{ id: "k2", type: "number", color: "green", value: 5 }]);
    expect(playCard(state, "p0", "a").ok).toBe(true);
    expect(state.pendingDraw).toBe(2);
    expect(state.currentPlayerId).toBe("p1");
    expect(playCard(state, "p1", "b").ok).toBe(true);
    expect(state.pendingDraw).toBe(4);
    expect(state.currentPlayerId).toBe("p2");
    expect(playCard(state, "p2", "k2").ok).toBe(false);
    const drawn = drawCard(state, "p2");
    expect(drawn.ok).toBe(true);
    expect(getPlayer(state, "p2")!.hand.length).toBe(5);
    expect(state.pendingDraw).toBe(0);
    expect(state.currentPlayerId).toBe("p0");
  });

  it("allows mixing +2 and +4", () => {
    const state = lobby(3);
    give(state, "p0", [{ id: "a", type: "draw2", color: "red" }, { id: "k0", type: "number", color: "green", value: 3 }]);
    give(state, "p1", [{ id: "b", type: "wildDraw4", color: "black" }, { id: "k1", type: "number", color: "green", value: 4 }]);
    give(state, "p2", [{ id: "k2", type: "number", color: "green", value: 5 }]);
    playCard(state, "p0", "a");
    expect(playCard(state, "p1", "b", "yellow").ok).toBe(true);
    expect(state.pendingDraw).toBe(6);
    drawCard(state, "p2");
    expect(getPlayer(state, "p2")!.hand.length).toBe(7);
  });

  it("rejects a normal card while a stack is pending", () => {
    const state = lobby(2);
    give(state, "p0", [{ id: "a", type: "draw2", color: "red" }, { id: "k", type: "number", color: "red", value: 9 }]);
    give(state, "p1", [{ id: "n", type: "number", color: "red", value: 4 }]);
    playCard(state, "p0", "a");
    expect(playCard(state, "p1", "n").ok).toBe(false);
  });
});

describe("same-number multi play", () => {
  it("plays two matching numbers together", () => {
    const state = lobby(2);
    give(state, "p0", [
      { id: "r7", type: "number", color: "red", value: 7 },
      { id: "b7", type: "number", color: "blue", value: 7 },
      { id: "keep", type: "number", color: "green", value: 1 },
    ]);
    const result = playCard(state, "p0", "r7", undefined, false, Math.random, { extraCardIds: ["b7"] });
    expect(result.ok).toBe(true);
    expect(getPlayer(state, "p0")!.hand.map((c) => c.id)).toEqual(["keep"]);
    expect(state.discard.at(-1)?.id).toBe("b7");
    expect(state.currentColor).toBe("blue");
    expect(result.ok && result.events.some((e) => e.type === "multi")).toBe(true);
  });

  it("rejects mixed numbers or action cards", () => {
    const state = lobby(2);
    give(state, "p0", [
      { id: "r7", type: "number", color: "red", value: 7 },
      { id: "r8", type: "number", color: "red", value: 8 },
      { id: "s", type: "skip", color: "red" },
    ]);
    expect(playCard(state, "p0", "r7", undefined, false, Math.random, { extraCardIds: ["r8"] }).ok).toBe(false);
    expect(playCard(state, "p0", "s", undefined, false, Math.random, { extraCardIds: ["r7"] }).ok).toBe(false);
  });

  it("rejects cards not in hand", () => {
    const state = lobby(2);
    give(state, "p0", [{ id: "r7", type: "number", color: "red", value: 7 }]);
    expect(playCard(state, "p0", "r7", undefined, false, Math.random, { extraCardIds: ["nope"] }).ok).toBe(false);
  });

  it("allows team-mode multi play even if the first card is the off-color", () => {
    const state = lobby(4);
    state.teamMode = true;
    state.teamCount = 2;
    state.players[0]!.teamId = "a";
    state.players[1]!.teamId = "a";
    state.players[2]!.teamId = "b";
    state.players[3]!.teamId = "b";
    give(state, "p0", [
      { id: "b7", type: "number", color: "blue", value: 7 },
      { id: "r7", type: "number", color: "red", value: 7 },
      { id: "keep", type: "number", color: "green", value: 1 },
    ]);
    const result = playCard(state, "p0", "b7", undefined, false, Math.random, { extraCardIds: ["r7"] });
    expect(result.ok).toBe(true);
    expect(getPlayer(state, "p0")!.hand.map((c) => c.id)).toEqual(["keep"]);
    expect(state.currentColor).toBe("red");
  });
});

describe("UNO catch window", () => {
  it("opens a short window when going to 1 card without UNO", () => {
    const state = lobby(2);
    give(state, "p0", [
      { id: "a", type: "number", color: "red", value: 3 },
      { id: "b", type: "number", color: "red", value: 4 },
    ]);
    playCard(state, "p0", "a", undefined, false);
    const p0 = getPlayer(state, "p0")!;
    expect(p0.hand.length).toBe(1);
    expect(p0.calledUno).toBe(false);
    expect(p0.unoCatchUntil).toBeGreaterThan(Date.now());
    expect(catchUno(state, "p1", "p0").ok).toBe(true);
    expect(p0.hand.length).toBe(2);
  });

  it("rejects catch after UNO, after expiry, self, or wrong count", () => {
    const state = lobby(2);
    give(state, "p0", [{ id: "a", type: "number", color: "red", value: 3 }]);
    getPlayer(state, "p0")!.unoCatchUntil = Date.now() + 3000;
    expect(catchUno(state, "p0", "p0").ok).toBe(false);
    playCard(state, "p0", "a", undefined, true);
    expect(state.status).toBe("finished");
    const s2 = lobby(2);
    give(s2, "p0", [{ id: "h", type: "number", color: "red", value: 2 }]);
    getPlayer(s2, "p0")!.unoCatchUntil = Date.now() - 10;
    expect(catchUno(s2, "p1", "p0").ok).toBe(false);
    getPlayer(s2, "p0")!.unoCatchUntil = Date.now() + 3000;
    getPlayer(s2, "p0")!.calledUno = true;
    expect(catchUno(s2, "p1", "p0").ok).toBe(false);
    getPlayer(s2, "p0")!.calledUno = false;
    give(s2, "p0", [
      { id: "h", type: "number", color: "red", value: 2 },
      { id: "h2", type: "number", color: "blue", value: 2 },
    ]);
    expect(catchUno(s2, "p1", "p0").ok).toBe(false);
  });

  it("only the first catch succeeds", () => {
    const state = lobby(3);
    give(state, "p0", [{ id: "h", type: "number", color: "red", value: 2 }]);
    getPlayer(state, "p0")!.unoCatchUntil = Date.now() + 3000;
    expect(catchUno(state, "p1", "p0").ok).toBe(true);
    expect(catchUno(state, "p2", "p0").ok).toBe(false);
  });
});

describe("canPlay during stack", () => {
  it("only allows +2 and +4", () => {
    const top = { id: "t", type: "number" as const, color: "red" as const, value: 1 };
    expect(canPlay({ id: "n", type: "number", color: "red", value: 9 }, top, "red", 4)).toBe(false);
    expect(canPlay({ id: "d", type: "draw2", color: "blue" }, top, "red", 4)).toBe(true);
    expect(canPlay({ id: "w", type: "wildDraw4", color: "black" }, top, "red", 4)).toBe(true);
    expect(canPlay({ id: "s", type: "skip", color: "red" }, top, "red", 4)).toBe(false);
  });
});
