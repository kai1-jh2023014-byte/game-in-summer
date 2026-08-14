export const COLORS = ["red", "blue", "green", "yellow"] as const;
export type Color = (typeof COLORS)[number];

export const PARTY_CARD_TYPES = [
  "gift",
  "target",
  "rotate",
  "spy",
  "bomb",
  "king",
  "exchange",
  "chaos",
] as const;

export type PartyCardType = (typeof PARTY_CARD_TYPES)[number];

export type CardType =
  | "number"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wildDraw4"
  | PartyCardType;

export function isPartyType(type: CardType): boolean {
  return (PARTY_CARD_TYPES as readonly string[]).includes(type);
}

export interface Card {
  id: string;
  type: CardType;
  color: Color | "black";
  value?: number;
}

export const TEAM_PRESETS = [
  { id: "a", name: "チーム赤", color: "#e53935", emoji: "🔴" },
  { id: "b", name: "チーム青", color: "#1e88e5", emoji: "🔵" },
  { id: "c", name: "チーム緑", color: "#43a047", emoji: "🟢" },
  { id: "d", name: "チーム黄", color: "#f9a825", emoji: "🟡" },
] as const;

export type TeamId = (typeof TEAM_PRESETS)[number]["id"];

export interface Team {
  id: TeamId;
  name: string;
  color: string;
  emoji: string;
}

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  hand: Card[];
  calledUno: boolean;
  connected: boolean;
  teamId: TeamId | null;
  isHost: boolean;
  winCount: number;
}

export type RoomStatus = "lobby" | "playing" | "finished";
export type TurnDirection = 1 | -1;
export type GamePhase = "lobby" | "play" | "drawn" | "finished";
export type GameMode = "classic" | "party";
export type SpecialRuleId =
  | "colorFest"
  | "reversePass"
  | "luckyNumber"
  | "speed"
  | "midChaos"
  | "wildParty";

export interface PlayExtras {
  targetPlayerId?: string;
  giftCardId?: string;
}

export interface SecretPayload {
  to: string;
  kind: "spyPeek";
  targetId: string;
  targetName: string;
  card: Card;
}

export interface Ranking {
  playerId: string;
  name: string;
  place: number;
  cardsLeft: number;
  teamId: TeamId | null;
}

export interface GameState {
  code: string;
  status: RoomStatus;
  phase: GamePhase;
  players: Player[];
  teams: Team[];
  teamMode: boolean;
  teamCount: number;
  deck: Card[];
  discard: Card[];
  currentPlayerId: string | null;
  direction: TurnDirection;
  currentColor: Color | null;
  drawnCard: Card | null;
  winnerId: string | null;
  winningTeamId: TeamId | null;
  rankings: Ranking[];
  gameNumber: number;
  createdAt: number;
  updatedAt: number;
  mode: GameMode;
  specialRules: SpecialRuleId[];
  luckyNumber: number | null;
  bonusAction: boolean;
  chaosUsed: boolean;
}

export type GameEvent =
  | { type: "play"; playerId: string; card: Card }
  | { type: "draw"; playerId: string; count: number }
  | { type: "skip"; playerId: string }
  | { type: "reverse" }
  | { type: "color"; color: Color }
  | { type: "uno"; playerId: string }
  | { type: "caught"; playerId: string; byPlayerId: string }
  | { type: "win"; playerId: string }
  | { type: "teamWin"; teamId: TeamId }
  | { type: "turn"; playerId: string }
  | { type: "host"; playerId: string }
  | { type: "gift"; playerId: string; targetId: string }
  | { type: "exchange"; playerId: string; targetId: string }
  | { type: "target"; playerId: string; targetId: string }
  | { type: "rotate" }
  | { type: "chaos" }
  | { type: "bomb"; playerId: string; count: number }
  | { type: "king"; playerId: string; targetId: string }
  | { type: "spy"; playerId: string; targetId: string }
  | { type: "extraTurn"; playerId: string }
  | { type: "rules"; rules: SpecialRuleId[]; luckyNumber: number | null };

export type ActionOk = { ok: true; events: GameEvent[]; secrets?: SecretPayload[] };
export type ActionFail = { ok: false; error: string };
export type ActionResult = ActionOk | ActionFail;

export interface PublicPlayer {
  id: string;
  name: string;
  cardCount: number;
  calledUno: boolean;
  connected: boolean;
  teamId: TeamId | null;
  isHost: boolean;
  winCount: number;
  isCurrent: boolean;
}

export interface ClientState {
  code: string;
  status: RoomStatus;
  phase: GamePhase;
  you: {
    id: string;
    name: string;
    hand: Card[];
    calledUno: boolean;
    isHost: boolean;
    teamId: TeamId | null;
    canPlayDrawn: boolean;
  };
  players: PublicPlayer[];
  teams: Team[];
  teamMode: boolean;
  teamCount: number;
  topCard: Card | null;
  currentColor: Color | null;
  currentPlayerId: string | null;
  direction: TurnDirection;
  deckCount: number;
  discardCount: number;
  drawnCard: Card | null;
  winnerId: string | null;
  winningTeamId: TeamId | null;
  rankings: Ranking[];
  gameNumber: number;
  playerCount: number;
  maxPlayers: number;
  mode: GameMode;
  specialRules: SpecialRuleId[];
  luckyNumber: number | null;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;
export const HAND_SIZE = 7;
export const MAX_TEAMS = 4;
export const MIN_TEAMS = 2;
