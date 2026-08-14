import type { Card, Color, GameMode, SpecialRuleId } from "./types.js";
import { COLORS, isPartyType } from "./types.js";

export type Rng = () => number;

let cardSeq = 0;

function nextId(): string {
  cardSeq += 1;
  return `c${cardSeq}`;
}

export function resetCardSeq(value = 0): void {
  cardSeq = value;
}

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of COLORS) {
    deck.push({ id: nextId(), type: "number", color, value: 0 });
    for (let n = 1; n <= 9; n++) {
      deck.push({ id: nextId(), type: "number", color, value: n });
      deck.push({ id: nextId(), type: "number", color, value: n });
    }
    for (let i = 0; i < 2; i++) {
      deck.push({ id: nextId(), type: "skip", color });
      deck.push({ id: nextId(), type: "reverse", color });
      deck.push({ id: nextId(), type: "draw2", color });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ id: nextId(), type: "wild", color: "black" });
    deck.push({ id: nextId(), type: "wildDraw4", color: "black" });
  }
  return deck;
}

export function createPartyDeck(rules: SpecialRuleId[] = []): Card[] {
  const deck = createDeck();
  // 7人でも数字の組み合わせと複数出しが起きやすいよう、4〜7を1枚ずつ足す
  for (const color of COLORS) {
    for (const n of [4, 5, 6, 7]) {
      deck.push({ id: nextId(), type: "number", color, value: n });
    }
  }
  const extra = rules.includes("wildParty") ? 1 : 0;
  const copies: Record<string, number> = {
    gift: 3,
    target: 3,
    rotate: 3,
    spy: 2,
    bomb: 2,
    king: 2,
    exchange: 1 + extra,
    chaos: 1 + extra,
  };
  for (const [type, count] of Object.entries(copies)) {
    for (let i = 0; i < count; i++) {
      deck.push({ id: nextId(), type: type as Card["type"], color: "black" });
    }
  }
  return deck;
}

export function createDeckFor(mode: GameMode, rules: SpecialRuleId[] = []): Card[] {
  return mode === "party" ? createPartyDeck(rules) : createDeck();
}

export function shuffle<T>(items: T[], rng: Rng = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}

export function isWild(card: Card): boolean {
  return card.type === "wild" || card.type === "wildDraw4";
}

export function isStackCard(card: Card): boolean {
  return card.type === "draw2" || card.type === "wildDraw4";
}

export function stackValue(card: Card): number {
  if (card.type === "draw2") return 2;
  if (card.type === "wildDraw4") return 4;
  return 0;
}

export function canPlay(card: Card, top: Card, currentColor: Color, pendingDraw = 0): boolean {
  if (pendingDraw > 0) return isStackCard(card);
  if (card.type === "wild" || card.type === "wildDraw4" || isPartyType(card.type)) return true;
  if (card.color === currentColor) return true;
  if (card.type === "number" && top.type === "number" && card.value === top.value) {
    return true;
  }
  if (card.type !== "number" && card.type === top.type) {
    return true;
  }
  return false;
}

export function hasPlayable(hand: Card[], top: Card, currentColor: Color, pendingDraw = 0): boolean {
  return hand.some((c) => canPlay(c, top, currentColor, pendingDraw));
}

export function cardLabel(card: Card): string {
  if (card.type === "number") return String(card.value ?? 0);
  if (card.type === "skip") return "SKIP";
  if (card.type === "reverse") return "REV";
  if (card.type === "draw2") return "+2";
  if (card.type === "wild") return "WILD";
  if (card.type === "wildDraw4") return "+4";
  if (isPartyType(card.type)) {
    const titles: Record<string, string> = {
      gift: "GIFT",
      target: "POINT",
      rotate: "PASS",
      spy: "SPY",
      bomb: "BOMB",
      king: "KING",
      exchange: "SWAP",
      chaos: "CHAOS",
    };
    return titles[card.type] ?? card.type.toUpperCase();
  }
  return card.type.toUpperCase();
}
