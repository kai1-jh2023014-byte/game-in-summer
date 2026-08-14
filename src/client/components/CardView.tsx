import type { Card, Color, PublicPlayer } from "../../shared/types";
import { cardLabel, isWild } from "../../shared/deck";
import { cardHelp } from "../../shared/cardHelp";
import { CARD_INFO, isPartyCard, type PartyCardType } from "../../shared/party";

const ICONS: Record<string, string> = {
  skip: "⏭",
  reverse: "🔄",
  draw2: "+2",
  wild: "🌈",
  wildDraw4: "+4",
};

export function CardView({
  card,
  selected,
  playable,
  dimmed,
  large,
  onClick,
}: {
  card: Card;
  selected?: boolean;
  playable?: boolean;
  dimmed?: boolean;
  large?: boolean;
  onClick?: () => void;
}) {
  const party = isPartyCard(card);
  const info = party ? CARD_INFO[card.type as PartyCardType] : null;
  const colorClass = party ? "party" : isWild(card) ? "wild" : card.color;
  const label = party ? info!.emoji : card.type === "number" ? cardLabel(card) : (ICONS[card.type] ?? cardLabel(card));
  const sub = party
    ? info!.title
    : card.type === "draw2" || card.type === "wild" || card.type === "wildDraw4" || card.type === "skip" || card.type === "reverse"
      ? cardLabel(card)
      : null;

  return (
    <button
      type="button"
      className={[
        "card",
        colorClass,
        selected ? "selected" : "",
        playable ? "playable" : "",
        dimmed ? "dimmed" : "",
        large ? "large" : "",
      ].join(" ")}
      onClick={onClick}
    >
      <span className="card-label">{label}</span>
      {sub ? <span className="card-sub">{sub}</span> : null}
    </button>
  );
}

export function ColorPicker({ onPick, onCancel }: { onPick: (c: Color) => void; onCancel: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-label="色を選ぶ">
      <div className="overlay-card">
        <h2>次の色は？</h2>
        <div className="color-grid">
          <button type="button" className="color-btn red" onClick={() => onPick("red")}>赤</button>
          <button type="button" className="color-btn blue" onClick={() => onPick("blue")}>青</button>
          <button type="button" className="color-btn green" onClick={() => onPick("green")}>緑</button>
          <button type="button" className="color-btn yellow" onClick={() => onPick("yellow")}>黄</button>
        </div>
        <button type="button" className="btn ghost" onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  );
}

export function PlayerPicker({
  title,
  hint,
  players,
  onPick,
  onCancel,
}: {
  title: string;
  hint?: string;
  players: PublicPlayer[];
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="overlay" role="dialog" aria-label={title}>
      <div className="overlay-card">
        <h2>{title}</h2>
        {hint && <p className="hint">{hint}</p>}
        <div className="pick-list">
          {players.map((p) => (
            <button key={p.id} type="button" className="btn pick" onClick={() => onPick(p.id)}>
              👤 {p.name}
              <span className="muted">🃏 {p.cardCount}</span>
            </button>
          ))}
        </div>
        <button type="button" className="btn ghost" onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  );
}

export function HelpCard({ card, onClose }: { card: Card; onClose: () => void }) {
  const help = cardHelp(card);
  return (
    <div className="overlay" role="dialog" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h2>{help.emoji} {help.title}</h2>
        <p className="hint">{help.hint}</p>
        <button type="button" className="btn primary" onClick={onClose}>OK</button>
      </div>
    </div>
  );
}
