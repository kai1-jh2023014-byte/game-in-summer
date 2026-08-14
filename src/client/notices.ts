import type { Card, ClientState, Color, GameEvent } from "../shared/types";
import { cardLabel } from "../shared/deck";
import { CARD_INFO, type PartyCardType } from "../shared/party";

export type NoticePriority = 1 | 2 | 3 | 4 | 5;

export interface Notice {
  text: string;
  log: string;
  fx?: string;
  priority: NoticePriority;
  you?: boolean;
}

const COLOR_JA: Record<Color, string> = {
  red: "赤",
  blue: "青",
  green: "緑",
  yellow: "黄",
};

function who(state: ClientState, id: string): string {
  if (id === state.you.id) return "あなた";
  return state.players.find((p) => p.id === id)?.name ?? "誰か";
}

function playTitle(card: Card, count = 1): string {
  if (card.type === "number") {
    const n = card.value ?? 0;
    return count > 1 ? `${n} ×${count}` : String(n);
  }
  if (card.type === "skip") return "⏭️ SKIP!";
  if (card.type === "reverse") return "🔄 REVERSE!";
  if (card.type === "draw2") return "💥 +2!";
  if (card.type === "wild") return "🌈 WILD!";
  if (card.type === "wildDraw4") return "🔥 +4!";
  const info = CARD_INFO[card.type as PartyCardType];
  if (info) return `${info.emoji} ${info.title}!`;
  return cardLabel(card);
}

export function noticesFromEvents(events: GameEvent[], state: ClientState | null): Notice[] {
  if (!state || !events.length) return [];
  const out: Notice[] = [];
  const me = state.you.id;
  for (const e of events) {
    switch (e.type) {
      case "play": {
        const count = e.count ?? 1;
        const mine = e.playerId === me;
        const label = e.card.type === "number"
          ? `${COLOR_JA[e.card.color as Color] ?? ""}${e.card.value ?? 0}`
          : cardLabel(e.card);
        out.push({
          text: mine
            ? count > 1
              ? `あなたが ${label} を ${count} 枚出した`
              : `あなたが ${label} を出した`
            : count > 1
              ? `${who(state, e.playerId)} が ${label} を ${count} 枚出した`
              : `${who(state, e.playerId)} が ${label} を出した`,
          log: `${who(state, e.playerId)} → ${label}${count > 1 ? `×${count}` : ""}`,
          fx: playTitle(e.card, count),
          priority: e.card.type === "number" ? 3 : 4,
          you: mine,
        });
        break;
      }
      case "multi":
        out.push({
          text: `${who(state, e.playerId)} が ${e.value} を ${e.count} 枚同時出し！`,
          log: `${who(state, e.playerId)} → ${e.value}×${e.count}`,
          fx: `${e.value} ×${e.count}`,
          priority: 4,
          you: e.playerId === me,
        });
        break;
      case "draw":
        out.push({
          text: e.playerId === me
            ? `カードを ${e.count} 枚引きました`
            : `${who(state, e.playerId)} が ${e.count} 枚引いた`,
          log: `${who(state, e.playerId)} → ${e.count}枚ドロー`,
          fx: e.playerId === me ? `📥 +${e.count}` : undefined,
          priority: e.playerId === me ? 5 : 3,
          you: e.playerId === me,
        });
        break;
      case "stack":
        out.push({
          text: e.total > e.added ? `STACK! 合計 +${e.total}` : `次の人は +${e.total} です`,
          log: `STACK +${e.total}`,
          fx: e.total > e.added ? `STACK! TOTAL +${e.total}` : `💥 TOTAL +${e.total}`,
          priority: 5,
        });
        break;
      case "skip":
        out.push({
          text: e.playerId === me ? "あなたはスキップ" : `${who(state, e.playerId)} はスキップ`,
          log: `${who(state, e.playerId)} スキップ`,
          fx: "⏭️ SKIP!",
          priority: 4,
          you: e.playerId === me,
        });
        break;
      case "reverse":
        out.push({ text: "向きが逆になりました", log: "リバース", fx: "🔄 REVERSE!", priority: 4 });
        break;
      case "uno":
        out.push({
          text: `${who(state, e.playerId)} 「UNO!」`,
          log: `${who(state, e.playerId)} UNO`,
          fx: "🔥 UNO!",
          priority: 5,
          you: e.playerId === me,
        });
        break;
      case "caught":
        out.push({
          text: `${who(state, e.byPlayerId)} が ${who(state, e.playerId)} のUNO忘れを指摘！ +1`,
          log: `CAUGHT ${who(state, e.playerId)}`,
          fx: "🚨 CAUGHT!",
          priority: 5,
          you: e.playerId === me || e.byPlayerId === me,
        });
        break;
      case "win":
        out.push({
          text: `🏆 ${who(state, e.playerId)} の勝ち！`,
          log: `${who(state, e.playerId)} 勝利`,
          fx: "🏆 WIN!",
          priority: 5,
        });
        break;
      case "teamWin": {
        const t = state.teams.find((x) => x.id === e.teamId);
        out.push({
          text: `🏆 ${t?.name ?? "チーム"} の勝ち！`,
          log: `${t?.name ?? "チーム"} 勝利`,
          fx: "🏆 TEAM WIN!",
          priority: 5,
        });
        break;
      }
      case "gift":
        out.push({
          text: `🎁 ${who(state, e.playerId)} が ${who(state, e.targetId)} にカードをプレゼント`,
          log: `GIFT ${who(state, e.playerId)}→${who(state, e.targetId)}`,
          fx: "🎁 GIFT!",
          priority: 5,
          you: e.playerId === me || e.targetId === me,
        });
        break;
      case "exchange":
        out.push({
          text: `🃏 ${who(state, e.playerId)} と ${who(state, e.targetId)} の手札が交換されました`,
          log: `SWAP ${who(state, e.playerId)}↔${who(state, e.targetId)}`,
          fx: "🃏 SWAP!",
          priority: 5,
          you: e.playerId === me || e.targetId === me,
        });
        break;
      case "target":
        out.push({
          text: `🎯 ${who(state, e.playerId)} が ${who(state, e.targetId)} を指名`,
          log: `POINT → ${who(state, e.targetId)}`,
          fx: "🎯 POINT!",
          priority: 4,
          you: e.targetId === me,
        });
        break;
      case "rotate":
        out.push({
          text: "🔄 全員の手札が隣へ移動しました",
          log: "PASS 手札移動",
          fx: "🔄 PASS!",
          priority: 5,
          you: true,
        });
        break;
      case "chaos":
        out.push({
          text: "🌪️ 全員の手札がシャッフルされました",
          log: "CHAOS",
          fx: "🌪️ CHAOS!",
          priority: 5,
          you: true,
        });
        break;
      case "bomb":
        out.push({
          text: `💣 ${who(state, e.playerId)} にボム（+${e.count}）`,
          log: `BOMB ${who(state, e.playerId)} +${e.count}`,
          fx: "💣 BOMB!",
          priority: 5,
          you: e.playerId === me,
        });
        break;
      case "king":
        out.push({
          text: `👑 次は ${who(state, e.targetId)}`,
          log: `KING → ${who(state, e.targetId)}`,
          fx: "👑 KING!",
          priority: 4,
        });
        break;
      case "spy":
        out.push({
          text: `🕵️ ${who(state, e.playerId)} が覗いた`,
          log: `SPY ${who(state, e.playerId)}`,
          fx: "🕵️ SPY!",
          priority: 3,
        });
        break;
      case "extraTurn":
        out.push({
          text: `✨ ${who(state, e.playerId)} もう一度！`,
          log: `${who(state, e.playerId)} もう一度`,
          fx: "✨ もう一度！",
          priority: 4,
          you: e.playerId === me,
        });
        break;
      case "color":
        out.push({
          text: `次の色は ${COLOR_JA[e.color]}`,
          log: `色 → ${COLOR_JA[e.color]}`,
          priority: 2,
        });
        break;
      default:
        break;
    }
  }
  return out;
}

export function pickFx(notices: Notice[]): string | null {
  const ranked = [...notices].filter((n) => n.fx).sort((a, b) => b.priority - a.priority);
  return ranked[0]?.fx ?? null;
}

export function pickToast(notices: Notice[]): string | null {
  const mine = notices.filter((n) => n.you || n.priority >= 5);
  const pick = (mine.length ? mine : notices).sort((a, b) => b.priority - a.priority)[0];
  return pick?.text ?? null;
}
