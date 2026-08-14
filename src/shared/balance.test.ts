import { describe, expect, it } from "vitest";
import { canPlay, isStackCard } from "./deck.js";
import { needsTarget } from "./party.js";
import { RoomManager } from "./rooms.js";
import type { Card } from "./types.js";

function botExtras(card: Card, youId: string, others: { id: string }[], hand: Card[], extraCardIds?: string[]) {
  if (!needsTarget(card)) return extraCardIds?.length ? { extraCardIds } : {};
  const other = others.find((p) => p.id !== youId);
  if (!other) return extraCardIds?.length ? { extraCardIds } : {};
  return { targetPlayerId: other.id, giftCardId: hand.find((c) => c.id !== card.id)?.id, extraCardIds };
}

function playGame(party: boolean, seed: number, team: boolean) {
  const rng = (() => {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  })();
  const real = Math.random;
  Math.random = rng;
  try {
    const mgr = new RoomManager();
    mgr.create("p1", "P1");
    const code = [...mgr.rooms.keys()][0]!;
    if (party) mgr.setMode(code, "p1", "party");
    for (let i = 2; i <= 7; i++) mgr.join(code, `p${i}`, `P${i}`);
    if (team) mgr.randomizeTeams(code, "p1");
    mgr.startGame(code, "p1");
    let turns = 0;
    let partyPlays = 0;
    let stacks = 0;
    let multis = 0;
    let catches = 0;
    while (mgr.get(code)!.status === "playing" && turns < 4000) {
      turns += 1;
      const state = mgr.get(code)!;
      const id = state.currentPlayerId!;
      const view = mgr.viewFor(state, id);
      const others = view.players;
      for (const p of others) {
        if (p.id !== id && p.cardCount === 1 && !p.calledUno && (p.unoCatchUntil ?? 0) > Date.now()) {
          const caught = mgr.catch(code, id, p.id);
          if (caught.ok) catches += 1;
        }
      }
      const act = (card: Card, extraCardIds?: string[]) => {
        if (["gift", "target", "rotate", "spy", "bomb", "king", "exchange", "chaos"].includes(card.type)) {
          partyPlays += 1;
        }
        const color = card.type === "wild" || card.type === "wildDraw4" ? ("red" as const) : undefined;
        const result = mgr.play(
          code,
          id,
          card.id,
          color,
          view.you.hand.length - (extraCardIds?.length ?? 0) <= 2,
          botExtras(card, id, others, view.you.hand, extraCardIds),
        );
        if (result.ok) {
          if (result.events.some((e) => e.type === "stack" && e.total > e.added)) stacks += 1;
          if (result.events.some((e) => e.type === "multi")) multis += 1;
        }
        return result;
      };
      if (view.drawnCard) {
        const played = act(view.drawnCard);
        if (!played.ok) mgr.keep(code, id);
        continue;
      }
      const playable = view.you.hand.filter(
        (c) =>
          view.topCard &&
          view.currentColor &&
          canPlay(c, view.topCard, view.currentColor, view.pendingDraw),
      );
      if (view.pendingDraw > 0) {
        const plus = playable.find((c) => isStackCard(c));
        if (plus) act(plus);
        else mgr.draw(code, id);
        continue;
      }
      const numbers = playable.filter((c) => c.type === "number");
      const groups = new Map<number, Card[]>();
      for (const c of numbers) {
        const v = c.value ?? -1;
        const list = groups.get(v) ?? [];
        list.push(c);
        groups.set(v, list);
      }
      const best = [...groups.values()].sort((a, b) => b.length - a.length)[0];
      if (best && best.length >= 2) {
        act(best[0]!, best.slice(1).map((c) => c.id));
      } else if (playable[0]) act(playable[0]);
      else mgr.draw(code, id);
    }
    const end = mgr.get(code)!;
    return {
      finished: end.status === "finished",
      turns,
      partyPlays,
      stacks,
      multis,
      catches,
      winnerSeat: end.players.findIndex((p) => p.id === end.winnerId),
      teamWin: Boolean(end.winningTeamId),
    };
  } finally {
    Math.random = real;
  }
}

describe("balance simulation", () => {
  it("plays 200 seven-player party games to completion", () => {
    const seats = [0, 0, 0, 0, 0, 0, 0];
    let turns = 0;
    let partyPlays = 0;
    let finished = 0;
    let teamWins = 0;
    let stacks = 0;
    let multis = 0;
    let catches = 0;
    let minTurns = Infinity;
    let maxTurns = 0;
    for (let i = 0; i < 200; i++) {
      const r = playGame(true, 1000 + i, i % 4 === 0);
      if (r.finished) finished += 1;
      turns += r.turns;
      partyPlays += r.partyPlays;
      stacks += r.stacks;
      multis += r.multis;
      catches += r.catches;
      minTurns = Math.min(minTurns, r.turns);
      maxTurns = Math.max(maxTurns, r.turns);
      if (r.winnerSeat >= 0) seats[r.winnerSeat] += 1;
      if (r.teamWin) teamWins += 1;
    }
    const avgTurns = turns / 200;
    console.log("balance 7p party", {
      avgTurns,
      minTurns,
      maxTurns,
      stacks: stacks / 200,
      multis: multis / 200,
      catches: catches / 200,
      partyPlays: partyPlays / 200,
      seats,
    });
    expect(finished).toBe(200);
    expect(avgTurns).toBeGreaterThan(8);
    expect(avgTurns).toBeLessThan(250);
    const maxSeat = Math.max(...seats);
    const minSeat = Math.min(...seats);
    expect(maxSeat - minSeat).toBeLessThan(80);
    expect(partyPlays / 200).toBeLessThan(40);
    expect(teamWins).toBeGreaterThan(0);
  }, 30000);
});
