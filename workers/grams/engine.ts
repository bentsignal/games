import chooseData from "../../convex/gramsData/choose.json";
import allowData from "../../convex/gramsData/allow.json";
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
export type Player = {
  id: string;
  userId: string;
  name: string;
  pfp: string;
  score: number;
  wins: number;
  words: string[];
  lastGuess?: number;
  lastChat?: number;
  lastEmote?: number;
};
export type State = {
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
export const fresh = (): State => ({
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
export function leave(s: State, id: string) {
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

export type Identity = { id: string; userId: string; name: string };
export function view(s: State, identity: Identity, now = Date.now()) {
  return {
    ...s,
    events: [],
    word: s.phase === "finished" ? s.word : "",
    players: s.players.map((p) => publicPlayer(p, s.phase === "finished")),
    me: s.players.find((p) => p.id === identity.id)
      ? publicPlayer(
          s.players.find((p) => p.id === identity.id)!,
          true,
        )
      : null,
    ...identity,
    serverNow: now,
  };
}
export function command(
  s: State,
  identity: Identity,
  a: any,
  now = Date.now(),
) {
  const { id, name } = identity;
  if (
    !a ||
    ![
      "requestJoin",
      "leave",
      "wordSubmit",
      "requestStart",
      "chatSent",
      "pfpRequestChange",
      "emoteSent",
    ].includes(a.kind)
  )
    throw new Error("Unknown command");
  for (const key of ["word", "message", "pfp", "emote"])
    if (
      a[key] !== undefined &&
      (typeof a[key] !== "string" || a[key].length > 400)
    )
      throw new Error("Invalid command");
  if (a.size !== undefined && ![6, 7, 8].includes(a.size))
    throw new Error("Invalid round size");
  let p = s.players.find((p) => p.id === id);
  let response: any = null;
  if (a.kind === "requestJoin") {
    if (!p) {
      if (s.phase === "playing") throw new Error("Game currently in progress");
      if (s.players.length >= 6) throw new Error("Lobby is currently full");
      p = {
        id,
        userId: identity.userId,
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
  } else {
    if (!p) throw new Error("Join the game first.");
    if (a.kind === "leave") leave(s, id);
    if (a.kind === "wordSubmit") {
      const word = (a.word ?? "").toLowerCase();
      if (now - (p.lastGuess ?? 0) < 80) return { accepted: false };
      p.lastGuess = now;
      const remaining = [...s.letters];
      const lettersOK = [...word].every((l) => {
        const i = remaining.indexOf(l);
        if (i < 0) return false;
        remaining.splice(i, 1);
        return true;
      });
      const accepted =
        s.phase === "playing" &&
        now >= s.startAt &&
        now < s.endAt &&
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
      if (s.host !== id) throw new Error("Only the host can start.");
      if (s.phase === "playing") throw new Error("Game currently in progress");
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
      s.startAt = now + 4000;
      s.endAt = s.startAt + 61000;
    }
    if (a.kind === "chatSent") {
      const message = (a.message ?? "").trim();
      if (!message || message.length > 400 || message.split(" ").length > 100)
        throw new Error("Message must be between 1 and 400 characters.");
      if (now - (p.lastChat ?? 0) < 500) throw new Error("Please slow down.");
      p.lastChat = now;
      event(s, "newMessage", { sender: p.name, message });
    }
    if (a.kind === "pfpRequestChange") {
      if (
        !portraits.includes(a.pfp ?? "") ||
        s.players.some((p) => p.pfp === a.pfp)
      )
        throw new Error("That picture is taken.");
      p.pfp = a.pfp!;
    }
    if (a.kind === "emoteSent") {
      if (!emotes.includes(a.emote ?? "")) throw new Error("Unknown emote.");
      if (now - (p.lastEmote ?? 0) < 500) throw new Error("Please slow down.");
      p.lastEmote = now;
      event(s, "emoteReceived", { sender: p.name, id, emote: a.emote });
    }
  }

  return response;
}
export function finish(s: State, now = Date.now()) {
  if (s.phase !== "playing" || now < s.endAt) return false;
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

  return true;
}
