// A player's rating change from one match: "+14" in green, "−9" in red.
// Renders nothing when there is no change to show (match not rated yet).
export default function RatingDelta({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value == null || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  const color = n > 0
    ? "text-emerald-600 dark:text-emerald-400"
    : n < 0
    ? "text-rose-500 dark:text-rose-400"
    : "text-slate-400";
  const text = n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "±0";
  return (
    <span title="Rating change"
      className={`text-xs font-bold tabular-nums flex-shrink-0 ${color} ${className}`}>
      {text}
    </span>
  );
}

/** "1534", or "Provisional" until the player has enough rated matches. */
export function RatingValue({ rating, provisional, className = "" }: { rating: number; provisional: boolean; className?: string }) {
  if (provisional) {
    return (
      <span className={`text-[11px] font-semibold uppercase tracking-wide text-slate-400 ${className}`}>Provisional</span>
    );
  }
  return <span className={`font-black tabular-nums ${className}`}>{Math.round(rating)}</span>;
}
