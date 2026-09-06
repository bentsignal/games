// Original paper/card and steam-whistle sounds, synthesized locally.
let context: AudioContext | undefined;
let paperNoise: AudioBuffer | undefined;
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
    /* Sound is optional. */
  }
}
function noise(
  ctx: AudioContext,
  start: number,
  duration: number,
  volume: number,
  frequency: number,
) {
  if (!paperNoise) {
    paperNoise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = paperNoise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    gain = ctx.createGain();
  source.buffer = paperNoise;
  filter.type = "bandpass";
  filter.Q.value = 0.65;
  filter.frequency.setValueAtTime(frequency, start);
  filter.frequency.exponentialRampToValueAtTime(
    frequency * 0.55,
    start + duration,
  );
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(
    volume,
    start + Math.min(0.018, duration / 5),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}
export function cue(kind: "card" | "draw" | "claim" | "turn" | "tickets") {
  if (!enabled) return;
  void unlockAudio().then(() => {
    if (!enabled || !context || context.state !== "running") return;
    const ctx = context,
      now = ctx.currentTime;
    if (kind === "card") {
      noise(ctx, now, 0.055, 0.17, 2500);
      noise(ctx, now + 0.045, 0.035, 0.08, 1400);
    } else if (kind === "draw" || kind === "tickets") {
      const count = kind === "tickets" ? 4 : 2;
      for (let i = 0; i < count; i++)
        noise(ctx, now + i * 0.07, 0.14, 0.18, 2100 + i * 350);
      noise(ctx, now + count * 0.07 + 0.04, 0.045, 0.1, 900);
    } else if (kind === "turn") {
      // A short three-note steam whistle, with a soft breath and slight vibrato.
      noise(ctx, now, 0.85, 0.065, 1800);
      for (const frequency of [311.13, 392, 466.16]) {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        const vibrato = ctx.createOscillator(),
          depth = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(frequency * 0.92, now);
        osc.frequency.exponentialRampToValueAtTime(frequency, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(
          frequency * 0.98,
          now + 0.75,
        );
        vibrato.frequency.value = 4.8;
        depth.gain.value = 2;
        vibrato.connect(depth).connect(osc.frequency);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.025, now + 0.1);
        gain.gain.setValueAtTime(0.022, now + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        vibrato.start(now);
        osc.stop(now + 0.9);
        vibrato.stop(now + 0.9);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
          vibrato.disconnect();
          depth.disconnect();
        };
      }
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain(),
          start = now + i * 0.09;
        osc.type = "triangle";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.035, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.23);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.25);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      });
    }
  });
}
