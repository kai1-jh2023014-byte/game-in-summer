import { describe, expect, it } from "vitest";
import {
  callUno,
  catchUno,
  dealAndStart,
  drawCard,
  forcePass,
  getPlayer,
  keepDrawn,
  nextPlayerId,
  playCard,
  returnToLobby,
  topCard,
} from "./engine.js";
import { createEmptyState, makePlayer } from "./rooms.js";
import { sanitizeFor } from "./sanitize.js";
import type { Card, GameState } from "./types.js";

function seedRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function lobby(n: number): GameState {
  const host = makePlayer("p0", "Host", true);
  const state = createEmptyState("TEST", host);
  for (let i = 1; i < n; i++) state.players.push(makePlayer(`p${i}`, `P${i}`, false));
  return state;
}

function give(state: GameState, playerId: string, cards: Card[]): void {
  const p = getPlayer(state, playerId)!;
  p.hand = cards;
}

describe("engine start", () => {
  it("deals 7 cards to each player and a number starter", () => {
    const state = lobby(7);
    const result = dealAndStart(state, seedRng(7));
    expect(result.ok).toBe(true);
    expect(state.status).toBe("playing");
    expect(state.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(topCard(state)?.type).toBe("number");
    expect(state.currentColor).toBeTruthy();
    expect(state.deck.length).toBe(108 - 7 * 7 - 1);
  });

  it("refuses to start with one player", () => {
    const state = lobby(1);
    const result = dealAndStart(state);
    expect(result.ok).toBe(false);
  });
});

describe("play and turn", () => {
  it("rejects playing out of turn and cards not in hand", () => {
    const state = lobby(3);
    dealAndStart(state, seedRng(1));
    const current = state.currentPlayerId!;
    const other = state.players.find((p) => p.id !== current)!.id;
    expect(playCard(state, other, state.players[0]!.hand[0]!.id).ok).toBe(false);
    expect(playCard(state, current, "missing").ok).toBe(false);
  });

  it("plays a matching color card and advances turn", () => {
    const state = lobby(3);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [{ id: "a", type: "number", color: "red", value: 9 }]);
    give(state, "p1", [{ id: "b", type: "number", color: "blue", value: 2 }]);
    give(state, "p2", [{ id: "c", type: "number", color: "green", value: 3 }]);
    const result = playCard(state, "p0", "a");
    expect(result.ok).toBe(true);
    expect(topCard(state)?.id).toBe("a");
    expect(getPlayer(state, "p0")!.hand).toHaveLength(0);
    expect(state.status).toBe("finished");
    expect(state.winnerId).toBe("p0");
    expect(state.rankings[0]?.playerId).toBe("p0");
  });

  it("skip jumps the next player", () => {
    const state = lobby(3);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.direction = 1;
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [
      { id: "s", type: "skip", color: "red" },
      { id: "keep", type: "number", color: "blue", value: 1 },
    ]);
    playCard(state, "p0", "s");
    expect(state.currentPlayerId).toBe("p2");
  });

  it("reverse flips direction", () => {
    const state = lobby(3);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.direction = 1;
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [
      { id: "r", type: "reverse", color: "red" },
      { id: "keep", type: "number", color: "blue", value: 1 },
    ]);
    playCard(state, "p0", "r");
    expect(state.direction).toBe(-1);
    expect(state.currentPlayerId).toBe("p2");
  });

  it("2-player reverse lets the same player go again", () => {
    const state = lobby(2);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.direction = 1;
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [
      { id: "r", type: "reverse", color: "red" },
      { id: "keep", type: "number", color: "blue", value: 1 },
    ]);
    playCard(state, "p0", "r");
    expect(state.currentPlayerId).toBe("p0");
  });

  it("+2 makes the next player draw 2 and skip", () => {
    const state = lobby(3);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.direction = 1;
    state.currentColor = "red";
    state.deck = [
      { id: "d1", type: "number", color: "blue", value: 1 },
      { id: "d2", type: "number", color: "blue", value: 2 },
    ];
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [
      { id: "p", type: "draw2", color: "red" },
      { id: "keep", type: "number", color: "blue", value: 1 },
    ]);
    give(state, "p1", [{ id: "h", type: "number", color: "green", value: 4 }]);
    playCard(state, "p0", "p");
    expect(state.pendingDraw).toBe(2);
    expect(getPlayer(state, "p1")!.hand).toHaveLength(1);
    expect(state.currentPlayerId).toBe("p1");
  });

  it("wild requires a color and sets it", () => {
    const state = lobby(2);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [
      { id: "w", type: "wild", color: "black" },
      { id: "keep", type: "number", color: "blue", value: 1 },
    ]);
    expect(playCard(state, "p0", "w").ok).toBe(false);
    const result = playCard(state, "p0", "w", "green");
    expect(result.ok).toBe(true);
    expect(state.currentColor).toBe("green");
  });

  it("+4 draws 4 and skips after choosing color", () => {
    const state = lobby(2);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.deck = Array.from({ length: 4 }, (_, i) => ({
      id: `d${i}`,
      type: "number" as const,
      color: "blue" as const,
      value: i,
    }));
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [
      { id: "w", type: "wildDraw4", color: "black" },
      { id: "keep", type: "number", color: "blue", value: 1 },
    ]);
    give(state, "p1", [{ id: "h", type: "number", color: "green", value: 4 }]);
    playCard(state, "p0", "w", "yellow");
    expect(state.pendingDraw).toBe(4);
    expect(getPlayer(state, "p1")!.hand).toHaveLength(1);
    expect(state.currentColor).toBe("yellow");
    expect(state.currentPlayerId).toBe("p1");
  });
});

describe("draw", () => {
  it("keeps an unplayable draw and passes the turn", () => {
    const state = lobby(2);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    state.deck = [{ id: "n", type: "number", color: "blue", value: 9 }];
    give(state, "p0", [{ id: "h", type: "number", color: "green", value: 3 }]);
    const result = drawCard(state, "p0");
    expect(result.ok).toBe(true);
    expect(state.currentPlayerId).toBe("p1");
    expect(getPlayer(state, "p0")!.hand).toHaveLength(2);
  });

  it("lets the player play a drawn playable card", () => {
    const state = lobby(2);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    state.deck = [{ id: "n", type: "number", color: "red", value: 9 }];
    give(state, "p0", [{ id: "h", type: "number", color: "green", value: 3 }]);
    expect(drawCard(state, "p0").ok).toBe(true);
    expect(state.drawnCard?.id).toBe("n");
    expect(state.phase).toBe("drawn");
    expect(playCard(state, "p0", "h").ok).toBe(false);
    expect(playCard(state, "p0", "n").ok).toBe(true);
    expect(state.drawnCard).toBeNull();
  });

  it("can keep a playable drawn card", () => {
    const state = lobby(2);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    state.deck = [{ id: "n", type: "number", color: "red", value: 9 }];
    give(state, "p0", [{ id: "h", type: "number", color: "green", value: 3 }]);
    drawCard(state, "p0");
    expect(keepDrawn(state, "p0").ok).toBe(true);
    expect(state.currentPlayerId).toBe("p1");
    expect(getPlayer(state, "p0")!.hand.map((c) => c.id)).toContain("n");
  });
});

describe("uno and win", () => {
  it("allows UNO at 1-2 cards and catch when forgotten", () => {
    const state = lobby(2);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.deck = [
      { id: "x", type: "number", color: "blue", value: 1 },
      { id: "y", type: "number", color: "blue", value: 2 },
    ];
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [{ id: "h", type: "number", color: "red", value: 3 }]);
    expect(callUno(state, "p0").ok).toBe(true);
    expect(getPlayer(state, "p0")!.calledUno).toBe(true);
    getPlayer(state, "p0")!.calledUno = false;
    getPlayer(state, "p0")!.unoCatchUntil = Date.now() + 3000;
    expect(catchUno(state, "p1", "p0").ok).toBe(true);
    expect(getPlayer(state, "p0")!.hand.length).toBe(2);
  });

  it("team win when a member empties their hand", () => {
    const state = lobby(4);
    state.teamMode = true;
    state.teamCount = 2;
    state.teams = [
      { id: "a", name: "チーム赤", color: "#e53935", emoji: "🔴" },
      { id: "b", name: "チーム青", color: "#1e88e5", emoji: "🔵" },
    ];
    state.players[0]!.teamId = "a";
    state.players[1]!.teamId = "a";
    state.players[2]!.teamId = "b";
    state.players[3]!.teamId = "b";
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    give(state, "p0", [{ id: "a", type: "number", color: "red", value: 9 }]);
    playCard(state, "p0", "a");
    expect(state.status).toBe("finished");
    expect(state.winningTeamId).toBe("a");
    expect(state.players[0]!.winCount).toBe(1);
  });

  it("returns to lobby for a rematch", () => {
    const state = lobby(2);
    dealAndStart(state, seedRng(3));
    returnToLobby(state);
    expect(state.status).toBe("lobby");
    expect(state.players.every((p) => p.hand.length === 0)).toBe(true);
  });
});

describe("timeout and next player", () => {
  it("forcePass draws and advances", () => {
    const state = lobby(2);
    state.status = "playing";
    state.phase = "play";
    state.currentPlayerId = "p0";
    state.currentColor = "red";
    state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
    state.deck = [{ id: "n", type: "number", color: "blue", value: 9 }];
    give(state, "p0", []);
    forcePass(state, "p0");
    expect(state.currentPlayerId).toBe("p1");
    expect(getPlayer(state, "p0")!.hand).toHaveLength(1);
  });

  it("wraps next player with reverse direction", () => {
    const state = lobby(3);
    state.direction = -1;
    state.currentPlayerId = "p0";
    expect(nextPlayerId(state, "p0", 1)).toBe("p2");
  });
});

describe("sanitize", () => {
  it("never includes other players' hands", () => {
    const state = lobby(3);
    dealAndStart(state, seedRng(9));
    const view = sanitizeFor(state, "p0");
    expect(view.you.hand.map((c) => c.id).sort()).toEqual(
      state.players[0]!.hand.map((c) => c.id).sort(),
    );
    const otherIds = new Set(state.players[1]!.hand.map((c) => c.id));
    expect(view.you.hand.some((c) => otherIds.has(c.id))).toBe(false);
    expect(view.players[1]!.cardCount).toBe(7);
    expect("hand" in view.players[1]!).toBe(false);
  });
});
