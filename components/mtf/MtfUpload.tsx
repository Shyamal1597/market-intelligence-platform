"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, FileSpreadsheet } from "lucide-react";

type UploadState = "idle" | "uploading" | "complete" | "error";

interface IngestSummary {
  date: string | null;
  rowsIngested: number;
  mtfRowCount: number;
  bhavRowCount: number;
  symbolsInMtfNotBhav: string[];
  warnings: string[];
}

export function MtfUpload({ onComplete }: { onComplete?: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<IngestSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setState("idle"); setFile(null); setError(null); setSummary(null);
  }, []);

  const close = useCallback(() => { reset(); setOpen(false); }, [reset]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.name.toLowerCase().endsWith(".xls")) { setFile(f); setError(null); }
    else { setError("Only .xls files are accepted."); }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(null); }
  }, []);

  const upload = useCallback(async () => {
    if (!file) return;
    setState("uploading"); setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/mtf/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) { setState("error"); setError(data.error ?? `Upload failed (${res.status})`); return; }
      setSummary(data);
      setState("complete");
      onComplete?.();
    } catch (e) {
      setState("error"); setError((e as Error).message);
    }
  }, [file, onComplete]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-primary hover:border-amber/40 transition-colors text-xs font-mono"
      >
        <Upload size={13} />
        Upload MTF Report
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-mono text-primary tracking-wider uppercase">
            Upload Margin Trading Report
          </h2>
          <button onClick={close} className="text-muted hover:text-primary"><X size={16} /></button>
        </div>

        {state === "complete" && summary ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CheckCircle2 size={40} className="text-teal" />
            <p className="text-sm text-primary font-mono">Ingested {summary.date}</p>
            <p className="text-xs text-muted">
              {summary.rowsIngested} rows ({summary.mtfRowCount} MTF, {summary.bhavRowCount} bhavcopy)
            </p>
            {summary.warnings.length > 0 && (
              <div className="w-full mt-2 px-3 py-2 rounded-lg bg-amber/5 border border-amber/20 text-[11px] text-amber font-mono">
                {summary.warnings.map((w, i) => <p key={i}>{w}</p>)}
              </div>
            )}
            <button
              onClick={close}
              className="mt-3 px-4 py-2 rounded-lg bg-teal/10 border border-teal/25 text-teal text-xs font-mono hover:bg-teal/20 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => state === "idle" && fileRef.current?.click()}
              className={`mb-4 flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
                dragOver ? "border-amber/50 bg-amber/5" : file ? "border-teal/30 bg-teal/5" : "border-border hover:border-border/60"
              } ${state !== "idle" ? "pointer-events-none opacity-50" : ""}`}
            >
              <input ref={fileRef} type="file" accept=".xls" onChange={handleFileSelect} className="hidden" />
              {file ? (
                <>
                  <FileSpreadsheet size={24} className="text-teal" />
                  <p className="text-xs text-primary font-mono">{file.name}</p>
                  <p className="text-[10px] text-muted">{(file.size / 1024).toFixed(0)} KB</p>
                </>
              ) : (
                <>
                  <Upload size={24} className="text-muted" />
                  <p className="text-xs text-muted">Drop the .xls file here or click to browse</p>
                </>
              )}
            </div>

            {error && (
              <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            {state === "uploading" && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber/5 border border-amber/20">
                <Loader2 size={14} className="text-amber animate-spin" />
                <p className="text-xs text-amber font-mono">Parsing and ingesting…</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={state === "idle" ? close : reset} className="px-4 py-2 rounded-lg border border-border text-muted text-xs font-mono hover:text-primary transition-colors">
                {state === "idle" ? "Cancel" : "Reset"}
              </button>
              <button
                onClick={upload}
                disabled={!file || state !== "idle"}
                className="px-4 py-2 rounded-lg bg-amber/10 border border-amber/25 text-amber text-xs font-mono hover:bg-amber/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Upload & Ingest
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
