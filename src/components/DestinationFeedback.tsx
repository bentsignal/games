import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { connected, type View } from "../game/engine";
import { TICKET_BY_ID } from "../game/data";
import { cue } from "../audio";

export function useDestinationFeedback(
  game: View | null | undefined,
  room: string,
) {
  const previous = useRef<{ scope: string; completed: string[] } | null>(null);
  const [celebration, setCelebration] = useState<{
    id: number;
    tickets: string[];
  } | null>(null);
  const sequence = useRef(0);
  useEffect(() => {
    if (!game?.me) return;
    const scope = `${room}:${game.me.id}`;
    const completed = game.me.tickets.filter((id) => {
      const t = TICKET_BY_ID[id];
      return connected(game, game.me!.id, t.a, t.b);
    });
    const before = previous.current;
    previous.current = { scope, completed };
    if (
      !before ||
      before.scope !== scope ||
      game.phase === "lobby" ||
      game.phase === "setup"
    ) {
      setCelebration(null);
      return;
    }
    const tickets = completed.filter((id) => !before.completed.includes(id));
    if (tickets.length) {
      setCelebration({ id: ++sequence.current, tickets });
      cue("complete");
    }
  }, [room, game?.me?.id, game?.me?.tickets, game?.claimed, game?.phase]);
  useEffect(() => {
    if (!celebration) return;
    const timer = setTimeout(() => setCelebration(null), 3200);
    return () => clearTimeout(timer);
  }, [celebration]);
  return celebration;
}

export default function DestinationFeedback({
  tickets,
}: {
  tickets: string[];
}) {
  return (
    <div className="destination-completion" role="status">
      <Check size={24} aria-hidden="true" />
      <div>
        <strong>
          {tickets.length === 1
            ? "Destination complete"
            : "Destinations complete"}
        </strong>
        {tickets.map((id) => {
          const t = TICKET_BY_ID[id];
          return (
            <span key={id}>
              {t.a} – {t.b} <b>+{t.points}</b>
            </span>
          );
        })}
      </div>
    </div>
  );
}
