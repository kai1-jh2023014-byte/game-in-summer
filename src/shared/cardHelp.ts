import type { Card, Color } from "./types.js";
import { CARD_INFO, isPartyCard, type PartyCardType } from "./party.js";

const COLOR_JA: Record<Color, string> = {
  red: "赤",
  blue: "青",
  green: "緑",
  yellow: "黄",
};

export function cardHelp(card: Card): { emoji: string; title: string; hint: string } {
  if (isPartyCard(card)) {
    const info = CARD_INFO[card.type as PartyCardType];
    return { emoji: info.emoji, title: info.title, hint: info.hint };
  }
  switch (card.type) {
    case "number":
      return {
        emoji: "🃏",
        title: `${card.color !== "black" ? COLOR_JA[card.color] : ""}${card.value ?? 0}`,
        hint: "同じ色か同じ数字なら出せます。同じ数字は何枚でもまとめて出せます。",
      };
    case "skip":
      return { emoji: "⏭️", title: "SKIP", hint: "次の人の番を飛ばします。" };
    case "reverse":
      return { emoji: "🔄", title: "REVERSE", hint: "番の向きが逆になります。" };
    case "draw2":
      return { emoji: "💥", title: "+2", hint: "次の人は2枚引きます。その人が +2 か +4 を出せば、枚数を押し返せます。" };
    case "wild":
      return { emoji: "🌈", title: "WILD", hint: "好きな色を宣言します。いつでも出せます。" };
    case "wildDraw4":
      return { emoji: "🔥", title: "+4", hint: "好きな色を宣言し、次の人は4枚引きます。+2 や +4 で押し返せます。" };
    default:
      return { emoji: "🃏", title: card.type, hint: "このカードを場に出します。" };
  }
}
