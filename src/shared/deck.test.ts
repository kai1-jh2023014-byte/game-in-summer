import { describe, expect, it } from "vitest";
import { canPlay, canPlayWithCombo, createDeck, createDeckFor, createPartyDeck, isWild, resetCardSeq, shuffle } from "./deck.js";
import type { Card, Color } from "./types.js";

function card(partial: Partial<Card> & Pick<Card, "type">): Card {
  return {
    id: partial.id ?? "x",
    type: partial.type,
    color: partial.color ?? "red",
    value: partial.value,
  };
}

describe("deck", () => {
  it("creates a 108-card deck", () => {
    resetCardSeq();
    const deck = createDeck();
    expect(deck.length).toBe(108);
    expect(deck.filter((c) => c.type === "wild")).toHaveLength(4);
    expect(deck.filter((c) => c.type === "wildDraw4")).toHaveLength(4);
    expect(deck.filter((c) => c.type === "number" && c.value === 0)).toHaveLength(4);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
  });

  it("shuffles without losing cards", () => {
    const deck = createDeck();
    const ids = deck.map((c) => c.id).sort();
    const shuffled = shuffle(deck, () => 0.3);
    expect(shuffled.map((c) => c.id).sort()).toEqual(ids);
  });
});

describe("canPlay", () => {
  const top = card({ type: "number", color: "blue", value: 5 });
  const color: Color = "blue";

  it("matches color", () => {
    expect(canPlay(card({ type: "number", color: "blue", value: 9 }), top, color)).toBe(true);
  });

  it("matches number across colors", () => {
    expect(canPlay(card({ type: "number", color: "red", value: 5 }), top, color)).toBe(true);
  });

  it("rejects mismatch", () => {
    expect(canPlay(card({ type: "number", color: "red", value: 2 }), top, color)).toBe(false);
  });

  it("matches action type across colors", () => {
    const skipTop = card({ type: "skip", color: "green" });
    expect(canPlay(card({ type: "skip", color: "yellow" }), skipTop, "green")).toBe(true);
  });

  it("allows wilds always", () => {
    expect(canPlay(card({ type: "wild", color: "black" }), top, color)).toBe(true);
    expect(canPlay(card({ type: "wildDraw4", color: "black" }), top, color)).toBe(true);
    expect(isWild(card({ type: "wild", color: "black" }))).toBe(true);
  });

  it("uses current color after a wild", () => {
    const wildTop = card({ type: "wild", color: "black" });
    expect(canPlay(card({ type: "number", color: "yellow", value: 1 }), wildTop, "yellow")).toBe(true);
    expect(canPlay(card({ type: "number", color: "red", value: 1 }), wildTop, "yellow")).toBe(false);
  });
});

describe("card volume and special mix", () => {
  it("keeps classic 108 at the default volume", () => {
    expect(createDeckFor("classic")).toHaveLength(108);
  });

  it("adds extra number cards when volume is high or max", () => {
    const high = createDeckFor("classic", [], { cardVolume: "high" });
    const max = createDeckFor("classic", [], { cardVolume: "max" });
    expect(high.length).toBe(108 + 76);
    expect(max.length).toBe(108 + 152);
    expect(high.every((c) => c.type !== "gift")).toBe(true);
  });

  it("doubles party cards in lots mix", () => {
    const normal = createPartyDeck([]);
    const lots = createPartyDeck([], { specialMix: "lots" });
    const partyCount = (deck: { type: string }[]) =>
      deck.filter((c) => ["gift", "target", "rotate", "spy", "bomb", "king", "exchange", "chaos"].includes(c.type)).length;
    expect(partyCount(normal)).toBe(17);
    expect(partyCount(lots)).toBeGreaterThan(30);
    expect(lots.length).toBeGreaterThan(normal.length);
  });
});

describe("canPlayWithCombo", () => {
  it("lights up same-number partners that are not playable alone", () => {
    const top = card({ type: "number", color: "red", value: 3 });
    const red7 = card({ id: "r7", type: "number", color: "red", value: 7 });
    const blue7 = card({ id: "b7", type: "number", color: "blue", value: 7 });
    const hand = [red7, blue7];
    expect(canPlay(blue7, top, "red")).toBe(false);
    expect(canPlayWithCombo(blue7, hand, top, "red")).toBe(true);
    expect(canPlayWithCombo(red7, hand, top, "red")).toBe(true);
  });
});
