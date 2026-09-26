// Explicitly enabled per tab in local development. Never record messages or identity.
const enabled =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  (() => {
    const value = new URLSearchParams(location.search).get("diagnostics");
    if (value !== null) sessionStorage.setItem("ticket-diagnostics", value);
    return sessionStorage.getItem("ticket-diagnostics") === "1";
  })();
const limit = 3000;
let counters: Record<string, number> = {};
let samples: Record<string, number[]> = {};
let frame: number | undefined;
let previous = 0;
function sample(name: string, value: number) {
  if (!enabled) return;
  const values = (samples[name] ??= []);
  if (values.length < limit) values.push(value);
}
export function diagnosticCount(name: string) {
  if (enabled) counters[name] = (counters[name] ?? 0) + 1;
}
export function diagnosticMeasure(name: string, started: number) {
  sample(name, performance.now() - started);
}
export function startDragDiagnostics() {
  if (!enabled || frame !== undefined) return;
  previous = performance.now();
  const tick = (now: number) => {
    sample("drag-frame", now - previous);
    previous = now;
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}
export function stopDragDiagnostics() {
  if (frame !== undefined) cancelAnimationFrame(frame);
  frame = undefined;
}
export const ticketDiagnostics = {
  enabled,
  reset() {
    counters = {};
    samples = {};
  },
  snapshot() {
    return {
      source:
        import.meta.env.MODE === "ticket-diagnostics"
          ? "offline-fixture, simulated chat"
          : "local-development",
      capturedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      counters: { ...counters },
      samples: structuredClone(samples),
      summary: Object.fromEntries(
        Object.entries(samples).map(([name, values]) => {
          const sorted = [...values].sort((a, b) => a - b);
          return [
            name,
            {
              count: sorted.length,
              p95: sorted[Math.floor((sorted.length - 1) * 0.95)],
              max: sorted.at(-1),
            },
          ];
        }),
      ),
    };
  },
  download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(this.snapshot(), null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "ticket-diagnostics.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
if (enabled) {
  Object.assign(window, { ticketDiagnostics });
  if (typeof PerformanceObserver !== "undefined") {
    for (const type of ["longtask", "event"]) {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) sample(type, entry.duration);
      });
      observer.observe({
        type,
        buffered: true,
        ...(type === "event" ? { durationThreshold: 16 } : {}),
      });
    }
  }
  window.addEventListener("blur", stopDragDiagnostics);
}
