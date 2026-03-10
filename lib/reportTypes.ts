// Client-safe types and utilities for research reports
// No Node.js dependencies — safe to import in "use client" components

export interface ReportMeta {
  id: string;
  analyst: string;
  company: string;
  symbol: string;
  reportType: "IC" | "RU" | "CU" | "AU" | "Technical" | "Visit Note" | "Other";
  date: string;          // ISO: "2025-08-01"
  rating: string;
  cmp: number;
  targetPrice: number;
  filePath: string;      // absolute path
}

export interface Chunk {
  id: string;
  reportId: string;
  text: string;
  pageNum: number;
}

// Path encoding for the PDF file-server API — pure, no Node.js deps
// Uses standard btoa() + URL-safe substitution (works in browser and Node 18+)
export function encodePdfPath(filePath: string): string {
  return btoa(filePath).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
