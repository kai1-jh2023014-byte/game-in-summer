import type { CardVolume, PartyCardType, SpecialMix, SpecialRuleId } from "./types.js";

export const CARD_VOLUMES: CardVolume[] = ["low", "normal", "high", "max"];
export const SPECIAL_MIXES: SpecialMix[] = ["normal", "lots"];

export const CARD_VOLUME_INFO: Record<
  CardVolume,
  { label: string; hint: string; handSize: number; extraNumberSets: number }
> = {
  low: {
    label: "すくない",
    hint: "手札5枚。短めの試合。",
    handSize: 5,
    extraNumberSets: 0,
  },
  normal: {
    label: "ふつう",
    hint: "手札7枚。いつもの量。",
    handSize: 7,
    extraNumberSets: 0,
  },
  high: {
    label: "おおい",
    hint: "手札9枚＋数字カード多め。すぐ終わりにくい。",
    handSize: 9,
    extraNumberSets: 1,
  },
  max: {
    label: "とてもおおい",
    hint: "手札11枚＋山札厚め。長い試合向け。",
    handSize: 11,
    extraNumberSets: 2,
  },
};

export const SPECIAL_MIX_INFO: Record<SpecialMix, { label: string; hint: string }> = {
  normal: { label: "ふつう", hint: "パーティの特殊カードはいつもの量です。" },
  lots: { label: "たくさん", hint: "KING / GIFT / SWAP などの特殊カードがかなり多く出ます。" },
};

export function handSizeFor(volume: CardVolume = "normal"): number {
  return CARD_VOLUME_INFO[volume]?.handSize ?? 7;
}

export function extraNumberSetsFor(volume: CardVolume = "normal"): number {
  return CARD_VOLUME_INFO[volume]?.extraNumberSets ?? 0;
}

export function partyCardCounts(
  rules: SpecialRuleId[] = [],
  mix: SpecialMix = "normal",
): Record<PartyCardType, number> {
  const wild = rules.includes("wildParty") ? 1 : 0;
  const m = mix === "lots" ? 2 : 1;
  const bump = mix === "lots" ? 1 : 0;
  return {
    gift: 3 * m,
    target: 3 * m,
    rotate: 3 * m,
    spy: 2 * m,
    bomb: 2 * m,
    king: 2 * m,
    exchange: (1 + wild) * m + bump,
    chaos: (1 + wild) * m + bump,
  };
}
