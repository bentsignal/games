// UI-only identifiers. getRandomValues is available on HTTP LAN origins too.
export function clientId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
