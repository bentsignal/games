import { useEffect, useRef, useState } from "react";
import {
  Music2,
  Volume2,
  VolumeX,
  X,
  ExternalLink,
  Play,
  Pause,
  Settings2,
} from "lucide-react";
import { effectsEnabled, setEffects, unlockAudio } from "../audio";
interface Player {
  playVideo(): void;
  pauseVideo(): void;
  setVolume(value: number): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}
interface PlayerEvent {
  target: Player;
  data?: number;
}
interface YouTube {
  Player: new (
    el: HTMLElement,
    options: {
      host: string;
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: Record<string, (e: PlayerEvent) => void>;
    },
  ) => Player;
}
declare global {
  interface Window {
    YT?: YouTube;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let apiPromise: Promise<YouTube> | undefined;
function youtube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return (apiPromise ??= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = undefined;
      reject(Error("YouTube could not load"));
    };
    document.head.appendChild(script);
  }));
}
export default function Music() {
  const [open, setOpen] = useState(false),
    [effects, toggleEffects] = useState(effectsEnabled);
  const [status, setStatus] = useState<
    "loading" | "playing" | "paused" | "blocked" | "unavailable"
  >("loading");
  const [volume, setVolume] = useState(() =>
    Number(localStorage.getItem("railbound-volume") ?? 25),
  );
  const desired = useRef(localStorage.getItem("railbound-music") !== "off");
  const player = useRef<Player | null>(null),
    mount = useRef<HTMLDivElement>(null),
    ready = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void youtube()
      .then((YT) => {
        if (cancelled || !mount.current) return;
        const container = document.createElement("div");
        mount.current.appendChild(container);
        player.current = new YT.Player(container, {
          host: "https://www.youtube-nocookie.com",
          videoId: "jBZochITFMs",
          width: "100%",
          height: "210",
          playerVars: {
            autoplay: desired.current ? 1 : 0,
            loop: 1,
            playlist: "jBZochITFMs",
            rel: 0,
            playsinline: 1,
            origin: location.origin,
          },
          events: {
            onReady: (e) => {
              ready.current = true;
              e.target.getIframe().title =
                "Ticket to Ride America soundtrack on YouTube";
              e.target.getIframe().allow =
                "autoplay; encrypted-media; picture-in-picture; fullscreen";
              e.target.setVolume(
                Number(localStorage.getItem("railbound-volume") ?? 25),
              );
              if (desired.current) e.target.playVideo();
              else setStatus("paused");
            },
            onStateChange: (e) => {
              if (e.data === 1) setStatus("playing");
              else if (e.data === 2) {
                desired.current = false;
                localStorage.setItem("railbound-music", "off");
                setStatus("paused");
              }
            },
            onAutoplayBlocked: () => setStatus("blocked"),
            onError: () => setStatus("unavailable"),
          },
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("unavailable");
      });
    // Browser autoplay rules may require the first gesture. Do not retry after
    // an intentional pause; the user's sound preferences survive navigation.
    const gesture = () => {
      void unlockAudio();
      if (desired.current && ready.current) player.current?.playVideo();
    };
    window.addEventListener("pointerdown", gesture, { once: true });
    window.addEventListener("keydown", gesture, { once: true });
    return () => {
      cancelled = true;
      ready.current = false;
      player.current?.destroy();
      player.current = null;
      window.removeEventListener("pointerdown", gesture);
      window.removeEventListener("keydown", gesture);
    };
  }, []);
  function toggle() {
    const play =
      status !== "playing" && !(status === "loading" && desired.current);
    desired.current = play;
    localStorage.setItem("railbound-music", play ? "on" : "off");
    if (play) {
      player.current?.playVideo();
      setStatus("loading");
    } else {
      player.current?.pauseVideo();
      setStatus("paused");
    }
  }
  const playing =
    status === "playing" || (status === "loading" && desired.current);
  return (
    <div className="music-control">
      <button
        className={`nav-help ${playing ? "music-active" : ""}`}
        aria-label={playing ? "Pause music" : "Play music"}
        title={playing ? "Pause music" : "Play music"}
        onClick={toggle}
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
        <span>Music</span>
      </button>
      <button
        className="icon sound-settings"
        aria-label="Music and sound"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Settings2 size={15} />
      </button>
      <section
        className="music-panel"
        aria-label="Music and sound settings"
        hidden={!open}
      >
        <div className="music-heading">
          <span>
            <Music2 size={14} /> AMERICA
          </span>
          <button
            className="icon"
            aria-label="Close music settings"
            onClick={() => setOpen(false)}
          >
            <X size={17} />
          </button>
        </div>
        {/* This player belongs to the app session, not to the settings toggle. */}
        <div className="youtube-mount" ref={mount} />
        <div className="music-playback">
          <button className="secondary" onClick={toggle}>
            {playing ? <Pause size={14} /> : <Play size={14} />}{" "}
            {playing ? "Pause" : "Play"}
          </button>
          <label>
            Volume
            <input
              aria-label="Music volume"
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                localStorage.setItem("railbound-volume", String(v));
                player.current?.setVolume(v);
              }}
            />
          </label>
        </div>
        <div className="music-footer">
          <a
            href="https://www.youtube.com/watch?v=jBZochITFMs"
            target="_blank"
            rel="noreferrer"
          >
            YouTube <ExternalLink size={12} />
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
        {status === "blocked" && <small>Press play to start the music.</small>}
        {status === "unavailable" && (
          <small>YouTube is unavailable. You can try the link above.</small>
        )}
      </section>
    </div>
  );
}
