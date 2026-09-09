import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  grams: defineTable({ key: v.string(), state: v.any() }).index("by_key", [
    "key",
  ]),
  gramsFeed: defineTable({
    key: v.string(),
    events: v.any(),
    seq: v.number(),
  }).index("by_key", ["key"]),
  gramsRounds: defineTable({
    externalId: v.optional(v.string()),
    round: v.number(),
    startedAt: v.number(),
    finishedAt: v.number(),
    word: v.string(),
    players: v.any(),
  }).index("by_external", ["externalId"]),
  gramsPresence: defineTable({ player: v.string(), seen: v.number() }).index(
    "by_player",
    ["player"],
  ),
  users: defineTable({
    username: v.optional(v.string()),
    usernameKey: v.optional(v.string()),
    playerId: v.optional(v.string()),
  })
    .index("by_username", ["usernameKey"])
    .index("by_player", ["playerId"]),
  results: defineTable({
    room: v.id("rooms"),
    roundId: v.number(),
    mode: v.string(),
    finishedAt: v.number(),
    preview: v.boolean(),
    players: v.any(),
    scores: v.any(),
  }).index("by_round", ["room", "roundId"]),
  playerResults: defineTable({
    user: v.id("users"),
    result: v.id("results"),
    score: v.number(),
    winner: v.boolean(),
  })
    .index("by_user", ["user"])
    .index("by_result", ["result"]),
  rooms: defineTable({
    code: v.string(),
    game: v.any(),
    revision: v.number(),
    preview: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),
  sessions: defineTable({
    hash: v.string(),
    lastCreate: v.number(),
    lastChat: v.number(),
    createDay: v.optional(v.number()),
    createCount: v.optional(v.number()),
  }).index("by_hash", ["hash"]),
  messages: defineTable({
    room: v.id("rooms"),
    sender: v.string(),
    name: v.string(),
    text: v.string(),
    time: v.number(),
  }).index("by_room", ["room"]),
});
