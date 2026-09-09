import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import confetti from "canvas-confetti";

export default function WinnerConfetti() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current || matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;
    // A fresh canvas per effect is important: a worker owns its transferred canvas.
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "width:100%;height:100%;display:block";
    host.current.append(canvas);
    const fire = confetti.create(canvas, {
      resize: true,
      useWorker: true,
      disableForReducedMotion: true,
    });
    const timers: ReturnType<typeof setTimeout>[] = [];
    const colors = [
      "#ffc629",
      "#fff0b4",
      "#f04b50",
      "#37bceb",
      "#55d388",
      "#d47dec",
    ];
    function cannons(count: number, speed: number, y: number) {
      for (const side of [0, 1])
        void fire({
          particleCount: count,
          angle: side ? 125 : 55,
          spread: 65,
          startVelocity: speed,
          gravity: 0.85,
          decay: 0.93,
          ticks: 310,
          scalar: 1.15,
          drift: side ? -0.25 : 0.25,
          origin: { x: side ? 0.98 : 0.02, y },
          colors,
          shapes: ["square", "circle"],
        });
    }
    cannons(95, 58, 0.76);
    timers.push(setTimeout(() => cannons(65, 48, 0.65), 240));
    timers.push(
      setTimeout(() => {
        void fire({
          particleCount: 120,
          spread: 130,
          startVelocity: 38,
          gravity: 0.7,
          decay: 0.94,
          ticks: 280,
          scalar: 1,
          origin: { x: 0.5, y: 0.52 },
          colors,
        });
      }, 650),
    );
    return () => {
      timers.forEach(clearTimeout);
      fire.reset();
      canvas.remove();
    };
  }, []);
  return createPortal(
    <div ref={host} className="winner-confetti" aria-hidden="true" />,
    document.body,
  );
}
