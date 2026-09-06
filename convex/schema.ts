import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  rooms: defineTable({
    code: v.string(),
    game: v.any(),
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_code", ["code"]),
  sessions: defineTable({
    hash: v.string(),
    lastCreate: v.number(),
    lastChat: v.number(),
  }).index("by_hash", ["hash"]),
  messages: defineTable({
    room: v.id("rooms"),
    sender: v.string(),
    name: v.string(),
    text: v.string(),
    time: v.number(),
  }).index("by_room", ["room"]),
});
