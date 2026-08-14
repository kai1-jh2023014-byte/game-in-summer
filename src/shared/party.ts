import type { Card, GameState, SpecialRuleId } from "./types.js";
import { PARTY_CARD_TYPES, UNO_CATCH_MS, isPartyType } from "./types.js";
import { shuffle, type Rng } from "./deck.js";

export type PartyCardType = (typeof PARTY_CARD_TYPES)[number];
export { PARTY_CARD_TYPES, isPartyType };

export function isPartyCard(card: Card): boolean {
  return isPartyType(card.type);
}

export function isAlwaysPlayable(card: Card): boolean {
  return card.type === "wild" || card.type === "wildDraw4" || isPartyCard(card);
}

export const CARD_INFO: Record<
  PartyCardType,
  { emoji: string; title: string; hint: string; needsTarget: boolean }
> = {
  gift: { emoji: "🎁", title: "GIFT", hint: "手札から1枚を、好きな人に渡します。", needsTarget: true },
  target: { emoji: "🎯", title: "POINT", hint: "指名した人が2枚引きます。いつでも出せます。", needsTarget: true },
  rotate: { emoji: "🔄", title: "PASS", hint: "全員の手札が、今の向きの隣へ移動します。", needsTarget: false },
  spy: { emoji: "🕵️", title: "SPY", hint: "指名した人の手札を、あなただけ1枚見ます。", needsTarget: true },
  bomb: { emoji: "💣", title: "BOMB", hint: "次の人が3枚引き、1枚だけ山札に戻ります。", needsTarget: false },
  king: { emoji: "👑", title: "KING", hint: "次に遊ぶ人を指名します。", needsTarget: true },
  exchange: { emoji: "🃏", title: "SWAP", hint: "指名した人と手札をすべて交換します。", needsTarget: true },
  chaos: { emoji: "🌪️", title: "CHAOS", hint: "枚数はそのまま、全員の手札を配り直します。", needsTarget: false },
};

export const RULE_INFO: Record<SpecialRuleId, { emoji: string; title: string; hint: string }> = {
  colorFest: { emoji: "🌈", title: "カラーフェス", hint: "場と同じ色を出すと、もう一度自分の番。" },
  reversePass: { emoji: "🔄", title: "リバースパス", hint: "リバースのとき、全員が隣へ1枚渡す。" },
  luckyNumber: { emoji: "🎯", title: "ラッキーナンバー", hint: "当たりの数字を出すと、もう一度自分の番。" },
  speed: { emoji: "⚡", title: "高速モード", hint: "考える時間は30秒。遅いと1枚引いてパス。" },
  midChaos: { emoji: "🌪️", title: "大混乱", hint: "試合の途中で1回、全員の手札が混ざります。" },
  wildParty: { emoji: "🎉", title: "パーティ増量", hint: "交換とシャッフルが、いつもより少し多い。" },
};

export const ALL_RULES: SpecialRuleId[] = [
  "colorFest",
  "reversePass",
  "luckyNumber",
  "speed",
  "midChaos",
  "wildParty",
];

export function needsTarget(card: Card): boolean {
  return isPartyCard(card) && CARD_INFO[card.type as PartyCardType].needsTarget;
}

export function pickSpecialRules(rng: Rng): SpecialRuleId[] {
  const shuffled = shuffle(ALL_RULES, rng);
  const picked: SpecialRuleId[] = [shuffled[0]!];
  if (rng() < 0.4 && shuffled[1]) picked.push(shuffled[1]);
  return picked;
}

export function partyCopies(rules: SpecialRuleId[]): Record<PartyCardType, number> {
  const wild = rules.includes("wildParty") ? 1 : 0;
  return {
    gift: 3,
    target: 3,
    rotate: 3,
    spy: 2,
    bomb: 2,
    king: 2,
    exchange: 1 + wild,
    chaos: 1 + wild,
  };
}

export function rotateHands(state: GameState): void {
  const n = state.players.length;
  if (n < 2) return;
  const hands = state.players.map((p) => p.hand);
  for (let i = 0; i < n; i++) {
    const dest = ((i + state.direction) % n + n) % n;
    state.players[dest]!.hand = hands[i]!;
  }
  resetUnoFlags(state);
}

export function redistributeHands(state: GameState, rng: Rng): void {
  const counts = state.players.map((p) => p.hand.length);
  const pool = shuffle(
    state.players.flatMap((p) => p.hand),
    rng,
  );
  for (const p of state.players) p.hand = [];
  counts.forEach((count, i) => {
    for (let k = 0; k < count; k++) {
      const card = pool.pop();
      if (card) state.players[i]!.hand.push(card);
    }
  });
  resetUnoFlags(state);
}

export function passOneAround(state: GameState, rng: Rng): void {
  const n = state.players.length;
  if (n < 2) return;
  const moving = state.players.map((p) => {
    if (p.hand.length === 0) return null;
    const idx = Math.floor(rng() * p.hand.length);
    return p.hand.splice(idx, 1)[0] ?? null;
  });
  for (let i = 0; i < n; i++) {
    const card = moving[i];
    if (!card) continue;
    const dest = ((i + state.direction) % n + n) % n;
    state.players[dest]!.hand.push(card);
  }
  resetUnoFlags(state);
}

function resetUnoFlags(state: GameState): void {
  const now = Date.now();
  for (const p of state.players) {
    if (p.hand.length > 1) {
      p.calledUno = false;
      p.unoCatchUntil = null;
    } else if (p.hand.length === 1 && !p.calledUno) {
      p.unoCatchUntil = now + UNO_CATCH_MS;
    } else {
      p.unoCatchUntil = null;
    }
  }
}
