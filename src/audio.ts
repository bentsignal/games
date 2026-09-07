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
export function cue(
  kind:
    | "card"
    | "draw"
    | "claim"
    | "turn"
    | "tickets"
    | "complete"
    | "cash"
    | "buzzer"
    | "score-step"
    | "score-tick"
    | "finale",
) {
  if (!enabled) return;
  void unlockAudio().then(() => {
    if (!enabled || !context || context.state !== "running") return;
    const ctx = context,
      now = ctx.currentTime;
    if (kind === "cash") {
      // Register key and drawer clacks, followed by a bright double bell.
      noise(ctx, now, 0.045, 0.22, 1100);
      noise(ctx, now + 0.1, 0.06, 0.16, 2200);
      for (const [delay, pitch] of [
        [0.1, 1568],
        [0.22, 2093],
      ])
        for (const [ratio, volume] of [
          [1, 0.11],
          [2.76, 0.025],
          [4.07, 0.008],
        ]) {
          const bell = ctx.createOscillator(),
            gain = ctx.createGain(),
            start = now + delay;
          bell.frequency.value = pitch * ratio;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(volume, start + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.65);
          bell.connect(gain).connect(ctx.destination);
          bell.start(start);
          bell.stop(start + 0.7);
          bell.onended = () => {
            bell.disconnect();
            gain.disconnect();
          };
        }
    } else if (kind === "buzzer") {
      // A short, low wrong-answer buzz with softened edges.
      const osc = ctx.createOscillator(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(147, now);
      osc.frequency.linearRampToValueAtTime(110, now + 0.38);
      filter.type = "lowpass";
      filter.frequency.value = 950;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.015);
      gain.gain.setValueAtTime(0.14, now + 0.28);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
      osc.connect(filter).connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } else if (kind === "score-tick") {
      noise(ctx, now, 0.026, 0.075, 850);
    } else if (kind === "score-step") {
      noise(ctx, now, 0.13, 0.12, 1500);
      noise(ctx, now + 0.09, 0.035, 0.18, 650);
    } else if (kind === "finale") {
      cue("turn");
      for (const [i, frequency] of [523.25, 659.25, 783.99, 1046.5].entries()) {
        const osc = ctx.createOscillator(),
          gain = ctx.createGain(),
          start = now + i * 0.18;
        osc.type = "triangle";
        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.05, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.75);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      }
    } else if (kind === "card") {
      noise(ctx, now, 0.055, 0.17, 2500);
      noise(ctx, now + 0.045, 0.035, 0.08, 1400);
    } else if (kind === "draw") {
      // One crisp paper snap and a brief low pop as the card lifts off the table.
      noise(ctx, now, 0.045, 0.3, 3900);
      const pop = ctx.createOscillator(),
        gain = ctx.createGain();
      pop.frequency.setValueAtTime(360, now);
      pop.frequency.exponentialRampToValueAtTime(95, now + 0.065);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.085);
      pop.connect(gain).connect(ctx.destination);
      pop.start(now);
      pop.stop(now + 0.09);
      pop.onended = () => {
        pop.disconnect();
        gain.disconnect();
      };
    } else if (kind === "tickets") {
      const count = 4;
      for (let i = 0; i < count; i++)
        noise(ctx, now + i * 0.07, 0.14, 0.18, 2100 + i * 350);
      noise(ctx, now + count * 0.07 + 0.04, 0.045, 0.1, 900);
    } else if (kind === "turn") {
      // A short three-note steam whistle, with a soft breath and slight vibrato.
      noise(ctx, now, 0.85, 0.1, 1800);
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
        gain.gain.linearRampToValueAtTime(0.06, now + 0.04);
        gain.gain.setValueAtTime(0.052, now + 0.45);
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
    } else if (kind === "complete") {
      // Two railway bell strikes; distinct from the turn whistle.
      for (const delay of [0, 0.28])
        for (const [frequency, level] of [
          [880, 0.07],
          [2376, 0.022],
          [4752, 0.009],
        ]) {
          const bell = ctx.createOscillator(),
            gain = ctx.createGain(),
            start = now + delay;
          bell.frequency.value = frequency;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(level, start + 0.004);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
          bell.connect(gain).connect(ctx.destination);
          bell.start(start);
          bell.stop(start + 0.95);
          bell.onended = () => {
            bell.disconnect();
            gain.disconnect();
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
