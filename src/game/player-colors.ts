import type { View } from "./engine";

export const SELF_GOLD = "#ffc629";
const OPPONENT_COLORS = ["#f01822", "#163dee", "#1bdd30", "#d519eb", "#10bccb"];

// Cosmetic only: room-seeded order survives renders/reconnects and never changes ownership.
export function playerDisplayColors(game: View | null | undefined, room = "") {
  if (!game) return {} as Record<string, string>;
  let seed = 2166136261;
  for (const c of room + game.players.map((p) => p.id).join("|"))
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619) >>> 0;
  const palette = [...OPPONENT_COLORS];
  for (let i = palette.length - 1; i > 0; i--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const j = seed % (i + 1);
    [palette[i], palette[j]] = [palette[j], palette[i]];
  }
  let next = 0;
  return Object.fromEntries(
    game.players.map((p) => [
      p.id,
      p.id === game.me?.id ? SELF_GOLD : palette[next++],
    ]),
  );
}
