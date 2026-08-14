import { describe, expect, it } from "vitest";
import { assignBalancedTeams, makeTeams } from "./teams.js";
import { makePlayer } from "./rooms.js";

describe("teams", () => {
  it("builds 2-4 team presets", () => {
    expect(makeTeams(2)).toHaveLength(2);
    expect(makeTeams(3)).toHaveLength(3);
    expect(makeTeams(4)).toHaveLength(4);
  });

  it("balances 7 players into 3 teams as 3-2-2", () => {
    const players = Array.from({ length: 7 }, (_, i) => makePlayer(`p${i}`, `P${i}`, i === 0));
    assignBalancedTeams(players, 3, () => 0.5);
    const counts = { a: 0, b: 0, c: 0, d: 0 };
    for (const p of players) counts[p.teamId!] += 1;
    const sizes = [counts.a, counts.b, counts.c].sort((a, b) => b - a);
    expect(sizes).toEqual([3, 2, 2]);
  });

  it("balances 7 players into 2 teams as 4-3", () => {
    const players = Array.from({ length: 7 }, (_, i) => makePlayer(`p${i}`, `P${i}`, i === 0));
    assignBalancedTeams(players, 2, () => 0.2);
    const a = players.filter((p) => p.teamId === "a").length;
    const b = players.filter((p) => p.teamId === "b").length;
    expect([a, b].sort((x, y) => y - x)).toEqual([4, 3]);
  });
});
