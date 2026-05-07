import { clsx } from "clsx";

interface BadgeProps {
  label: string;
  variant: "results" | "board-meeting" | "insider-trade" | "ipo-drhp" | "general" | "corporate-action" | "annual-report" | "investor-complaint";
}

const VARIANT_STYLES: Record<BadgeProps["variant"], string> = {
  results:              "bg-teal/[0.12]           text-teal          border-teal/25",
  "board-meeting":      "bg-sky-500/[0.12]        text-sky-400       border-sky-500/25",
  "insider-trade":      "bg-amber/[0.12]          text-amber         border-amber/25",
  "ipo-drhp":           "bg-rose-500/[0.12]       text-rose-400      border-rose-500/25",
  general:              "bg-white/[0.05]          text-muted         border-white/10",
  "corporate-action":   "bg-violet-500/[0.12]     text-violet-400    border-violet-500/25",
  "annual-report":      "bg-emerald-500/[0.12]    text-emerald-400   border-emerald-500/25",
  "investor-complaint": "bg-orange-500/[0.12]     text-orange-400    border-orange-500/25",
};

export function Badge({ label, variant }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded text-10px font-mono font-medium border whitespace-nowrap",
        VARIANT_STYLES[variant]
      )}
    >
      {label}
    </span>
  );
}
