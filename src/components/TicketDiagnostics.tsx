import { ticketDiagnostics } from "../game/diagnostics";
export default function TicketDiagnostics() {
  if (!ticketDiagnostics.enabled) return null;
  return (
    <aside className="ticket-diagnostics" aria-label="Performance diagnostics">
      <span>Performance recording enabled</span>
      <button onClick={() => ticketDiagnostics.reset()}>Reset recording</button>
      <button onClick={() => ticketDiagnostics.download()}>
        Download diagnostics
      </button>
    </aside>
  );
}
