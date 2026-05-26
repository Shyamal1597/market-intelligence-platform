import { QUICK_LINKS } from "@/lib/quick-links";
import { ExternalLink, Building2, Scale, Search, BarChart2, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Building2,
  Scale,
  Search,
  BarChart2,
  Globe,
};

export default function LinksPage() {
  return (
    <div className="p-6">
      <div className="mb-10">
        <h1 className="font-display text-5xl font-semibold text-primary tracking-tight">
          Quick Links
        </h1>
        <p className="text-muted text-sm mt-1 font-sans">
          Curated resources for the research team
        </p>
      </div>

      <div className="space-y-12">
        {QUICK_LINKS.map((section) => {
          const Icon = ICONS[section.icon] ?? Globe;
          return (
            <section key={section.title}>
              {/* Section header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-amber/10 border border-amber/20 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-amber" />
                </div>
                <h2 className="font-display text-2xl font-semibold text-primary tracking-tight">
                  {section.title}
                </h2>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Link cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {section.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative flex flex-col justify-between p-4 rounded-xl border border-border bg-surface hover:bg-surface/80 hover:border-amber/30 transition-all overflow-hidden"
                  >
                    {/* Amber left accent bar — animates on hover */}
                    <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber scale-y-0 group-hover:scale-y-100 transition-transform duration-200 origin-bottom rounded-r-full" />

                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm font-semibold text-primary group-hover:text-amber transition-colors leading-snug">
                          {link.name}
                        </p>
                        <ExternalLink className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors shrink-0 mt-0.5" />
                      </div>
                      <p className="text-xs text-muted leading-snug line-clamp-2">
                        {link.description}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
