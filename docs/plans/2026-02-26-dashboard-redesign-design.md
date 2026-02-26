# Dashboard Redesign — Design Document
**Date:** 2026-02-26
**Project:** Sunidhi Research Intelligence Platform
**Status:** Approved

---

## Problem Statement

The current dashboard has four root issues:

1. **Wrong information hierarchy** — live market prices are buried in a 3/12-column card. A research analyst should see prices first.
2. **Quick Links wastes premium real estate** — navigation links on the command center crowd out live data.
3. **No brand identity** — sidebar uses a generic icon; Sunidhi identity is absent.
4. **Flat visual weight** — all sections have identical treatment; nothing reads as primary vs secondary.

---

## Design Decision

**Approach: Koyfin Structured** — hero metrics row with sparklines, two-column editorial layout (news + filings), terminal-style section headers, Sunidhi brand colors.

---

## Architecture

### Page Layout

```
Sidebar (fixed) | TopBar (48px)
                | Hero Metrics Row (100px) — 5 tiles full-width
                | Two-column body
                |   Left 60%: Market Headlines
                |   Right 40%: BSE Filings
```

### Removed from Dashboard
- `QuickLinksPreview` component — belongs at `/links` only
- `TickerStrip` — redundant once hero metrics row exists

---

## Component Specifications

### 1. Sidebar (`components/layout/Sidebar.tsx`)

**Collapsed (64px):**
- Brand icon: 28×28px rounded-lg, bg `#CC1F37` (Sunidhi red), white `S` in `font-display font-bold`

**Expanded (224px):**
- Same icon + `SUNIDHI` in `font-display text-primary` + `Securities & Finance` in `text-muted text-[10px]`

No PNG logo — recreate in CSS to work on dark background.

---

### 2. Hero Metrics Row (`components/dashboard/MetricsRow.tsx`) — NEW

Full-width row of 5 tiles, no section header. Data from `/api/macro`.

**Each tile:**
```
┌──────────────────────┐
│ NIFTY 50             │  font-mono 10px muted uppercase
│ 24,850.30            │  font-mono 22px text-primary font-bold
│ ▲ +290.45  +1.19%    │  font-mono 12px teal (up) / danger (down)
│ ~~~sparkline~~~      │  28px Recharts AreaChart no axes
└──────────────────────┘
```

- `border-l-2` left accent: `border-teal` (up) or `border-danger` (down)
- `bg-surface border border-[#1E2235] rounded-xl`
- Hover: `bg-white/[0.02]`
- Loading: 5 skeleton tiles, pulse animation

Reuses existing `Sparkline` component. Reuses existing `formatPrice` / `formatChange` logic from `MacroTiles`.

---

### 3. Market Headlines (`components/dashboard/NewsHeadlines.tsx`) — REFACTOR

Remove card container. Render as a flat list of rows.

**Section header:**
```
MARKET HEADLINES ──────────── {n} items    All news →
```
`font-mono text-[10px] tracking-widest text-muted uppercase`

**Each row:**
```
[MC]  •  2m    RBI holds rates steady amid global uncertainty…
──────────────────────────────────────────────────────────────
```
- Source abbreviation badge: 2–3 chars, `font-mono text-[10px]` in `bg-[#1E2235] rounded px-1.5 py-0.5`
- Time: `font-mono text-xs text-muted`
- Headline: `text-sm text-primary truncate`, links open in new tab
- Hover: row `bg-white/[0.02]`, headline `text-amber`
- Row separator: `border-b border-[#1E2235]`
- Max 8 items

**Source abbreviations map:**
```
Moneycontrol → MC
ET Markets / Economic Times → ET
Business Standard → BS
Reuters → REU
Financial Times → FT
LiveMint → MINT
NDTV Profit → NDTV
Default → first 3 chars of source name, uppercase
```

---

### 4. BSE Filings (`components/dashboard/DashboardFilings.tsx`) — REFACTOR

Same flat-row pattern as Headlines.

**Section header:**
```
BSE FILINGS ──── ● LIVE  {n} items    All →    Updated 2m ago
```

**Each row:**
```
[RESULTS]         •  13:45
Infosys Technologies Ltd.
Standalone Q3 FY25 Financial Results…
──────────────────────────────────────
```
- Category badge: keep existing `Badge` component (already color-coded)
- Company name: `text-sm font-semibold text-primary font-sans`
- Description: `text-xs text-muted truncate`
- Time: `font-mono text-xs text-muted`
- Clickable row if PDF exists: `cursor-pointer`, opens new tab, `ExternalLink` icon 10px top-right
- Hover: `bg-white/[0.02]`
- Max 8 items, auto-refresh every 2 min (keep existing logic)

---

### 5. Dashboard Page (`app/page.tsx`) — REFACTOR

```tsx
<div className="p-6 space-y-4">
  <MetricsRow />
  <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
    <div className="lg:col-span-3 ...">  {/* Headlines */}
      <NewsHeadlines />
    </div>
    <div className="lg:col-span-2 ...">  {/* Filings */}
      <DashboardFilings />
    </div>
  </div>
</div>
```

Remove `QuickLinksPreview` import and render. Remove `MacroTiles` (replaced by `MetricsRow`).

---

## Color & Typography Changes

| Token | Before | After | Reason |
|---|---|---|---|
| `--color-amber` | `#E8A020` | `#F5820D` | Sunidhi brand orange |
| Sidebar brand | `Activity` Lucide icon | CSS `S` in `#CC1F37` | Sunidhi identity |
| Section headers | `font-display text-xl/2xl` | `font-mono text-[10px] tracking-widest uppercase` | Terminal aesthetic |

Unchanged: `#0C0E14` base, `#13151E` surface, `#1E2235` borders, `#00C9A7` teal, `#E84040` danger, all three font families.

---

## Files to Change

| File | Action |
|---|---|
| `app/globals.css` | Change `--color-amber` to `#F5820D` |
| `app/page.tsx` | Remove `MacroTiles`, `QuickLinksPreview`; add `MetricsRow`; fix grid |
| `components/layout/Sidebar.tsx` | Replace icon with branded `S` mark |
| `components/layout/TickerStrip.tsx` | Remove from `app/layout.tsx` (keep file) |
| `components/dashboard/NewsHeadlines.tsx` | Refactor to flat rows + source badges |
| `components/dashboard/DashboardFilings.tsx` | Refactor to flat rows + updated header |
| `components/dashboard/MetricsRow.tsx` | **NEW** — hero metrics tiles with sparklines |
| `components/dashboard/MacroTiles.tsx` | Keep (used on `/macro` page) |
| `components/dashboard/QuickLinksPreview.tsx` | Keep (may re-use elsewhere) |

---

## Non-Goals

- No changes to `/news`, `/macro`, `/filings`, `/links` pages
- No changes to API routes
- No authentication or data model changes
- No new dependencies
