import { TEAM_PRESETS } from "./types.js";
import type { GameState, Player, Team, TeamId } from "./types.js";
import { shuffle, type Rng } from "./deck.js";

export function makeTeams(count: number): Team[] {
  const n = Math.min(4, Math.max(2, count));
  return TEAM_PRESETS.slice(0, n).map((t) => ({ ...t }));
}

export function assignBalancedTeams(
  players: Player[],
  teamCount: number,
  rng: Rng = Math.random,
): void {
  const teams = makeTeams(teamCount);
  const shuffled = shuffle(players, rng);
  shuffled.forEach((player, i) => {
    player.teamId = teams[i % teams.length]!.id;
  });
}

export function movePlayerToTeam(player: Player, teamId: TeamId, valid: Team[]): boolean {
  if (!valid.some((t) => t.id === teamId)) return false;
  player.teamId = teamId;
  return true;
}

export function teamMembers(state: GameState, teamId: TeamId): Player[] {
  return state.players.filter((p) => p.teamId === teamId);
}

export function allPlayersHaveTeams(state: GameState): boolean {
  return state.players.every((p) => p.teamId != null);
}
