import { useEffect, useMemo, useState } from "react";
import type { Card, ClientState, Color, PlayExtras } from "../../shared/types";
import { canPlay, isWild } from "../../shared/deck";
import { CARD_INFO, needsTarget, RULE_INFO, type PartyCardType } from "../../shared/party";
import { CardView, ColorPicker, HelpCard, PlayerPicker } from "../components/CardView";

function sortHand(hand: Card[]): Card[] {
  const order = { red: 0, blue: 1, green: 2, yellow: 3, black: 4 };
  return [...hand].sort((a, b) => {
    const oc = order[a.color] - order[b.color];
    if (oc) return oc;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (a.value ?? 99) - (b.value ?? 99);
  });
}

export function Game({
  state,
  busy,
  onPlay,
  onDraw,
  onKeep,
  onUno,
  onCatch,
}: {
  state: ClientState;
  busy: boolean;
  onPlay: (cardId: string, color?: Color, sayUno?: boolean, extras?: PlayExtras) => void;
  onDraw: () => void;
  onKeep: () => void;
  onUno: () => void;
  onCatch: (targetId: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [picking, setPicking] = useState<Card | null>(null);
  const [targeting, setTargeting] = useState<Card | null>(null);
  const [gifting, setGifting] = useState<{ card: Card; targetId: string } | null>(null);
  const [help, setHelp] = useState<Card | null>(null);
  const [unoArmed, setUnoArmed] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);

  const isMe = state.currentPlayerId === state.you.id;
  const top = state.topCard;
  const color = state.currentColor;
  const pending = state.pendingDraw ?? 0;
  const current = state.players.find((p) => p.id === state.currentPlayerId);
  const opponents = state.players.filter((p) => p.id !== state.you.id);
  const hand = useMemo(() => sortHand(state.you.hand), [state.you.hand]);
  const now = Date.now();
  const catchable = state.players.filter(
    (p) => p.id !== state.you.id && p.cardCount === 1 && !p.calledUno && (p.unoCatchUntil ?? 0) > now,
  );

  const selectedCards = selected
    .map((id) => hand.find((c) => c.id === id) ?? (state.drawnCard?.id === id ? state.drawnCard : undefined))
    .filter((c): c is Card => Boolean(c));

  function finishPlay(card: Card, chosen?: Color, extras?: PlayExtras) {
    const extrasIds = selected.filter((id) => id !== card.id);
    const say = unoArmed || state.you.hand.length - (1 + extrasIds.length) <= 1;
    onPlay(card.id, chosen, say, { ...extras, extraCardIds: extrasIds.length ? extrasIds : extras?.extraCardIds });
    setSelected([]);
    setPicking(null);
    setTargeting(null);
    setGifting(null);
    setUnoArmed(false);
  }

  function tryPlay(card: Card, chosen?: Color) {
    if (!isMe || busy) return;
    if (state.drawnCard && card.id !== state.drawnCard.id) return;
    if (!top || !color || !canPlay(card, top, color, pending)) return;
    if (isWild(card) && !chosen) {
      setPicking(card);
      return;
    }
    if (needsTarget(card)) {
      setTargeting(card);
      return;
    }
    finishPlay(card, chosen);
  }

  function onTarget(targetId: string) {
    if (!targeting) return;
    if (targeting.type === "gift") {
      const rest = state.you.hand.filter((c) => c.id !== targeting.id);
      if (rest.length === 0) {
        finishPlay(targeting, undefined, { targetPlayerId: targetId });
        return;
      }
      setGifting({ card: targeting, targetId });
      setTargeting(null);
      return;
    }
    finishPlay(targeting, undefined, { targetPlayerId: targetId });
  }

  function onCardTap(card: Card) {
    if (!isMe) {
      setHelp(card);
      return;
    }
    if (state.drawnCard) {
      if (card.id === state.drawnCard.id) tryPlay(card);
      return;
    }
    if (card.type === "number") {
      const first = selectedCards[0];
      if (!first) {
        setSelected([card.id]);
        return;
      }
      if (first.type === "number" && first.value === card.value) {
        setSelected((cur) => (cur.includes(card.id) ? cur.filter((id) => id !== card.id) : [...cur, card.id]));
        return;
      }
    }
    if (selected.length === 1 && selected[0] === card.id) tryPlay(card);
    else setSelected([card.id]);
  }

  const displayHand = state.drawnCard ? [state.drawnCard, ...hand] : hand;
  const party = state.mode === "party";
  const canMulti = selectedCards.length >= 2 && selectedCards.every((c) => c.type === "number");
  const lead = selectedCards[0];

  return (
    <main className="screen game">
      <header className="game-top">
        <span>Room {state.code}</span>
        <span className={`turn-pill ${isMe ? "mine" : ""}`}>
          {isMe ? "🔥 YOUR TURN" : `⏳ ${current?.name ?? "?"} の番`}
        </span>
        <span className="dir">{state.direction === 1 ? "⤵" : "⤴"}</span>
      </header>

      {pending > 0 && (
        <div className="stack-banner" role="status">
          💥 いま <strong>+{pending}</strong> のスタック
          {isMe ? " — +2 / +4 を出すか、引いてください" : ""}
        </div>
      )}

      {party && state.specialRules.length > 0 && (
        <div className="rule-bar">
          {state.specialRules.map((id) => (
            <span key={id} className="rule-chip">
              {RULE_INFO[id].emoji} {RULE_INFO[id].title}
              {id === "luckyNumber" && state.luckyNumber != null ? ` ${state.luckyNumber}` : ""}
            </span>
          ))}
        </div>
      )}

      <section className="opponents">
        {opponents.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`opp ${p.isCurrent ? "current" : ""} ${p.connected ? "" : "offline"}`}
            onClick={() => {
              if (p.cardCount === 1 && !p.calledUno && (p.unoCatchUntil ?? 0) > Date.now()) onCatch(p.id);
            }}
          >
            <span className="opp-emoji">{p.teamId ? teamEmoji(state, p.teamId) : "👤"}</span>
            <span className="opp-name">{p.name}</span>
            <span className="opp-cards">🃏 {p.cardCount}</span>
            {p.calledUno && <span className="uno-badge">UNO!</span>}
            {!p.connected && <span className="off-badge">切断</span>}
          </button>
        ))}
      </section>

      <section className="table">
        <div className={`color-ring ${color ?? ""}`}>
          {top && <CardView card={top} large onHelp={() => setHelp(top)} />}
        </div>
        <div className="deck-stack" aria-hidden>
          <div className="card back large">🂠</div>
          <span>{state.deckCount}</span>
        </div>
      </section>

      {catchable.length > 0 && (
        <div className="catch-bar">
          {catchable.map((p) => (
            <button key={p.id} type="button" className="btn danger" onClick={() => onCatch(p.id)}>
              🚨 {p.name} UNO言ってない！
            </button>
          ))}
        </div>
      )}

      {state.phase === "drawn" && isMe && state.drawnCard && (
        <div className="drawn-bar">
          <p>引いたカードを出せます</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={() => tryPlay(state.drawnCard!)}>出す</button>
            <button type="button" className="btn ghost" onClick={onKeep}>手札に残す</button>
          </div>
        </div>
      )}

      <section className="hand-wrap">
        <div className="hand-label">YOUR HAND · {state.you.hand.length + (state.drawnCard ? 1 : 0)}枚</div>
        <div className="hand">
          {displayHand.map((card) => {
            const playable = Boolean(isMe && top && color && canPlay(card, top, color, pending));
            const locked = Boolean(state.drawnCard && card.id !== state.drawnCard.id);
            return (
              <CardView
                key={card.id}
                card={card}
                selected={selected.includes(card.id)}
                playable={playable && !locked}
                dimmed={!isMe || locked || !playable}
                onClick={() => onCardTap(card)}
                onHelp={() => setHelp(card)}
              />
            );
          })}
        </div>
      </section>

      {canMulti && lead && (
        <button
          type="button"
          className="btn primary xl"
          disabled={!isMe || busy}
          onClick={() => tryPlay(lead)}
        >
          {selectedCards.length}枚出す（{lead.value}）
        </button>
      )}

      <footer className="actions">
        <button
          type="button"
          className="btn secondary xl"
          onClick={onDraw}
          disabled={!isMe || busy || !!state.drawnCard}
        >
          {pending > 0 && isMe ? `💥 ${pending}枚引く` : "カードを引く"}
        </button>
        <button
          type="button"
          className={`btn uno xl ${unoArmed || state.you.calledUno ? "on" : ""}`}
          onClick={() => {
            setUnoArmed(true);
            onUno();
          }}
          disabled={state.you.hand.length > 2}
        >
          UNO!
        </button>
      </footer>

      {picking && (
        <ColorPicker onPick={(c) => tryPlay(picking, c)} onCancel={() => setPicking(null)} />
      )}
      {targeting && (
        <PlayerPicker
          title="誰を選ぶ？"
          hint={CARD_INFO[targeting.type as PartyCardType]?.hint}
          players={opponents}
          onPick={onTarget}
          onCancel={() => setTargeting(null)}
        />
      )}
      {gifting && (
        <div className="overlay" role="dialog">
          <div className="overlay-card">
            <h2>どのカードを渡す？</h2>
            <div className="hand gift-hand">
              {state.you.hand
                .filter((c) => c.id !== gifting.card.id)
                .map((c) => (
                  <CardView
                    key={c.id}
                    card={c}
                    onClick={() =>
                      finishPlay(gifting.card, undefined, {
                        targetPlayerId: gifting.targetId,
                        giftCardId: c.id,
                      })
                    }
                  />
                ))}
            </div>
            <button type="button" className="btn ghost" onClick={() => setGifting(null)}>キャンセル</button>
          </div>
        </div>
      )}
      {help && <HelpCard card={help} onClose={() => setHelp(null)} />}
    </main>
  );
}

function teamEmoji(state: ClientState, teamId: string): string {
  return state.teams.find((t) => t.id === teamId)?.emoji ?? "👤";
}
