export const gramsCodePattern = /^[A-HJ-NP-Z2-9]{8}$/;

export function newGramsCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
}
