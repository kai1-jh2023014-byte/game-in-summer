import type {
  ActionResult,
  Card,
  Color,
  GameEvent,
  GameState,
  PlayExtras,
  Player,
  Ranking,
  SecretPayload,
} from "./types.js";
import { MIN_PLAYERS, UNO_CATCH_MS, UNO_CATCH_PENALTY } from "./types.js";
import { canPlay, createDeckFor, isStackCard, isWild, shuffle, stackValue, type Rng } from "./deck.js";
import { handSizeFor } from "./settings.js";
import { allPlayersHaveTeams, assignBalancedTeams } from "./teams.js";
import {
  isPartyCard,
  needsTarget,
  passOneAround,
  pickSpecialRules,
  redistributeHands,
  rotateHands,
} from "./party.js";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function ok(events: GameEvent[] = [], secrets: SecretPayload[] = []): ActionResult {
  return secrets.length ? { ok: true, events, secrets } : { ok: true, events };
}

export function getPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players.find((p) => p.id === playerId);
}

export function topCard(state: GameState): Card | undefined {
  return state.discard[state.discard.length - 1];
}

export function playerIndex(state: GameState, playerId: string): number {
  return state.players.findIndex((p) => p.id === playerId);
}

export function nextPlayerId(state: GameState, fromId: string, steps = 1): string {
  const n = state.players.length;
  if (n === 0) return fromId;
  const i = playerIndex(state, fromId);
  const start = i < 0 ? 0 : i;
  const idx = ((start + steps * state.direction) % n + n) % n;
  return state.players[idx]!.id;
}

function touch(state: GameState): void {
  state.updatedAt = Date.now();
}

export function ensureDeck(state: GameState, rng: Rng = Math.random): void {
  if (state.deck.length > 0) return;
  if (state.discard.length <= 1) return;
  const top = state.discard.pop()!;
  state.deck = shuffle(state.discard, rng);
  state.discard = [top];
}

export function drawCards(
  state: GameState,
  playerId: string,
  count: number,
  rng: Rng = Math.random,
): Card[] {
  const player = getPlayer(state, playerId);
  if (!player) return [];
  const drawn: Card[] = [];
  for (let i = 0; i < count; i++) {
    ensureDeck(state, rng);
    const card = state.deck.pop();
    if (!card) break;
    player.hand.push(card);
    drawn.push(card);
  }
  if (player.hand.length > 1) player.calledUno = false;
  refreshUnoWindow(player);
  return drawn;
}

function refreshUnoWindow(player: Player, extraPending = 0, now = Date.now()): void {
  const total = player.hand.length + extraPending;
  if (total !== 1) {
    player.unoCatchUntil = null;
    if (total > 1) player.calledUno = false;
    return;
  }
  if (player.calledUno) {
    player.unoCatchUntil = null;
    return;
  }
  if (!player.unoCatchUntil) player.unoCatchUntil = now + UNO_CATCH_MS;
}

function requireTurn(state: GameState, playerId: string): string | null {
  if (state.status !== "playing") return "ゲーム中ではありません";
  if (state.currentPlayerId !== playerId) return "あなたのターンではありません";
  return null;
}

function finishGame(state: GameState, winner: Player): GameEvent[] {
  const events: GameEvent[] = [{ type: "win", playerId: winner.id }];
  state.status = "finished";
  state.phase = "finished";
  state.winnerId = winner.id;
  state.drawnCard = null;
  winner.winCount += 1;

  if (state.teamMode && winner.teamId) {
    state.winningTeamId = winner.teamId;
    events.push({ type: "teamWin", teamId: winner.teamId });
  }

  const others = state.players
    .filter((p) => p.id !== winner.id)
    .sort((a, b) => a.hand.length - b.hand.length);

  const rankings: Ranking[] = [
    {
      playerId: winner.id,
      name: winner.name,
      place: 1,
      cardsLeft: 0,
      teamId: winner.teamId,
    },
  ];
  others.forEach((p, i) => {
    rankings.push({
      playerId: p.id,
      name: p.name,
      place: i + 2,
      cardsLeft: p.hand.length,
      teamId: p.teamId,
    });
  });
  state.rankings = rankings;
  return events;
}

function applyEffectAndAdvance(
  state: GameState,
  card: Card,
  extras: PlayExtras,
  rng: Rng,
  prevColor: Color | null,
  fromBonus: boolean,
): { events: GameEvent[]; secrets: SecretPayload[] } {
  const events: GameEvent[] = [];
  const secrets: SecretPayload[] = [];
  const current = state.currentPlayerId!;
  let steps = 1;
  let nextOverride: string | null = null;
  const usedBonus = fromBonus || state.bonusAction;

  if (card.type === "reverse") {
    state.direction = state.direction === 1 ? -1 : 1;
    events.push({ type: "reverse" });
    if (state.players.length === 2) steps = 0;
    if (state.mode === "party" && state.specialRules.includes("reversePass")) {
      passOneAround(state, rng);
    }
  } else if (card.type === "skip") {
    const skipped = nextPlayerId(state, current, 1);
    events.push({ type: "skip", playerId: skipped });
    steps = 2;
  } else if (card.type === "draw2" || card.type === "wildDraw4") {
    const added = stackValue(card);
    state.pendingDraw += added;
    events.push({ type: "stack", total: state.pendingDraw, added });
    steps = 1;
  } else if (isPartyCard(card)) {
    const party = runPartyEffect(state, card, current, extras, rng);
    events.push(...party.events);
    secrets.push(...party.secrets);
    if (party.nextOverride) nextOverride = party.nextOverride;
  }

  if (
    state.mode === "party" &&
    !usedBonus &&
    !nextOverride &&
    extraTurnEarned(state, card, prevColor)
  ) {
    state.bonusAction = true;
    steps = 0;
    nextOverride = null;
    events.push({ type: "extraTurn", playerId: current });
  } else {
    state.bonusAction = false;
  }

  if (
    state.mode === "party" &&
    state.specialRules.includes("midChaos") &&
    !state.chaosUsed &&
    state.discard.length >= 16
  ) {
    redistributeHands(state, rng);
    state.chaosUsed = true;
    events.push({ type: "chaos" });
  }

  const nextId = nextOverride ?? nextPlayerId(state, current, steps);
  state.currentPlayerId = nextId;
  state.phase = "play";
  events.push({ type: "turn", playerId: nextId });
  return { events, secrets };
}

function extraTurnEarned(state: GameState, card: Card, prevColor: Color | null): boolean {
  if (
    state.specialRules.includes("colorFest") &&
    card.type === "number" &&
    card.color !== "black" &&
    card.color === prevColor
  ) {
    return true;
  }
  if (
    state.specialRules.includes("luckyNumber") &&
    state.luckyNumber != null &&
    card.type === "number" &&
    card.value === state.luckyNumber
  ) {
    return true;
  }
  return false;
}

function runPartyEffect(
  state: GameState,
  card: Card,
  playerId: string,
  extras: PlayExtras,
  rng: Rng,
): { events: GameEvent[]; secrets: SecretPayload[]; nextOverride: string | null } {
  const events: GameEvent[] = [];
  const secrets: SecretPayload[] = [];
  let nextOverride: string | null = null;
  const player = getPlayer(state, playerId)!;

  if (card.type === "gift") {
    const target = getPlayer(state, extras.targetPlayerId ?? "")!;
    const gift = player.hand.find((c) => c.id === extras.giftCardId);
    if (gift && target) {
      player.hand = player.hand.filter((c) => c.id !== gift.id);
      target.hand.push(gift);
      if (target.hand.length > 1) target.calledUno = false;
    }
    if (target) events.push({ type: "gift", playerId, targetId: target.id });
  } else if (card.type === "target") {
    const target = getPlayer(state, extras.targetPlayerId ?? "")!;
    drawCards(state, target.id, 2, rng);
    events.push({ type: "target", playerId, targetId: target.id });
    events.push({ type: "draw", playerId: target.id, count: 2 });
  } else if (card.type === "rotate") {
    rotateHands(state);
    events.push({ type: "rotate" });
  } else if (card.type === "spy") {
    const target = getPlayer(state, extras.targetPlayerId ?? "")!;
    events.push({ type: "spy", playerId, targetId: target.id });
    if (target.hand.length > 0) {
      const peeked = target.hand[Math.floor(rng() * target.hand.length)]!;
      secrets.push({
        to: playerId,
        kind: "spyPeek",
        targetId: target.id,
        targetName: target.name,
        card: peeked,
      });
    }
  } else if (card.type === "bomb") {
    const victim = nextPlayerId(state, playerId, 1);
    const drawn = drawCards(state, victim, 3, rng);
    if (drawn.length > 0) {
      const back = drawn[Math.floor(rng() * drawn.length)]!;
      const vp = getPlayer(state, victim)!;
      vp.hand = vp.hand.filter((c) => c.id !== back.id);
      state.deck.push(back);
      events.push({ type: "bomb", playerId: victim, count: Math.max(0, drawn.length - 1) });
      events.push({ type: "draw", playerId: victim, count: Math.max(0, drawn.length - 1) });
    }
  } else if (card.type === "king") {
    const target = getPlayer(state, extras.targetPlayerId ?? "")!;
    nextOverride = target.id;
    events.push({ type: "king", playerId, targetId: target.id });
  } else if (card.type === "exchange") {
    const target = getPlayer(state, extras.targetPlayerId ?? "")!;
    const mine = player.hand;
    player.hand = target.hand;
    target.hand = mine;
    player.calledUno = player.hand.length <= 1;
    target.calledUno = target.hand.length <= 1;
    events.push({ type: "exchange", playerId, targetId: target.id });
  } else if (card.type === "chaos") {
    redistributeHands(state, rng);
    events.push({ type: "chaos" });
  }

  return { events, secrets, nextOverride };
}

export function dealAndStart(state: GameState, rng: Rng = Math.random): ActionResult {
  if (state.players.length < MIN_PLAYERS) {
    return fail("2人以上いないと始められません");
  }
  if (state.teamMode) {
    if (!allPlayersHaveTeams(state)) {
      assignBalancedTeams(state.players, state.teamCount, rng);
    }
  } else {
    for (const p of state.players) p.teamId = null;
  }

  if (state.mode === "party") {
    state.specialRules = pickSpecialRules(rng);
    state.luckyNumber = state.specialRules.includes("luckyNumber")
      ? Math.floor(rng() * 10)
      : null;
  } else {
    state.specialRules = [];
    state.luckyNumber = null;
  }
  state.bonusAction = false;
  state.chaosUsed = false;
  state.pendingDraw = 0;

  const deck = shuffle(
    createDeckFor(state.mode, state.specialRules, {
      cardVolume: state.cardVolume ?? "normal",
      specialMix: state.specialMix ?? "normal",
    }),
    rng,
  );
  for (const p of state.players) {
    p.hand = [];
    p.calledUno = false;
    p.unoCatchUntil = null;
  }
  const handSize = handSizeFor(state.cardVolume ?? "normal");
  for (let i = 0; i < handSize; i++) {
    for (const p of state.players) {
      const card = deck.pop();
      if (card) p.hand.push(card);
    }
  }

  const numberIdx = deck.findIndex((c) => c.type === "number");
  if (numberIdx < 0) return fail("山札の準備に失敗しました");
  const [starter] = deck.splice(numberIdx, 1);
  if (!starter || starter.color === "black") return fail("最初のカードを置けませんでした");

  state.deck = deck;
  state.discard = [starter];
  state.currentColor = starter.color;
  state.drawnCard = null;
  state.winnerId = null;
  state.winningTeamId = null;
  state.rankings = [];
  state.status = "playing";
  state.phase = "play";
  state.direction = 1;
  state.gameNumber += 1;
  const first = state.players[Math.floor(rng() * state.players.length)]!;
  state.currentPlayerId = first.id;
  touch(state);
  const events: GameEvent[] = [{ type: "turn", playerId: first.id }];
  if (state.mode === "party") {
    events.unshift({
      type: "rules",
      rules: state.specialRules,
      luckyNumber: state.luckyNumber,
    });
  }
  return ok(events);
}

export function playCard(
  state: GameState,
  playerId: string,
  cardId: string,
  chosenColor?: Color,
  sayUno = false,
  rng: Rng = Math.random,
  extras: PlayExtras = {},
): ActionResult {
  const turnErr = requireTurn(state, playerId);
  if (turnErr) return fail(turnErr);

  const player = getPlayer(state, playerId);
  if (!player) return fail("プレイヤーが見つかりません");

  if (state.drawnCard && state.drawnCard.id !== cardId) {
    return fail("引いたカードだけ出せます");
  }
  if (state.drawnCard && extras.extraCardIds?.length) {
    return fail("引いたカードは1枚だけ出せます");
  }

  const inHand = player.hand.find((c) => c.id === cardId);
  const playing = inHand ?? (state.drawnCard?.id === cardId ? state.drawnCard : undefined);
  if (!playing) return fail("そのカードを持っていません");

  const extraIds = [...new Set((extras.extraCardIds ?? []).filter((id) => id && id !== cardId))];
  if (extraIds.length && playing.type !== "number") {
    return fail("数字カードだけ、同じ数字をまとめて出せます");
  }
  const extrasCards: Card[] = [];
  for (const id of extraIds) {
    const extra = player.hand.find((c) => c.id === id);
    if (!extra) return fail("そのカードを持っていません");
    if (extra.type !== "number" || extra.value !== playing.value) {
      return fail("同じ数字のカードだけまとめて出せます");
    }
    extrasCards.push(extra);
  }

  const top = topCard(state);
  if (!top || !state.currentColor) return fail("場のカードがありません");
  const bundlePlayable = [playing, ...extrasCards];
  if (!bundlePlayable.some((c) => canPlay(c, top, state.currentColor!, state.pendingDraw))) {
    return fail(state.pendingDraw > 0 ? "いまは +2 か +4 だけ出せます" : "そのカードは出せません");
  }
  if (state.pendingDraw > 0 && !isStackCard(playing)) {
    return fail("いまは +2 か +4 を出すか、カードを引いてください");
  }

  if (isWild(playing)) {
    if (!chosenColor) return fail("色を選んでください");
  }

  if (state.mode !== "party" && isPartyCard(playing)) {
    return fail("クラシックではそのカードは使えません");
  }

  if (needsTarget(playing)) {
    const tid = extras.targetPlayerId;
    if (!tid || tid === playerId) return fail("誰を選ぶか指定してください");
    if (!getPlayer(state, tid)) return fail("そのプレイヤーはいません");
  }
  if (playing.type === "gift") {
    const rest = player.hand.filter((c) => c.id !== cardId);
    if (rest.length > 0) {
      if (!extras.giftCardId) return fail("渡すカードを選んでください");
      if (!rest.some((c) => c.id === extras.giftCardId)) return fail("そのカードは渡せません");
    }
  }

  const prevColor = state.currentColor;
  const fromBonus = state.bonusAction;
  const bundle = [playing, ...extrasCards];
  const removeIds = new Set(bundle.map((c) => c.id));

  player.hand = player.hand.filter((c) => !removeIds.has(c.id));
  if (state.drawnCard && removeIds.has(state.drawnCard.id)) state.drawnCard = null;

  for (const card of bundle) state.discard.push(card);
  const last = bundle[bundle.length - 1]!;
  if (isWild(last) || isWild(playing)) {
    state.currentColor = chosenColor!;
  } else if (last.color !== "black") {
    state.currentColor = last.color;
  }

  const events: GameEvent[] = [{ type: "play", playerId, card: last, count: bundle.length }];
  if (bundle.length > 1 && playing.type === "number") {
    events.push({ type: "multi", playerId, value: playing.value ?? 0, count: bundle.length });
  }
  if (isWild(playing) && chosenColor) {
    events.push({ type: "color", color: chosenColor });
  }

  if (sayUno && player.hand.length <= 1) {
    player.calledUno = true;
    player.unoCatchUntil = null;
    events.push({ type: "uno", playerId });
  } else {
    refreshUnoWindow(player);
  }

  touch(state);

  if (player.hand.length === 0 && playing.type !== "gift" && playing.type !== "exchange") {
    events.push(...finishGame(state, player));
    return ok(events);
  }

  const beforeCounts = new Map(state.players.map((p) => [p.id, p.hand.length]));
  const applied = applyEffectAndAdvance(state, last, extras, rng, prevColor, fromBonus);
  events.push(...applied.events);

  if (state.status === "playing") {
    if (player.hand.length === 0) {
      events.push(...finishGame(state, player));
    } else {
      const emptied = state.players.find(
        (p) => p.id !== player.id && p.hand.length === 0 && (beforeCounts.get(p.id) ?? 0) > 0,
      );
      if (emptied) events.push(...finishGame(state, emptied));
    }
  }

  return ok(events, applied.secrets);
}

export function drawCard(
  state: GameState,
  playerId: string,
  rng: Rng = Math.random,
): ActionResult {
  const turnErr = requireTurn(state, playerId);
  if (turnErr) return fail(turnErr);
  if (state.drawnCard) return fail("すでにカードを引いています");

  const player = getPlayer(state, playerId);
  if (!player) return fail("プレイヤーが見つかりません");

  if (state.pendingDraw > 0) {
    const count = state.pendingDraw;
    drawCards(state, playerId, count, rng);
    state.pendingDraw = 0;
    state.phase = "play";
    const nextId = nextPlayerId(state, playerId, 1);
    state.currentPlayerId = nextId;
    touch(state);
    return ok([
      { type: "draw", playerId, count },
      { type: "turn", playerId: nextId },
    ]);
  }

  ensureDeck(state, rng);
  const card = state.deck.pop();
  if (!card) return fail("山札がありません");

  const top = topCard(state);
  const events: GameEvent[] = [{ type: "draw", playerId, count: 1 }];

  if (top && state.currentColor && canPlay(card, top, state.currentColor, state.pendingDraw)) {
    state.drawnCard = card;
    state.phase = "drawn";
    touch(state);
    return ok(events);
  }

  player.hand.push(card);
  refreshUnoWindow(player);
  state.drawnCard = null;
  state.phase = "play";
  const nextId = nextPlayerId(state, playerId, 1);
  state.currentPlayerId = nextId;
  events.push({ type: "turn", playerId: nextId });
  touch(state);
  return ok(events);
}

export function keepDrawn(state: GameState, playerId: string): ActionResult {
  const turnErr = requireTurn(state, playerId);
  if (turnErr) return fail(turnErr);
  if (!state.drawnCard) return fail("引いたカードがありません");

  const player = getPlayer(state, playerId);
  if (!player) return fail("プレイヤーが見つかりません");

  player.hand.push(state.drawnCard);
  refreshUnoWindow(player);
  state.drawnCard = null;
  state.phase = "play";
  const nextId = nextPlayerId(state, playerId, 1);
  state.currentPlayerId = nextId;
  touch(state);
  return ok([{ type: "turn", playerId: nextId }]);
}

export function callUno(state: GameState, playerId: string): ActionResult {
  if (state.status !== "playing") return fail("ゲーム中ではありません");
  const player = getPlayer(state, playerId);
  if (!player) return fail("プレイヤーが見つかりません");
  const pending = state.drawnCard && state.currentPlayerId === playerId ? 1 : 0;
  const total = player.hand.length + pending;
  if (total > 2) return fail("UNOは手札が1〜2枚のときだけ宣言できます");
  player.calledUno = true;
  player.unoCatchUntil = null;
  touch(state);
  return ok([{ type: "uno", playerId }]);
}

export function catchUno(
  state: GameState,
  byPlayerId: string,
  targetId: string,
  rng: Rng = Math.random,
): ActionResult {
  if (state.status !== "playing") return fail("ゲーム中ではありません");
  if (byPlayerId === targetId) return fail("自分は指摘できません");
  const by = getPlayer(state, byPlayerId);
  const target = getPlayer(state, targetId);
  if (!by || !target) return fail("プレイヤーが見つかりません");
  const pending = state.drawnCard && state.currentPlayerId === targetId ? 1 : 0;
  const total = target.hand.length + pending;
  const now = Date.now();
  if (total !== 1 || target.calledUno) {
    return fail("今は指摘できません");
  }
  if (!target.unoCatchUntil || now > target.unoCatchUntil) {
    return fail("指摘できる時間が過ぎました");
  }
  drawCards(state, targetId, UNO_CATCH_PENALTY, rng);
  target.calledUno = false;
  target.unoCatchUntil = null;
  touch(state);
  return ok([
    { type: "caught", playerId: targetId, byPlayerId },
    { type: "draw", playerId: targetId, count: UNO_CATCH_PENALTY },
  ]);
}

export function forcePass(state: GameState, playerId: string, rng: Rng = Math.random): ActionResult {
  const turnErr = requireTurn(state, playerId);
  if (turnErr) return fail(turnErr);
  const player = getPlayer(state, playerId);
  if (!player) return fail("プレイヤーが見つかりません");

  const events: GameEvent[] = [];
  if (state.pendingDraw > 0) {
    const count = state.pendingDraw;
    drawCards(state, playerId, count, rng);
    state.pendingDraw = 0;
    events.push({ type: "draw", playerId, count });
  } else if (state.drawnCard) {
    player.hand.push(state.drawnCard);
    refreshUnoWindow(player);
    state.drawnCard = null;
  } else {
    drawCards(state, playerId, 1, rng);
    events.push({ type: "draw", playerId, count: 1 });
  }
  state.phase = "play";
  const nextId = nextPlayerId(state, playerId, 1);
  state.currentPlayerId = nextId;
  events.push({ type: "turn", playerId: nextId });
  touch(state);
  return ok(events);
}

export function returnToLobby(state: GameState): void {
  state.status = "lobby";
  state.phase = "lobby";
  state.deck = [];
  state.discard = [];
  state.currentPlayerId = null;
  state.currentColor = null;
  state.drawnCard = null;
  state.winnerId = null;
  state.winningTeamId = null;
  state.rankings = [];
  state.direction = 1;
  state.specialRules = [];
  state.luckyNumber = null;
  state.bonusAction = false;
  state.chaosUsed = false;
  state.pendingDraw = 0;
  for (const p of state.players) {
    p.hand = [];
    p.calledUno = false;
    p.unoCatchUntil = null;
  }
  touch(state);
}
