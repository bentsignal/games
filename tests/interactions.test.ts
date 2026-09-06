import { describe, it, expect } from "vitest";
import {
  tracks,
  cities,
  LANE_SPACING,
  TRAIN_HEIGHT,
  TRAIN_WIDTH,
  routeAtMapPoint,
} from "../src/game/map-layout";
import {
  automaticRoute,
  parallelBlockReason,
  cardPayment,
  ticketPath,
  destinationCityStatus,
} from "../src/game/interactions";
import { newGame, newPlayer, playerView } from "../src/game/engine";
import { collisions } from "./helpers/map-collisions";
import { ROUTE_BY_ID, type Ticket } from "../src/game/data";
import { playerDisplayColors, SELF_GOLD } from "../src/game/player-colors";
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
  it("automatically uses a consistent lane regardless of the drop side", () => {
    const g = game();
    g.players[0].hand = ["red", "red", "yellow", "yellow"];
    const view = () => playerView(g, "a");
    expect(automaticRoute(view(), ROUTE_BY_ID.r2, "red")?.id).toBe("r1");
    g.claimed.r1 = "a";
    expect(automaticRoute(view(), ROUTE_BY_ID.r6, "red")?.id).toBe("r5");
    expect(automaticRoute(view(), ROUTE_BY_ID.r2, "red")).toBeUndefined();
    delete g.claimed.r1;
    g.claimed.r2 = "a";
    expect(automaticRoute(view(), ROUTE_BY_ID.r5, "red")?.id).toBe("r6");
    delete g.claimed.r2;
    g.claimed.r1 = "b";
    expect(automaticRoute(view(), ROUTE_BY_ID.r1, "red")).toBeUndefined();
    g.players.push(newPlayer("c", "Carol", 2), newPlayer("d", "Dave", 3));
    expect(automaticRoute(view(), ROUTE_BY_ID.r1, "red")?.id).toBe("r2");
    // A yellow card dropped over the red Boston lane still claims yellow.
    expect(automaticRoute(view(), ROUTE_BY_ID.r96, "yellow")?.id).toBe("r95");
  });
  it("explains the standard small-game closure and keeps the other side playable with four players", () => {
    const g = game();
    g.players[0].hand = ["yellow"];
    g.claimed.r1 = "a";
    g.claimed.r5 = "b";
    expect(parallelBlockReason(playerView(g, "a"), ROUTE_BY_ID.r6)).toContain(
      "2–3 player",
    );
    expect(
      automaticRoute(playerView(g, "a"), ROUTE_BY_ID.r5, "yellow"),
    ).toBeUndefined();
    g.players.push(newPlayer("c", "Carol", 2), newPlayer("d", "Dave", 3));
    expect(
      parallelBlockReason(playerView(g, "a"), ROUTE_BY_ID.r6),
    ).toBeUndefined();
    expect(
      automaticRoute(playerView(g, "a"), ROUTE_BY_ID.r5, "yellow")?.id,
    ).toBe("r6");
    g.claimed.r5 = "a";
    expect(parallelBlockReason(playerView(g, "a"), ROUTE_BY_ID.r6)).toContain(
      "cannot claim both",
    );
    expect(
      automaticRoute(playerView(g, "a"), ROUTE_BY_ID.r6, "yellow"),
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
describe("destination city markers", () => {
  it("makes every viewer gold and gives opponents unique, stable game colors", () => {
    const g = game();
    g.players.push(
      newPlayer("c", "Carol", 2),
      newPlayer("d", "Dave", 3),
      newPlayer("e", "Erin", 4),
    );
    for (const p of g.players) {
      const colors = playerDisplayColors(playerView(g, p.id), "ROOM1234");
      expect(colors[p.id]).toBe(SELF_GOLD);
      expect(new Set(Object.values(colors)).size).toBe(5);
      expect(
        playerDisplayColors(playerView(structuredClone(g), p.id), "ROOM1234"),
      ).toEqual(colors);
      expect(playerDisplayColors(playerView(g, p.id), "OTHER567")).not.toEqual(
        colors,
      );
    }
  });
  it("keeps shared endpoints blue until every owned ticket is complete", () => {
    const g = game();
    g.players[0].tickets = ["t62", "t59"];
    const status = () => destinationCityStatus(playerView(g, "a"));
    expect(status()).toEqual({
      Vancouver: "incomplete",
      Portland: "incomplete",
      Denver: "incomplete",
    });
    g.claimed.r1 = "a";
    g.claimed.r5 = "a";
    expect(status()).toEqual({
      Vancouver: "incomplete",
      Portland: "complete",
      Denver: "incomplete",
    });
    g.players[0].tickets.reverse();
    expect(status().Vancouver).toBe("incomplete");
    g.claimed.r4 = "a";
    g.claimed.r21 = "a";
    expect(status()).toEqual({
      Vancouver: "complete",
      Portland: "complete",
      Denver: "complete",
    });
  });
  it("uses only kept tickets and the player's own claimed network", () => {
    const g = game();
    g.players[0].tickets = ["t62"];
    g.players[0].pending = ["t59"];
    g.players[1].tickets = ["t54"];
    g.claimed.r1 = "b";
    g.claimed.r5 = "b";
    expect(destinationCityStatus(playerView(g, "a"))).toEqual({
      Vancouver: "incomplete",
      Portland: "incomplete",
    });
    g.players[0].tickets = [];
    expect(destinationCityStatus(playerView(g, "a"))).toEqual({});
    expect(destinationCityStatus(null)).toEqual({});
  });
});
describe("parallel route geometry", () => {
  it("keeps the full lane separation through every bend, including Vancouver–Seattle", () => {
    expect(LANE_SPACING).toBeGreaterThan(TRAIN_HEIGHT + 4);
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
  it("hit-tests physical slots consistently without DOM hit testing", () => {
    for (const t of tracks)
      for (const car of t.cars) {
        const hit = ROUTE_BY_ID[routeAtMapPoint(car.x, car.y)!];
        expect([hit.a, hit.b]).toEqual([t.route.a, t.route.b]);
      }
    expect(routeAtMapPoint(-100, -100)).toBeUndefined();
  });
  it("has no overlapping trains anywhere, even with all 100 routes filled", () => {
    expect(collisions()).toEqual([]);
  });
  it("keeps Los Angeles–El Paso above Baja rather than looping through it", () => {
    const route = tracks.find((t) => t.route.id === "r16")!;
    expect(Math.max(...route.cars.map((c) => c.y))).toBeLessThan(
      cities["El Paso"][1] + 40,
    );
  });
  it("uses exactly the same physical piece size for every route", () => {
    for (const t of tracks) {
      expect(t.cars).toHaveLength(t.route.length);
      for (const car of t.cars) expect(car.width).toBe(TRAIN_WIDTH);
    }
  });
});
