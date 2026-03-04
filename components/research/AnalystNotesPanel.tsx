"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";

interface NoteFile {
  name: string;
  url: string;
}

interface Props {
  symbol: string;
}

export function AnalystNotesPanel({ symbol }: Props) {
  const [files, setFiles] = useState<NoteFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/notes/${symbol}`)
      .then((r) => (r.ok ? r.json() : { files: [] }))
      .then((data: { files: NoteFile[] }) => {
        setFiles(data.files);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [symbol]);

  if (loading)
    return <div className="animate-pulse h-20 bg-[#1E2235] rounded-xl" />;

  return (
    <div className="border border-[#1E2235] rounded-xl bg-surface p-4">
      <h3 className="text-xs font-mono text-muted tracking-widest mb-3 uppercase">
        Analyst Notes
      </h3>
      {files.length === 0 ? (
        <p className="text-muted text-xs font-mono">
          No PDFs found. Place files in{" "}
          <code className="text-amber">public/notes/{symbol}/</code>
        </p>
      ) : (
        <div className="space-y-1.5">
          {files.map((f) => (
            <a
              key={f.name}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-mono text-primary hover:text-amber transition-colors group"
            >
              <FileText className="w-3.5 h-3.5 text-muted group-hover:text-amber transition-colors shrink-0" />
              {f.name}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
