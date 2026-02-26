import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6">
      <p className="font-mono text-8xl font-bold text-amber mb-4 opacity-60">404</p>
      <h1 className="font-display text-4xl text-primary mb-3">Page not found</h1>
      <p className="text-muted font-sans mb-8 max-w-sm">
        This page doesn&apos;t exist in the research platform.
      </p>
      <Link
        href="/"
        className="px-5 py-2.5 border border-amber/40 text-amber rounded-lg hover:bg-amber/10 transition-colors text-sm font-mono"
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}
