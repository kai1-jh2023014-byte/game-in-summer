import { describe, expect, it } from "vitest";
import { canPlay } from "./deck.js";
import { needsTarget } from "./party.js";
import { RoomManager } from "./rooms.js";
import type { Card } from "./types.js";

function botExtras(card: Card, youId: string, others: { id: string }[], hand: Card[]) {
  if (!needsTarget(card)) return {};
  const other = others.find((p) => p.id !== youId);
  if (!other) return {};
  return { targetPlayerId: other.id, giftCardId: hand.find((c) => c.id !== card.id)?.id };
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
    while (mgr.get(code)!.status === "playing" && turns < 4000) {
      turns += 1;
      const state = mgr.get(code)!;
      const id = state.currentPlayerId!;
      const view = mgr.viewFor(state, id);
      const others = view.players;
      const act = (card: Card) => {
        if (["gift", "target", "rotate", "spy", "bomb", "king", "exchange", "chaos"].includes(card.type)) {
          partyPlays += 1;
        }
        const color = card.type === "wild" || card.type === "wildDraw4" ? ("red" as const) : undefined;
        return mgr.play(
          code,
          id,
          card.id,
          color,
          view.you.hand.length <= 2,
          botExtras(card, id, others, view.you.hand),
        );
      };
      if (view.drawnCard) {
        const played = act(view.drawnCard);
        if (!played.ok) mgr.keep(code, id);
        continue;
      }
      const playable = view.you.hand.filter(
        (c) => view.topCard && view.currentColor && canPlay(c, view.topCard, view.currentColor),
      );
      if (playable[0]) act(playable[0]);
      else mgr.draw(code, id);
    }
    const end = mgr.get(code)!;
    return {
      finished: end.status === "finished",
      turns,
      partyPlays,
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
    for (let i = 0; i < 200; i++) {
      const r = playGame(true, 1000 + i, i % 4 === 0);
      if (r.finished) finished += 1;
      turns += r.turns;
      partyPlays += r.partyPlays;
      if (r.winnerSeat >= 0) seats[r.winnerSeat] += 1;
      if (r.teamWin) teamWins += 1;
    }
    const avgTurns = turns / 200;
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
