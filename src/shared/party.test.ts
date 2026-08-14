import { describe, expect, it } from "vitest";
import { canPlay, createDeck, createPartyDeck } from "./deck.js";
import {
  dealAndStart,
  getPlayer,
  playCard,
} from "./engine.js";
import { createEmptyState, makePlayer, RoomManager } from "./rooms.js";
import { isPartyCard, needsTarget, pickSpecialRules, rotateHands } from "./party.js";
import type { Card, GameState } from "./types.js";
import { sanitizeFor } from "./sanitize.js";

function seedRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function lobby(n: number, party = false): GameState {
  const host = makePlayer("p0", "Host", true);
  const state = createEmptyState("TEST", host);
  state.mode = party ? "party" : "classic";
  for (let i = 1; i < n; i++) state.players.push(makePlayer(`p${i}`, `P${i}`, false));
  return state;
}

function partyState(n: number): GameState {
  const state = lobby(n, true);
  state.status = "playing";
  state.phase = "play";
  state.currentPlayerId = "p0";
  state.currentColor = "red";
  state.discard = [{ id: "top", type: "number", color: "red", value: 1 }];
  state.deck = Array.from({ length: 20 }, (_, i) => ({
    id: `d${i}`,
    type: "number" as const,
    color: "blue" as const,
    value: i % 10,
  }));
  return state;
}

describe("classic unchanged", () => {
  it("still builds a 108-card deck without party cards", () => {
    const deck = createDeck();
    expect(deck).toHaveLength(108);
    expect(deck.some(isPartyCard)).toBe(false);
  });

  it("classic start still deals 7 and keeps extra cards out", () => {
    const state = lobby(7);
    expect(dealAndStart(state, seedRng(1)).ok).toBe(true);
    expect(state.mode).toBe("classic");
    expect(state.specialRules).toEqual([]);
    expect(state.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(state.players.some((p) => p.hand.some(isPartyCard))).toBe(false);
  });
});

describe("party cards", () => {
  it("adds a small set of party cards", () => {
    const deck = createPartyDeck([]);
    const party = deck.filter(isPartyCard);
    expect(deck.length).toBe(108 + 14);
    expect(party.length).toBe(14);
    expect(party.length / deck.length).toBeLessThan(0.2);
  });

  it("gift moves one card to the target", () => {
    const state = partyState(3);
    getPlayer(state, "p0")!.hand = [
      { id: "g", type: "gift", color: "black" },
      { id: "keep", type: "number", color: "blue", value: 2 },
      { id: "give", type: "number", color: "green", value: 4 },
    ];
    getPlayer(state, "p1")!.hand = [{ id: "h", type: "number", color: "yellow", value: 1 }];
    const result = playCard(state, "p0", "g", undefined, false, Math.random, {
      targetPlayerId: "p1",
      giftCardId: "give",
    });
    expect(result.ok).toBe(true);
    expect(getPlayer(state, "p1")!.hand.map((c) => c.id)).toContain("give");
    expect(getPlayer(state, "p0")!.hand.map((c) => c.id)).toEqual(["keep"]);
  });

  it("rejects gift/target without a valid other player", () => {
    const state = partyState(3);
    getPlayer(state, "p0")!.hand = [
      { id: "t", type: "target", color: "black" },
      { id: "keep", type: "number", color: "blue", value: 2 },
    ];
    expect(playCard(state, "p0", "t").ok).toBe(false);
    expect(playCard(state, "p0", "t", undefined, false, Math.random, { targetPlayerId: "p0" }).ok).toBe(false);
    expect(playCard(state, "p0", "t", undefined, false, Math.random, { targetPlayerId: "nope" }).ok).toBe(false);
  });

  it("target makes the chosen player draw 2 and does not skip them", () => {
    const state = partyState(3);
    getPlayer(state, "p0")!.hand = [
      { id: "t", type: "target", color: "black" },
      { id: "keep", type: "number", color: "blue", value: 2 },
    ];
    getPlayer(state, "p2")!.hand = [{ id: "h", type: "number", color: "green", value: 3 }];
    playCard(state, "p0", "t", undefined, false, Math.random, { targetPlayerId: "p2" });
    expect(getPlayer(state, "p2")!.hand.length).toBe(3);
    expect(state.currentPlayerId).toBe("p1");
  });

  it("exchange swaps remaining hands", () => {
    const state = partyState(2);
    getPlayer(state, "p0")!.hand = [
      { id: "e", type: "exchange", color: "black" },
      { id: "a", type: "number", color: "blue", value: 1 },
    ];
    getPlayer(state, "p1")!.hand = [
      { id: "b", type: "number", color: "green", value: 2 },
      { id: "c", type: "number", color: "green", value: 3 },
    ];
    playCard(state, "p0", "e", undefined, false, Math.random, { targetPlayerId: "p1" });
    expect(getPlayer(state, "p0")!.hand.map((c) => c.id).sort()).toEqual(["b", "c"]);
    expect(getPlayer(state, "p1")!.hand.map((c) => c.id)).toEqual(["a"]);
  });

  it("rotate moves whole hands in turn direction", () => {
    const state = partyState(3);
    state.direction = 1;
    getPlayer(state, "p0")!.hand = [{ id: "a", type: "number", color: "red", value: 1 }];
    getPlayer(state, "p1")!.hand = [{ id: "b", type: "number", color: "blue", value: 1 }];
    getPlayer(state, "p2")!.hand = [{ id: "c", type: "number", color: "green", value: 1 }];
    rotateHands(state);
    expect(getPlayer(state, "p1")!.hand[0]!.id).toBe("a");
    expect(getPlayer(state, "p2")!.hand[0]!.id).toBe("b");
    expect(getPlayer(state, "p0")!.hand[0]!.id).toBe("c");
  });

  it("spy peeks privately and does not leak into public state", () => {
    const state = partyState(2);
    getPlayer(state, "p0")!.hand = [
      { id: "s", type: "spy", color: "black" },
      { id: "keep", type: "number", color: "blue", value: 2 },
    ];
    getPlayer(state, "p1")!.hand = [{ id: "secret", type: "number", color: "yellow", value: 7 }];
    const result = playCard(state, "p0", "s", undefined, false, () => 0, { targetPlayerId: "p1" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.secrets?.[0]?.card.id).toBe("secret");
    expect(result.secrets?.[0]?.to).toBe("p0");
    const publicView = sanitizeFor(state, "p0");
    expect(JSON.stringify(publicView).includes('"id":"secret"')).toBe(false);
    const other = sanitizeFor(state, "p1");
    expect(other.you.hand.some((c) => c.id === "secret")).toBe(true);
  });

  it("bomb draws then returns one card", () => {
    const state = partyState(2);
    getPlayer(state, "p0")!.hand = [
      { id: "b", type: "bomb", color: "black" },
      { id: "keep", type: "number", color: "blue", value: 2 },
    ];
    getPlayer(state, "p1")!.hand = [];
    const beforeDeck = state.deck.length;
    playCard(state, "p0", "b");
    expect(getPlayer(state, "p1")!.hand.length).toBe(2);
    expect(state.deck.length).toBe(beforeDeck - 2);
  });

  it("king nominates the next player", () => {
    const state = partyState(3);
    getPlayer(state, "p0")!.hand = [
      { id: "k", type: "king", color: "black" },
      { id: "keep", type: "number", color: "blue", value: 2 },
    ];
    playCard(state, "p0", "k", undefined, false, Math.random, { targetPlayerId: "p2" });
    expect(state.currentPlayerId).toBe("p2");
  });

  it("chaos keeps each player's card count", () => {
    const state = partyState(3);
    getPlayer(state, "p0")!.hand = [
      { id: "c", type: "chaos", color: "black" },
      { id: "a1", type: "number", color: "blue", value: 1 },
      { id: "a2", type: "number", color: "blue", value: 2 },
    ];
    getPlayer(state, "p1")!.hand = [{ id: "b1", type: "number", color: "green", value: 1 }];
    getPlayer(state, "p2")!.hand = [
      { id: "c1", type: "number", color: "yellow", value: 1 },
      { id: "c2", type: "number", color: "yellow", value: 2 },
    ];
    playCard(state, "p0", "c");
    expect(getPlayer(state, "p0")!.hand.length).toBe(2);
    expect(getPlayer(state, "p1")!.hand.length).toBe(1);
    expect(getPlayer(state, "p2")!.hand.length).toBe(2);
  });

  it("color fest grants one extra turn and does not chain forever", () => {
    const state = partyState(2);
    state.specialRules = ["colorFest"];
    getPlayer(state, "p0")!.hand = [
      { id: "r1", type: "number", color: "red", value: 3 },
      { id: "r2", type: "number", color: "red", value: 4 },
      { id: "keep", type: "number", color: "blue", value: 9 },
    ];
    getPlayer(state, "p1")!.hand = [{ id: "x", type: "number", color: "green", value: 1 }];
    playCard(state, "p0", "r1");
    expect(state.currentPlayerId).toBe("p0");
    expect(state.bonusAction).toBe(true);
    const second = playCard(state, "p0", "r2");
    expect(second).toEqual(expect.objectContaining({ ok: true }));
    expect(state.currentPlayerId).toBe("p1");
  });
});

describe("party 7-player games", () => {
  it("finishes a 7-player party game without leaking hands", () => {
    const mgr = new RoomManager();
    const created = mgr.create("p1", "Player 1");
    if (!created.ok) return;
    const code = created.state.code;
    mgr.setMode(code, "p1", "party");
    for (let i = 2; i <= 7; i++) mgr.join(code, `p${i}`, `Player ${i}`);
    expect(mgr.startGame(code, "p1").ok).toBe(true);
    const started = mgr.get(code)!;
    expect(started.mode).toBe("party");
    expect(started.specialRules.length).toBeGreaterThan(0);

    let guard = 0;
    while (mgr.get(code)!.status === "playing" && guard < 5000) {
      guard += 1;
      const state = mgr.get(code)!;
      const playerId = state.currentPlayerId!;
      const view = mgr.viewFor(state, playerId);
      if (view.drawnCard) {
        const extras = botExtras(view.drawnCard, view);
        const color = view.drawnCard.type === "wild" || view.drawnCard.type === "wildDraw4" ? "red" as const : undefined;
        const played = mgr.play(code, playerId, view.drawnCard.id, color, view.you.hand.length <= 1, extras);
        if (!played.ok) mgr.keep(code, playerId);
        continue;
      }
      const playable = view.you.hand.filter(
        (c) => view.topCard && view.currentColor && canPlay(c, view.topCard, view.currentColor),
      );
      if (playable[0]) {
        const card = playable[0];
        const color = card.type === "wild" || card.type === "wildDraw4" ? "blue" as const : undefined;
        const extras = botExtras(card, view);
        expect(mgr.play(code, playerId, card.id, color, view.you.hand.length <= 2, extras).ok).toBe(true);
      } else {
        expect(mgr.draw(code, playerId).ok).toBe(true);
      }
    }
    const end = mgr.get(code)!;
    expect(end.status).toBe("finished");
    expect(end.winnerId).toBeTruthy();
    const leaked = sanitizeFor(end, "p1");
    const other = end.players.find((p) => p.id !== "p1")!;
    for (const card of other.hand) {
      expect(JSON.stringify(leaked).includes(`"id":"${card.id}"`)).toBe(false);
    }
  });
});

function botExtras(card: Card, view: ReturnType<RoomManager["viewFor"]>) {
  if (!needsTarget(card)) return {};
  const other = view.players.find((p) => p.id !== view.you.id);
  if (!other) return {};
  const gift = view.you.hand.find((c) => c.id !== card.id);
  return { targetPlayerId: other.id, giftCardId: gift?.id };
}

describe("pick rules", () => {
  it("picks one or two rules", () => {
    const a = pickSpecialRules(seedRng(3));
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(2);
  });
});
