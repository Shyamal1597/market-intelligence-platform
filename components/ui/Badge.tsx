import { clsx } from "clsx";

interface BadgeProps {
  label: string;
  variant: "results" | "board-meeting" | "insider-trade" | "ipo-drhp" | "general";
}

const VARIANT_STYLES: Record<BadgeProps["variant"], string> = {
  results: "bg-teal/15 text-teal border-teal/30",
  "board-meeting": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "insider-trade": "bg-amber/15 text-amber border-amber/30",
  "ipo-drhp": "bg-purple-500/15 text-purple-400 border-purple-500/30",
  general: "bg-white/5 text-muted border-white/10",
};

export function Badge({ label, variant }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium border whitespace-nowrap",
        VARIANT_STYLES[variant]
      )}
    >
      {label}
    </span>
  );
}
