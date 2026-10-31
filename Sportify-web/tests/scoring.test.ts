import { describe, expect, it } from "vitest";
import { determineWinner, marginScoring, parseGames } from "@/lib/scoring";

describe("scoring", () => {
  it("parses plain and JSON score strings", () => {
    expect(parseGames("21-15, 18-21,21-19")).toEqual([[21, 15], [18, 21], [21, 19]]);
    expect(parseGames(JSON.stringify({ score: "21-10" }))).toEqual([[21, 10]]);
    expect(parseGames("")).toEqual([]);
  });

  it("decides the winner by games won, not points", () => {
    expect(determineWinner("21-0, 19-21, 19-21")).toBe("team2");
    expect(determineWinner("21-15")).toBe("team1");
    expect(determineWinner("21-21")).toBeNull();
    expect(determineWinner("garbage")).toBeNull();
  });

  it("awards 5 + 2 per 10 points of net margin", () => {
    const r = { clanId: 1, format: "singles" as const, team1: ["a"], team2: ["b"] };
    expect(marginScoring.pointsFor({ ...r, score: "21-10, 15-21, 21-18" }, "team1")).toBeCloseTo(6.6);
    expect(marginScoring.pointsFor({ ...r, score: "21-11" }, "team1")).toBeCloseTo(7);
    expect(marginScoring.pointsFor({ ...r, score: "" }, "team1")).toBe(5);
  });
});
