type StatusPillProps = {
  status: string;
};

const statusTone: Record<string, string> = {
  OPEN: "status-open",
  WINNER_LOCKED: "status-locked",
  CANCELLED: "status-cancelled",
  SETTLED: "status-settled"
};

export function StatusPill({ status }: StatusPillProps) {
  return <span className={`status-pill ${statusTone[status] ?? ""}`}>{status.replaceAll("_", " ")}</span>;
}

