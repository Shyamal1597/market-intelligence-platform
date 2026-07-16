/**
 * One-off: renders the EOD banner as a static PNG, matching the real
 * reference file's shape geometry exactly (extracted from its raw drawing
 * XML: xl/drawings/drawing1.xml in "EOD Snippets on Market MISC -
 * 15.07.2026.xlsx"). The banner never changes (no dynamic data in it), so
 * it's generated once here and just embedded as a picture by the export
 * route -- far more reliable than approximating multiple overlapping
 * shapes with cell fills.
 *
 * Usage: node scripts/generate-eod-banner.js
 */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SCALE = 2; // render at 2x for crisper embedding
const W = 1109 * SCALE;
const H = 143 * SCALE;

async function main() {
  const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
  const logoBuf = fs.readFileSync(logoPath);
  const logoB64 = logoBuf.toString("base64");

  const s = (v) => v * SCALE;

  const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>

  <!-- top red strip: cols B-F -->
  <rect x="${s(50)}" y="${s(2)}" width="${s(591)}" height="${s(23)}" fill="#FF0000"/>

  <!-- main blue box: cols B-G -->
  <rect x="${s(50)}" y="${s(11)}" width="${s(753)}" height="${s(126)}" fill="#215F9A"/>

  <!-- thin accent line near bottom of blue box (white portion) -->
  <rect x="${s(73)}" y="${s(110)}" width="${s(730)}" height="${s(8)}" fill="#FFFFFF"/>
  <!-- thin accent line beside logo (red portion) -->
  <rect x="${s(802)}" y="${s(110)}" width="${s(307)}" height="${s(8)}" fill="#FF0000"/>

  <!-- title text with soft drop shadow -->
  <text x="${s(644)}" y="${s(62)}" font-family="Calibri, Arial, sans-serif" font-size="${s(32)}"
        font-weight="bold" fill="#000000" opacity="0.3" text-anchor="middle">EOD Snippets On Market</text>
  <text x="${s(642)}" y="${s(60)}" font-family="Calibri, Arial, sans-serif" font-size="${s(32)}"
        font-weight="bold" fill="#FFFFFF" text-anchor="middle">EOD Snippets On Market</text>

  <!-- logo, on white background -->
  <image x="${s(863)}" y="${s(6)}" width="${s(177)}" height="${s(73)}" href="data:image/png;base64,${logoB64}"/>
</svg>`;

  const outPath = path.join(process.cwd(), "public", "images", "eod-banner.png");
  await sharp(Buffer.from(svg)).png().toFile(outPath);
  console.log("wrote", outPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
