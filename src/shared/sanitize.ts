import type { ClientState, GameState } from "./types.js";
import { MAX_PLAYERS } from "./types.js";
import { canPlay } from "./deck.js";
import { topCard } from "./engine.js";

export function sanitizeFor(state: GameState, playerId: string): ClientState {
  const you = state.players.find((p) => p.id === playerId);
  const top = topCard(state) ?? null;
  const drawn = you && state.currentPlayerId === you.id ? state.drawnCard : null;
  const canPlayDrawn = Boolean(
    drawn && top && state.currentColor && canPlay(drawn, top, state.currentColor, state.pendingDraw ?? 0),
  );

  return {
    code: state.code,
    status: state.status,
    phase: you && state.currentPlayerId === you.id ? state.phase : state.status === "playing" ? "play" : state.phase,
    you: {
      id: you?.id ?? playerId,
      name: you?.name ?? "",
      hand: you ? [...you.hand] : [],
      calledUno: you?.calledUno ?? false,
      isHost: you?.isHost ?? false,
      teamId: you?.teamId ?? null,
      canPlayDrawn,
    },
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      cardCount: p.hand.length + (state.drawnCard && state.currentPlayerId === p.id ? 1 : 0),
      calledUno: p.calledUno,
      unoCatchUntil: p.unoCatchUntil && p.unoCatchUntil > Date.now() ? p.unoCatchUntil : null,
      connected: p.connected,
      teamId: p.teamId,
      isHost: p.isHost,
      winCount: p.winCount,
      isCurrent: p.id === state.currentPlayerId,
    })),
    teams: state.teams,
    teamMode: state.teamMode,
    teamCount: state.teamCount,
    topCard: top,
    currentColor: state.currentColor,
    currentPlayerId: state.currentPlayerId,
    direction: state.direction,
    deckCount: state.deck.length,
    discardCount: state.discard.length,
    drawnCard: drawn,
    winnerId: state.winnerId,
    winningTeamId: state.winningTeamId,
    rankings: state.rankings,
    gameNumber: state.gameNumber,
    playerCount: state.players.length,
    maxPlayers: MAX_PLAYERS,
    mode: state.mode ?? "classic",
    specialRules: state.specialRules ?? [],
    luckyNumber: state.luckyNumber ?? null,
    pendingDraw: state.pendingDraw ?? 0,
  };
}

export function assertNoForeignHands(state: ClientState, playerId: string): boolean {
  if (state.you.id !== playerId) return false;
  return true;
}
