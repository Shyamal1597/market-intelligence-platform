"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, X, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { SYMBOL_SECTOR } from "@/lib/intel/types";

type UploadState = "idle" | "uploading" | "processing" | "complete" | "error";

interface JobStatus {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  stage: string;
  error: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  "extract-text": "Extracting text from PDF…",
  "extract-claims": "Extracting management claims…",
  "cross-check": "Cross-checking against transcripts…",
  "summaries": "Generating summaries…",
  "complete": "Pipeline complete",
  "failed": "Pipeline failed",
};

const SYMBOLS = Object.keys(SYMBOL_SECTOR).sort();

export function TranscriptUpload({ onComplete }: { onComplete?: () => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<UploadState>("idle");
  const [symbol, setSymbol] = useState(SYMBOLS[0] ?? "");
  const [quarter, setQuarter] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobStage, setJobStage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setFile(null);
    setError(null);
    setJobStage("");
    setQuarter("");
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const close = useCallback(() => {
    reset();
    setOpen(false);
  }, [reset]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f?.type === "application/pdf" || f?.name.toLowerCase().endsWith(".pdf")) {
      setFile(f);
      setError(null);
    } else {
      setError("Only PDF files are accepted.");
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setError(null);
    }
  }, []);

  const pollJob = useCallback((jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/intel/jobs/${jobId}`);
        if (!res.ok) return;
        const job: JobStatus = await res.json();
        setJobStage(job.stage);

        if (job.status === "complete") {
          setState("complete");
          if (pollRef.current) clearInterval(pollRef.current);
          onComplete?.();
        } else if (job.status === "failed") {
          setState("error");
          setError(job.error ?? "Pipeline failed");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // Network error -- keep polling
      }
    }, 3000);
  }, [onComplete]);

  const upload = useCallback(async () => {
    if (!file || !symbol) return;

    setState("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("symbol", symbol);
      if (quarter.trim()) formData.append("quarter", quarter.trim());

      const res = await fetch("/api/intel/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setState("error");
        setError(data.error ?? `Upload failed (${res.status})`);
        return;
      }

      setState("processing");
      setJobStage("extract-claims");
      pollJob(data.jobId);
    } catch (e) {
      setState("error");
      setError((e as Error).message);
    }
  }, [file, symbol, quarter, pollJob]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted hover:text-primary hover:border-amber/40 transition-colors text-xs font-mono"
      >
        <Upload size={13} />
        Upload Transcript
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border rounded-xl shadow-2xl shadow-black/50 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-mono text-primary tracking-wider uppercase">
            Upload Earnings Transcript
          </h2>
          <button onClick={close} className="text-muted hover:text-primary">
            <X size={16} />
          </button>
        </div>

        {state === "complete" ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 size={40} className="text-teal" />
            <p className="text-sm text-primary font-mono">Transcript processed successfully</p>
            <p className="text-xs text-muted">Claims extracted, cross-checked, and summaries generated.</p>
            <button
              onClick={close}
              className="mt-3 px-4 py-2 rounded-lg bg-teal/10 border border-teal/25 text-teal text-xs font-mono hover:bg-teal/20 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Symbol selector */}
            <div className="mb-4">
              <label className="block text-[10px] text-muted tracking-widest uppercase mb-1.5">
                Stock
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                disabled={state !== "idle"}
                className="w-full px-3 py-2 rounded-lg bg-base border border-border text-primary text-xs font-mono focus:border-amber/40 focus:outline-none disabled:opacity-50"
              >
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Quarter override (optional) */}
            <div className="mb-4">
              <label className="block text-[10px] text-muted tracking-widest uppercase mb-1.5">
                Quarter <span className="text-muted/50">(auto-detected if blank)</span>
              </label>
              <input
                type="text"
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                placeholder="e.g. Q1-FY27"
                disabled={state !== "idle"}
                className="w-full px-3 py-2 rounded-lg bg-base border border-border text-primary text-xs font-mono placeholder:text-muted/30 focus:border-amber/40 focus:outline-none disabled:opacity-50"
              />
            </div>

            {/* File drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => state === "idle" && fileRef.current?.click()}
              className={`mb-4 flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
                dragOver
                  ? "border-amber/50 bg-amber/5"
                  : file
                    ? "border-teal/30 bg-teal/5"
                    : "border-border hover:border-border/60"
              } ${state !== "idle" ? "pointer-events-none opacity-50" : ""}`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              {file ? (
                <>
                  <FileText size={24} className="text-teal" />
                  <p className="text-xs text-primary font-mono">{file.name}</p>
                  <p className="text-[10px] text-muted">{(file.size / 1024).toFixed(0)} KB</p>
                </>
              ) : (
                <>
                  <Upload size={24} className="text-muted" />
                  <p className="text-xs text-muted">Drop PDF here or click to browse</p>
                </>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20">
                <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            {/* Processing status */}
            {(state === "uploading" || state === "processing") && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber/5 border border-amber/20">
                <Loader2 size={14} className="text-amber animate-spin" />
                <p className="text-xs text-amber font-mono">
                  {state === "uploading"
                    ? "Uploading PDF…"
                    : STAGE_LABELS[jobStage] ?? "Processing…"}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={state === "idle" ? close : reset}
                className="px-4 py-2 rounded-lg border border-border text-muted text-xs font-mono hover:text-primary transition-colors"
              >
                {state === "idle" ? "Cancel" : "Reset"}
              </button>
              <button
                onClick={upload}
                disabled={!file || state !== "idle"}
                className="px-4 py-2 rounded-lg bg-amber/10 border border-amber/25 text-amber text-xs font-mono hover:bg-amber/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Upload & Process
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
