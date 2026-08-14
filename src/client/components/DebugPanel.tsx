import type { ClientState } from "../../shared/types";

export function DebugPanel({ state }: { state: ClientState | null }) {
  if (!import.meta.env.DEV || !state) return null;
  return (
    <details className="debug">
      <summary>debug</summary>
      <pre>
        {JSON.stringify(
          {
            room: state.code,
            status: state.status,
            phase: state.phase,
            turn: state.currentPlayerId,
            color: state.currentColor,
            deck: state.deckCount,
            discard: state.discardCount,
            players: state.players.map((p) => ({
              name: p.name,
              cards: p.cardCount,
              team: p.teamId,
              on: p.connected,
            })),
            mode: state.mode,
            rules: state.specialRules,
            lucky: state.luckyNumber,
            partyCards: state.you.hand.filter((c) =>
              ["gift", "target", "rotate", "spy", "bomb", "king", "exchange", "chaos"].includes(c.type),
            ).length,
          },
          null,
          2,
        )}
      </pre>
    </details>
  );
}
