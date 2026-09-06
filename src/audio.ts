// Small original synthesized cues; no third-party audio files.
let context: AudioContext | undefined;
let enabled = localStorage.getItem("railbound-effects") !== "off";
export function setEffects(value: boolean) {
  enabled = value;
  localStorage.setItem("railbound-effects", value ? "on" : "off");
  if (value) void unlockAudio();
}
export function effectsEnabled() {
  return enabled;
}
export async function unlockAudio() {
  if (!enabled) return;
  try {
    context ??= new AudioContext();
    if (context.state === "suspended") await context.resume();
  } catch {
    /* Audio is optional. */
  }
}
export function cue(kind: "draw" | "claim" | "turn" | "tickets") {
  if (!enabled || !context || context.state !== "running") return;
  const ctx = context,
    now = ctx.currentTime;
  const notes =
    kind === "claim"
      ? [523.25, 659.25, 783.99, 1046.5]
      : kind === "turn"
        ? [659.25, 880]
        : kind === "tickets"
          ? [392, 523.25]
          : [880, 660];
  notes.forEach((frequency, i) => {
    const osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      start = now + i * (kind === "draw" ? 0.025 : 0.09);
    osc.type = "triangle";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(
      kind === "draw" ? 0.025 : 0.045,
      start + 0.008,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.23);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.25);
  });
}
