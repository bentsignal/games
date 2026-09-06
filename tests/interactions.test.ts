import { describe, it, expect } from "vitest";
import { tracks, LANE_SPACING, TRAIN_HEIGHT } from "../src/game/map-layout";
import { cardPayment, ticketPath } from "../src/game/interactions";
import { newGame, newPlayer, playerView } from "../src/game/engine";
import { ROUTE_BY_ID, type Ticket } from "../src/game/data";
function game() {
  const g = newGame("mega", newPlayer("a", "Alice", 0));
  g.players.push(newPlayer("b", "Bob", 1));
  g.phase = "playing";
  return g;
}
describe("card payments and journey previews", () => {
  it("uses the dropped color, with only the locomotives needed", () => {
    const g = game();
    g.players[0].hand = ["red", "red", "blue", "wild", "wild"];
    const p = cardPayment(playerView(g, "a"), ROUTE_BY_ID.r0, "red");
    expect(p).toEqual({ color: "red", wilds: 1 });
    expect(
      cardPayment(playerView(g, "a"), ROUTE_BY_ID.r0, "green"),
    ).toBeUndefined();
    expect(cardPayment(playerView(g, "a"), ROUTE_BY_ID.r0, "wild")).toEqual({
      color: "red",
      wilds: 1,
    });
  });
  it("supports an all-locomotive payment and rejects blocked parallel tracks", () => {
    const g = game();
    g.players[0].hand = ["wild", "wild", "wild"];
    expect(cardPayment(playerView(g, "a"), ROUTE_BY_ID.r0, "wild")?.wilds).toBe(
      3,
    );
    g.claimed.r2 = "b";
    expect(
      cardPayment(playerView(g, "a"), ROUTE_BY_ID.r1, "wild"),
    ).toBeUndefined();
  });
  it("previews reuse owned routes and avoid an opponent’s routes", () => {
    const g = game();
    const ticket = { a: "Vancouver", b: "Portland" } as Ticket;
    g.claimed.r1 = "a";
    g.claimed.r5 = "a";
    expect(ticketPath(playerView(g, "a"), ticket)).toEqual(["r1", "r5"]);
    g.claimed.r1 = "b";
    const detour = ticketPath(playerView(g, "a"), ticket);
    expect(detour).not.toContain("r1");
    expect(detour).not.toContain("r2");
    expect(detour).toContain("r0");
  });
});
describe("parallel route geometry", () => {
  it("keeps the full lane separation through every bend, including Vancouver–Seattle", () => {
    expect(LANE_SPACING).toBeGreaterThan(TRAIN_HEIGHT + 6);
    for (const a of tracks) {
      const b = tracks.find(
        (b) =>
          b.route.id !== a.route.id &&
          b.route.a === a.route.a &&
          b.route.b === a.route.b,
      );
      if (!b) continue;
      for (let i = 0; i < a.samples.length; i++)
        expect(
          Math.hypot(
            a.samples[i][0] - b.samples[i][0],
            a.samples[i][1] - b.samples[i][1],
          ),
          `${a.route.id}/${b.route.id}, sample ${i}`,
        ).toBeCloseTo(LANE_SPACING, 6);
    }
  });
  it("draws every physical train slot with a positive width", () => {
    for (const t of tracks) {
      expect(t.cars).toHaveLength(t.route.length);
      for (const car of t.cars) expect(car.width).toBeGreaterThan(10);
    }
  });
});
