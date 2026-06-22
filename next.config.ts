import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // unsafe-eval only in dev (Next.js HMR requires it); removed in production
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Allow Next.js dev server HMR websocket from the internal network IP.
  // Without this, any colleague accessing via 192.168.48.102:3001 gets their
  // HMR connection blocked, which prevents React hydration and data fetching.
  allowedDevOrigins: ["192.168.48.102"],

  // Prevent webpack from bundling pdf2json (and its pdfjs-dist dependency) into
  // API routes -- it must be loaded natively by Node.js. Without this, pdfjs-dist
  // initialises a "fake worker" on every route cold-start and floods the dev console.
  serverExternalPackages: ["pdf2json", "exceljs"],

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
