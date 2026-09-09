import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v, ConvexError } from "convex/values";
import { requirePlayer } from "./users";
import chooseData from "./gramsData/choose.json";
import allowData from "./gramsData/allow.json";
const choose = chooseData as Record<string, Record<string, string[]>>;
const allow = allowData as Record<string, Record<string, string[]>>;
const points: Record<number, number> = {
  1: 5,
  2: 10,
  3: 50,
  4: 100,
  5: 300,
  6: 600,
  7: 1000,
  8: 2000,
};
const portraits = ["ben", "lukas"].flatMap((n) =>
  [1, 2, 3, 4].map((i) => `${n}-face-${i}.jpg`),
);
const emotes = [
  ...portraits.map((p) => p.replace(".jpg", "")),
  ...[1, 2, 3, 4].map((i) => `ben-emote-${i}`),
];
type Player = {
  id: string;
  name: string;
  pfp: string;
  score: number;
  wins: number;
  words: string[];
  lastGuess?: number;
  lastChat?: number;
  lastEmote?: number;
};
type State = {
  host: string;
  players: Player[];
  round: number;
  phase: "lobby" | "playing" | "finished";
  word: string;
  letters: string[];
  startAt: number;
  endAt: number;
  events: { seq: number; kind: string; data: any }[];
  seq: number;
};
const fresh = (): State => ({
  host: "",
  players: [],
  round: 0,
  phase: "lobby",
  word: "",
  letters: [],
  startAt: 0,
  endAt: 0,
  events: [],
  seq: 0,
});
const event = (s: State, kind: string, data: any) => {
  s.events.push({ seq: ++s.seq, kind, data });
  s.events = s.events.slice(-60);
};
const publicPlayer = (p: Player, words = false) => ({
  id: p.id,
  name: p.name,
  pfp: p.pfp,
  score: p.score,
  wins: p.wins,
  words: words ? p.words : [],
});
async function getRoom(ctx: any) {
  return ctx.db
    .query("grams")
    .withIndex("by_key", (q: any) => q.eq("key", "friends"))
    .unique();
}
async function touch(ctx: MutationCtx, id: string) {
  const row = await ctx.db
    .query("gramsPresence")
    .withIndex("by_player", (q) => q.eq("player", id))
    .unique();
  if (row) await ctx.db.patch(row._id, { seen: Date.now() });
  else {
    await ctx.db.insert("gramsPresence", { player: id, seen: Date.now() });
    await ctx.scheduler.runAfter(90000, internal.grams.reap, { player: id });
  }
}
function leave(s: State, id: string) {
  const p = s.players.find((p) => p.id === id);
  if (!p) return;
  s.players = s.players.filter((p) => p.id !== id);
  if (s.host === id) s.host = s.players[0]?.id ?? "";
  event(s, "newMessage", {
    sender: "Server",
    type: "bad",
    message: `${p.name} has left the game.`,
  });
  if (!s.players.length) {
    s.phase = "lobby";
    s.letters = [];
    s.word = "";
    s.round++;
  }
}
export const view = query({
  args: {},
  handler: async (ctx) => {
    const { id, name } = await requirePlayer(ctx);
    const room = await getRoom(ctx);
    const s: State = room?.state ?? fresh();
    return {
      ...s,
      events: [],
      word: s.phase === "finished" ? s.word : "",
      players: s.players.map((p) => publicPlayer(p, s.phase === "finished")),
      me: s.players.find((p) => p.id === id)
        ? publicPlayer(
            s.players.find((p) => p.id === id)!,
            true,
          )
        : null,
      id,
      name,
      serverNow: Date.now(),
    };
  },
});
export const heartbeat = mutation({
  args: {},
  handler: async (ctx) => {
    const { id } = await requirePlayer(ctx);
    const room = await getRoom(ctx);
    if ((room?.state as State | undefined)?.players.some((p) => p.id === id))
      await touch(ctx, id);
  },
});
export const command = mutation({
  args: {
    kind: v.union(
      ...(
        [
          "requestJoin",
          "leave",
          "wordSubmit",
          "requestStart",
          "chatSent",
          "pfpRequestChange",
          "emoteSent",
        ] as const
      ).map(v.literal),
    ),
    word: v.optional(v.string()),
    message: v.optional(v.string()),
    size: v.optional(v.number()),
    pfp: v.optional(v.string()),
    emote: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const { id, name } = await requirePlayer(ctx);
    let room = await getRoom(ctx);
    const s: State = room?.state ?? fresh();
    let p = s.players.find((p) => p.id === id);
    let response: any = null;
    if (a.kind === "requestJoin") {
      if (!p) {
        if (s.phase === "playing")
          throw new ConvexError("Game currently in progress");
        if (s.players.length >= 6)
          throw new ConvexError("Lobby is currently full");
        p = {
          id,
          name,
          pfp: portraits.find((f) => !s.players.some((p) => p.pfp === f))!,
          score: 0,
          wins: 0,
          words: [],
        };
        s.players.push(p);
        s.host ||= id;
        event(s, "newMessage", {
          sender: "Server",
          type: "good",
          message: `${name} has joined the game.`,
        });
      }
      await touch(ctx, id);
    } else {
      if (!p) throw new ConvexError("Join the game first.");
      if (a.kind === "leave") leave(s, id);
      if (a.kind === "wordSubmit") {
        const word = (a.word ?? "").toLowerCase();
        if (Date.now() - (p.lastGuess ?? 0) < 80) return { accepted: false };
        p.lastGuess = Date.now();
        const remaining = [...s.letters];
        const lettersOK = [...word].every((l) => {
          const i = remaining.indexOf(l);
          if (i < 0) return false;
          remaining.splice(i, 1);
          return true;
        });
        const accepted =
          s.phase === "playing" &&
          Date.now() >= s.startAt &&
          Date.now() < s.endAt &&
          word.length > 0 &&
          word.length <= 8 &&
          lettersOK &&
          !p.words.includes(word) &&
          !!allow[String(word.length)]?.[word[0]]?.includes(word);
        if (accepted) {
          p.words.push(word);
          p.score += points[word.length];
        }
        response = {
          accepted,
          word,
          points: accepted ? points[word.length] : 0,
          player: publicPlayer(p, true),
        };
      }
      if (a.kind === "requestStart") {
        if (s.host !== id) throw new ConvexError("Only the host can start.");
        if (s.phase === "playing")
          throw new ConvexError("Game currently in progress");
        const size = [6, 7, 8].includes(a.size ?? 0) ? a.size! : 6;
        const groups = Object.entries(choose[String(size)]).filter(
          ([l, words]) => l !== "z" && words.length,
        );
        const [, words] = groups[Math.floor(Math.random() * groups.length)];
        s.word = words[Math.floor(Math.random() * words.length)];
        s.letters = [...s.word];
        for (let i = s.letters.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [s.letters[i], s.letters[j]] = [s.letters[j], s.letters[i]];
        }
        s.players.forEach((p) => {
          p.score = 0;
          p.words = [];
        });
        s.phase = "playing";
        s.round++;
        s.startAt = Date.now() + 4000;
        s.endAt = s.startAt + 61000;
        if (!room) throw new Error("Room missing");
        await ctx.scheduler.runAt(s.endAt, internal.grams.finish, {
          round: s.round,
        });
      }
      if (a.kind === "chatSent") {
        const message = (a.message ?? "").trim();
        if (!message || message.length > 400 || message.split(" ").length > 100)
          throw new ConvexError(
            "Message must be between 1 and 400 characters.",
          );
        if (Date.now() - (p.lastChat ?? 0) < 500)
          throw new ConvexError("Please slow down.");
        p.lastChat = Date.now();
        event(s, "newMessage", { sender: p.name, message });
      }
      if (a.kind === "pfpRequestChange") {
        if (
          !portraits.includes(a.pfp ?? "") ||
          s.players.some((p) => p.pfp === a.pfp)
        )
          throw new ConvexError("That picture is taken.");
        p.pfp = a.pfp!;
      }
      if (a.kind === "emoteSent") {
        if (!emotes.includes(a.emote ?? ""))
          throw new ConvexError("Unknown emote.");
        if (Date.now() - (p.lastEmote ?? 0) < 500)
          throw new ConvexError("Please slow down.");
        p.lastEmote = Date.now();
        event(s, "emoteReceived", { sender: p.name, id, emote: a.emote });
      }
    }
    await saveEvents(ctx, s);
    if (room) await ctx.db.patch(room._id, { state: s });
    else await ctx.db.insert("grams", { key: "friends", state: s });
    return response;
  },
});
export const finish = internalMutation({
  args: { round: v.number() },
  handler: async (ctx, { round }) => {
    const room = await getRoom(ctx);
    if (!room) return;
    const s: State = room.state;
    if (s.round !== round || s.phase !== "playing" || Date.now() < s.endAt)
      return;
    s.phase = "finished";
    s.players.sort((a, b) => b.score - a.score);
    for (const p of s.players)
      if (p.score === s.players[0].score) {
        p.wins++;
        event(s, "newMessage", {
          sender: "Server",
          type: "good",
          message: `${p.name} has won the game with ${p.score} points!`,
        });
      }
    await saveEvents(ctx, s);
    await ctx.db.insert("gramsRounds", {
      round: s.round,
      startedAt: s.startAt,
      finishedAt: Date.now(),
      word: s.word,
      players: s.players.map((p) => publicPlayer(p, true)),
    });
    await ctx.db.patch(room._id, { state: s });
  },
});
export const reap = internalMutation({
  args: { player: v.string() },
  handler: async (ctx, { player }) => {
    const presence = await ctx.db
      .query("gramsPresence")
      .withIndex("by_player", (q) => q.eq("player", player))
      .unique();
    if (!presence) return;
    const wait = 90000 - (Date.now() - presence.seen);
    if (wait > 0) {
      await ctx.scheduler.runAfter(wait, internal.grams.reap, { player });
      return;
    }
    await ctx.db.delete(presence._id);
    const room = await getRoom(ctx);
    if (!room) return;
    const s: State = room.state;
    leave(s, player);
    await saveEvents(ctx, s);
    await ctx.db.patch(room._id, { state: s });
  },
});

async function saveEvents(ctx: MutationCtx, s: State) {
  if (!s.events.length) return;
  const feed = await ctx.db
    .query("gramsFeed")
    .withIndex("by_key", (q) => q.eq("key", "friends"))
    .unique();
  const events = [...(feed?.events ?? []), ...s.events].slice(-100);
  if (feed) await ctx.db.patch(feed._id, { events, seq: s.seq });
  else await ctx.db.insert("gramsFeed", { key: "friends", events, seq: s.seq });
  s.events = [];
}
export const feed = query({
  args: {},
  handler: async (ctx) => {
    await requirePlayer(ctx);
    const feed = await ctx.db
      .query("gramsFeed")
      .withIndex("by_key", (q) => q.eq("key", "friends"))
      .unique();
    return { events: feed?.events ?? [], seq: feed?.seq ?? 0 };
  },
});
