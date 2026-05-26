import { QUICK_LINKS } from "@/lib/quick-links";
import { ExternalLink } from "lucide-react";

export function QuickLinksPreview() {
  // Show first 8 links across all sections
  const links = QUICK_LINKS.flatMap((s) => s.links).slice(0, 8);
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {links.map((link) => (
        <a
          key={link.url}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-start gap-2 p-3 rounded-lg border border-border bg-base/60 hover:border-amber/30 hover:bg-border/40 transition-all"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-primary group-hover:text-amber transition-colors truncate">
              {link.name}
            </p>
            <p className="text-xs text-muted mt-0.5 line-clamp-2 leading-snug">
              {link.description}
            </p>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors shrink-0 mt-0.5" />
        </a>
      ))}
    </div>
  );
}
