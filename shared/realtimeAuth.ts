import { hmac } from "@noble/hashes/hmac.js";
import { sha256 } from "@noble/hashes/sha2.js";
const enc = new TextEncoder();
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const decode = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
export function signTicket(payload: Record<string, unknown>, secret: string) {
  const header = encode(
    enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const body = encode(enc.encode(JSON.stringify(payload)));
  return `${header}.${body}.${encode(hmac(sha256, enc.encode(secret), enc.encode(`${header}.${body}`)))}`;
}
export function verifyTicket(
  token: string,
  secret: string,
  audience: string,
  now = Date.now(),
): Record<string, any> {
  if (!secret || token.length > 64000) throw new Error("Invalid ticket");
  const [header, body, signature, extra] = token.split(".");
  if (!header || !body || !signature || extra)
    throw new Error("Invalid ticket");
  const expected = hmac(
    sha256,
    enc.encode(secret),
    enc.encode(`${header}.${body}`),
  );
  const actual = decode(signature);
  let diff = actual.length ^ expected.length;
  for (let i = 0; i < expected.length; i++)
    diff |= expected[i] ^ (actual[i] ?? 0);
  if (diff) throw new Error("Invalid ticket");
  const data = JSON.parse(new TextDecoder().decode(decode(body)));
  if (
    data.aud !== audience ||
    !Number.isFinite(data.exp) ||
    data.exp * 1000 <= now ||
    data.iss !== "games-realtime"
  )
    throw new Error("Expired or invalid ticket");
  return data;
}
