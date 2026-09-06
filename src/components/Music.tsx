import { useEffect, useState } from "react";
import { Music2, Volume2, VolumeX, X, ExternalLink } from "lucide-react";
import { effectsEnabled, setEffects, unlockAudio } from "../audio";
export default function Music() {
  const [open, setOpen] = useState(false),
    [effects, toggleEffects] = useState(effectsEnabled);
  useEffect(() => {
    const unlock = () => {
      void unlockAudio();
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
  return (
    <div className="music-control">
      <button
        className={`nav-help ${open ? "music-active" : ""}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Music and sound"
      >
        <Music2 size={17} />
        <span>Music</span>
      </button>
      {open && (
        <section className="music-panel" aria-label="Music and sound settings">
          <div className="music-heading">
            <span>THE OBSERVATION CAR</span>
            <button
              className="icon"
              aria-label="Close music player"
              onClick={() => setOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          <h3>A little travelling music.</h3>
          <p>Ticket to Ride · America</p>
          <iframe
            title="Ticket to Ride America soundtrack on YouTube"
            src="https://www.youtube-nocookie.com/embed/jBZochITFMs?loop=1&playlist=jBZochITFMs&rel=0"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
          <div className="music-footer">
            <a
              href="https://www.youtube.com/watch?v=jBZochITFMs"
              target="_blank"
              rel="noreferrer"
            >
              Open on YouTube <ExternalLink size={12} />
            </a>
            <button
              onClick={() => {
                setEffects(!effects);
                toggleEffects(!effects);
              }}
              aria-pressed={effects}
            >
              {effects ? <Volume2 size={15} /> : <VolumeX size={15} />} Effects{" "}
              {effects ? "on" : "off"}
            </button>
          </div>
          <small>Press play above. Closing this player stops the music.</small>
        </section>
      )}
    </div>
  );
}
