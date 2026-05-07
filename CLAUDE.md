# Sunidhi Research Intelligence Platform — Claude Guidelines

## Repo & Worktree Map

| Path | Git Branch | Purpose |
|------|-----------|---------|
| `D:\Sunidhi Intranet\` | `main` | Bare repo root — source of truth for all branches |
| `D:\Sunidhi-Intranet-Futuristic\` | `futuristic-design` | **PRIMARY FRONTEND WORKTREE** — all UI/feature work goes here. Has `.env.local` with BREEZE keys. Run dev server from here. |
| `D:\Sunidhi Intranet\.claude\worktrees\awesome-chaplygin\` | `claude/awesome-chaplygin` | Claude Code internal scratch worktree — do not use for feature work |
| `D:\Sunidhi Intranet\.claude\worktrees\gracious-dirac\` | (other) | Unused / legacy Claude worktree |

**Dev server:** Configured in `D:\Sunidhi Intranet\.claude\launch.json` → runs Next.js from `D:\Sunidhi-Intranet-Futuristic\` on port 3001.

**`.env.local`** lives in `D:\Sunidhi-Intranet-Futuristic\` — contains `BREEZE_API_KEY` and `BREEZE_SECRET_KEY`. Never copy to other worktrees.

---

## Project Overview
Internal financial research intranet for Sunidhi Capital's research team. Next.js 16 App Router, TypeScript, Tailwind CSS. No auth, no database. File-based JSON persistence. Open access on internal network only.

## Stack
- **Framework**: Next.js 16 + TypeScript
- **Styling**: Tailwind CSS with custom dark editorial theme
- **Icons**: Lucide React
- **Charts**: Recharts
- **Fonts**: Cormorant Garamond (display) + JetBrains Mono (data) + DM Sans (body)
- **Parsing**: rss-parser, cheerio, fast-xml-parser

## Design System
- **Aesthetic**: Bloomberg Terminal × Financial Times Editorial — dense, dark, precise
- **Background**: `#0C0E14` with SVG grain texture
- **Surface**: `#13151E` with `#1E2235` borders
- **Accent amber**: `#F5820D` — primary interactive accent (Sunidhi brand orange)
- **Teal**: `#00C9A7` — positive/up indicators
- **Danger**: `#E84040` — negative/down indicators
- **Text primary**: `#F0EDE8` (warm off-white)
- **NEVER use**: generic gradients, purple-on-white, Inter/Roboto/Arial, card grids without editorial intent

## Project Structure
```
app/                    # Next.js App Router pages + API routes
├── api/
│   ├── macro/          # Yahoo Finance proxy
│   ├── filings/        # BSE XML feed proxy
│   ├── market-news/    # Serve stored news JSON
│   ├── fetch-market-news/  # Pull from RSS feeds
│   ├── coverage/       # SQLite-backed coverage universe + [symbol]/financials
│   ├── breeze/         # ICICI Breeze live price data (auth, historical/[symbol])
│   ├── watchlist/      # Watchlist CRUD (JSON persistence) + [symbol] PATCH
│   └── reports/        # PDF report management
├── page.tsx            # Dashboard
├── news/               # Market News
├── macro/              # Macro Command Centre
├── filings/            # BSE Filing Monitor
├── links/              # Quick Links Hub
├── results/            # Earnings Intelligence (CoverageIntelligence)
├── reports/            # RAG PDF viewer
└── research/[symbol]/  # Per-stock research page
components/
├── layout/             # Sidebar, TopBar, TickerStrip
├── dashboard/          # Dashboard widgets
├── macro/              # MetricTile, Sparkline
├── results/            # CoverageIntelligence, CoverageRow, FinancialsPanel, …
├── research/           # CompanyHeader, QuarterlyResultsPanel, ShareholdingPanel, …
└── ui/                 # Badge, SectionHeader
lib/
├── db.ts               # SQLite via better-sqlite3 (reports table)
├── theme.tsx           # ThemeProvider — see Theme System section below
└── watchlist.ts        # Watchlist JSON helpers
data/
└── market-news.json    # Persisted news store (up to 200 items)
```

---

## Branches & Active Dev Environment

- **Active branch for UI work**: `futuristic-design` at `D:/Sunidhi-Intranet-Futuristic/`
- **This is the project the dev server serves** — edits must go here, NOT in `D:\Sunidhi Intranet\`
- **Dev server**: named `sunidhi-intranet`, port 3001. Launch config at `D:\Sunidhi Intranet\.claude\launch.json`:
  ```json
  { "name": "sunidhi-intranet", "runtimeExecutable": "node",
    "runtimeArgs": ["D:\\Sunidhi Intranet\\node_modules\\next\\dist\\bin\\next", "dev", "-p", "3001"],
    "port": 3001 }
  ```
  `node_modules` live in `D:\Sunidhi Intranet\` (not in the futuristic worktree).
- **Other worktrees**: `D:\Sunidhi Intranet\.claude\worktrees\{gracious-dirac,nifty-noyce,silly-yalow}` — feature branches, not actively served.

---

## Theme System — Read Before Any UI Work

`lib/theme.tsx` — `ThemeProvider` sets `data-theme` on `<html>` and calls `applyTheme()` which injects CSS custom properties. Preference persisted in `localStorage` key `sunidhi-theme-v1`.

| Tailwind class | CSS var | Dark value | Light value |
|---|---|---|---|
| `bg-base` | `--color-base` | `#0C0E14` | `#F4F1EB` |
| `bg-surface` | `--color-surface` | `#13151E` | `#FFFFFF` |
| `border-border` | `--color-border` | `#1E2235` | `#E5DDD0` |
| `text-primary` | `--color-primary` | `#F0EDE8` | `#1C1814` |
| `text-muted` | `--color-muted` | `#6E7590` | `#8A7F74` |
| `text-amber` | `--color-amber` | `#F5820D` | `#F5820D` |
| `text-teal` | `--color-teal` | `#00C9A7` | `#00C9A7` |
| `text-danger` | `--color-danger` | `#E84040` | `#E84040` |

**Critical rule**: Always use CSS-variable Tailwind classes (`bg-surface`, `text-primary`, `border-border`, etc.) for component backgrounds and text. **Never hardcode** `#0C0E14`, `#13151E`, `#F0EDE8` etc. directly on component backgrounds — they break the light theme (dark bg + dark text = invisible).

**Exceptions where hardcoded dark colours are correct**:
- Recharts chart internals (SVG grid/axis) — always dark regardless of theme
- `CustomTooltip` components inside charts — intentionally dark `bg-[#13151E]`

---

## Coverage Intelligence — Key Patterns

**`components/results/CoverageIntelligence.tsx`**:
- **Metric tiles**: `bg-surface border-border rounded-lg` — text uses `text-primary` / `text-muted`
- **Rating tile value**: uses `ratingBg()` which returns theme-compatible Tailwind strings
- **Covered-by analyst badges**: `bg-surface border-border`
- **Report history cards**: latest → `border-amber/20 bg-amber/[0.04]`; older → `border-border bg-surface`
- **Price Target Walk chart**: fixed `h-[300px]` container (not `flex-1` — breaks `ResponsiveContainer`), `domain={["auto","auto"]}` on `YAxis`
- **Chart legend**: SVG line swatches with plain-English labels (amber solid = Price Target, gray dashed = CMP at Issue, blue solid = Market Price)

**`app/api/coverage/route.ts`**:
- Falls back to most-recent report WITH data: `reports.find(r => r.rating) ?? reports[0]` for rating; same pattern for `targetPrice > 0`
- Prevents "Note"-type reports (no rating/TP) from blanking the metric tiles

**Breeze integration**: `/api/breeze/auth` → `{ loggedIn, loginUrl }`. When `loggedIn=false`, Overview tab shows "Connect Breeze for price history ↗". Historical OHLC via `/api/breeze/historical/[symbol]?from=YYYY-MM-DD&to=YYYY-MM-DD`.

## Known Coverage Data Notes
- **KTKBANK** — company name stored as "KBL" (Karnataka Bank Ltd); 1 RU by Rabindra, BUY, TP ₹2,015
- **AXISBANK** — latest report is a Note (no rating/TP); API fallback surfaces OUTPERFORM · TP ₹1,402 from the underlying RU

---

## Working Relationship & Tooling

### Communication
- **No sycophancy**: Be matter-of-fact, straightforward, and clear
- **Conciseness**: Avoid long-winded explanations
- **Challenge assumptions**: Don't blindly agree — push back when reasoning is weak
- **Quality over speed**: Do things the right way, not the easy way
- **No estimates**: Don't provide timeline estimates in plans
- **Git commits**: Do not add Claude as co-author in commits

### Advisor Mode
When asked for opinions or strategy: be a brutally honest, high-level advisor — not agreeable, not polite, not flattering. Expose blind spots, challenge weak reasoning, prioritize truth over comfort.

### Tooling
- Use Skills from `~/.claude/skills/` when tasks match their purpose
- If a Makefile exists, prefer `make` targets over calling tools directly
- Prefer Edit tool over sed for file edits
- Prefer Search/Grep tools over grep/rg CLI calls
- Use Mermaid diagrams to explain complex systems

---

## Development Manager Workflow

For feature/bug work from issue documents:

1. **Feature Implementation**: Instruct feature implementer subagent to read the issue doc and implement the task list
2. **Code Quality Evaluation**: Ask code quality evaluator subagent to evaluate changes against the issue doc
3. **Enforce Improvements**: If evaluator flags critical issues, send back to implementer with same issue doc
4. **Documentation Sync**: Ask docs sync engineer subagent to update critical docs
5. **Verification**: Read updated issue doc, summarize work done, verify all tests pass
6. **Test Failure Resolution**: If tests fail, send back to feature implementer
7. **GitHub Update**: Use `gh` + `git` to update the GitHub issue (number after `#` in issue filename)

---

## Secure Coding Guide for Web Applications

### Overview
Approach code from a **bug hunter's perspective**. Make applications **as secure as possible** without breaking functionality.

**Key Principles:**
- Defense in depth: Never rely on a single security control
- Fail securely: When something fails, fail closed (deny access)
- Least privilege: Grant minimum permissions necessary
- Input validation: Never trust user input, validate everything server-side
- Output encoding: Encode data appropriately for the context it's rendered in

---

### Access Control Issues

Access control vulnerabilities occur when users can access resources or perform actions beyond their intended permissions.

#### Core Requirements

For **every data point and action** that requires authentication:

1. **User-Level Authorization**
   - Each user must only access/modify their own data
   - No user should access data from other users or organizations
   - Always verify ownership at the data layer, not just the route level

2. **Use UUIDs Instead of Sequential IDs**
   - Use UUIDv4 or similar non-guessable identifiers
   - Exception: Only use sequential IDs if explicitly requested by user

3. **Account Lifecycle Handling**
   - When a user is removed from an organization: immediately revoke all access tokens and sessions
   - When an account is deleted/deactivated: invalidate all active sessions and API keys
   - Implement token revocation lists or short-lived tokens with refresh mechanisms

#### Authorization Checks Checklist
- [ ] Verify user owns the resource on every request (don't trust client-side data)
- [ ] Check organization membership for multi-tenant apps
- [ ] Validate role permissions for role-based actions
- [ ] Re-validate permissions after any privilege change
- [ ] Check parent resource ownership

#### Common Pitfalls
- **IDOR**: Always verify the requesting user has permission to access the requested resource ID
- **Privilege Escalation**: Validate role changes server-side; never trust role info from client
- **Horizontal Access**: User A accessing User B's resources
- **Vertical Access**: Regular user accessing admin functionality
- **Mass Assignment**: Filter which fields users can update

#### Implementation Pattern
```
# Pseudocode for secure resource access
function getResource(resourceId, currentUser):
    resource = database.find(resourceId)
    if resource is null:
        return 404  # Don't reveal if resource exists
    if resource.ownerId != currentUser.id:
        if not currentUser.hasOrgAccess(resource.orgId):
            return 404  # Return 404, not 403, to prevent enumeration
    return resource
```

---

### Client-Side Bugs

#### Cross-Site Scripting (XSS)

Every input controllable by the user must be sanitized against XSS.

**Input Sources to Protect:** Form fields, search queries, file names, URL parameters/fragments, HTTP headers, third-party API data, WebSocket messages, postMessage from iframes, LocalStorage/SessionStorage.

**Protection Strategies:**
1. **Output Encoding** (Context-Specific) — HTML, JS, URL, CSS contexts need different encoding. Use framework built-ins (React JSX auto-escapes).
2. **Content Security Policy (CSP)**
   ```
   Content-Security-Policy:
     default-src 'self';
     script-src 'self';
     style-src 'self' 'unsafe-inline';
     img-src 'self' data: https:;
     font-src 'self';
     connect-src 'self' https://api.yourdomain.com;
     frame-ancestors 'none';
   ```
3. **Input Sanitization** — Use DOMPurify for HTML. Whitelist allowed tags.
4. **Additional Headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`

---

#### Cross-Site Request Forgery (CSRF)

Every state-changing endpoint must be protected.

**Protection Mechanisms:**
1. **CSRF Tokens** — Cryptographically random, tied to session, validated on every state-changing request
2. **SameSite Cookies** — `Set-Cookie: session=...; SameSite=Strict; Secure; HttpOnly`
3. **Double Submit Cookie Pattern**

**Verification Checklist:**
- [ ] Token is cryptographically random
- [ ] Token is tied to user session
- [ ] Token validated server-side on all state-changing requests
- [ ] Missing token = rejected request
- [ ] Token regenerated on auth state change
- [ ] SameSite cookie attribute is set
- [ ] Secure and HttpOnly flags on session cookies

---

#### Secret Keys and Sensitive Data Exposure

**Never expose in client-side code:**
- Third-party API keys, database connection strings, JWT signing secrets, encryption keys, OAuth client secrets
- Full credit card numbers, SSNs, passwords, security questions

**Where secrets hide:** JS bundles, HTML comments, hidden form fields, data attributes, LocalStorage, SSR hydration data, `NEXT_PUBLIC_*` env vars

**Best Practice:** Store secrets in `.env` files. Make API calls requiring secrets from backend only.

---

### Open Redirect

Any endpoint accepting a URL for redirection must be protected.

**Protection:**
1. **Allowlist Validation** — Only allow pre-approved domains
2. **Relative URLs Only** — Only accept paths starting with `/`
3. **Indirect References** — Map keys to URLs server-side

**Bypass techniques to block:** `@` symbol, subdomain abuse, protocol tricks, double URL encoding, backslash, null byte, tab/newline, Unicode normalization, data URLs, protocol-relative `//`, fragment abuse.

---

### Password Security

- Minimum 8 characters (12+ recommended), no effective maximum
- Allow all characters
- Use Argon2id, bcrypt, or scrypt — never MD5, SHA1, plain SHA256

---

### Server-Side Bugs

#### Server-Side Request Forgery (SSRF)

Vulnerable features: webhooks, URL previews, PDF generators, image fetching, RSS readers.

**Protection:**
1. **Allowlist Approach** — Only allow requests to pre-approved domains
2. **Network Segmentation** — Run URL-fetching in isolated network

**IP bypass techniques to block:** Decimal/octal/hex IP, IPv6 localhost, DNS rebinding, CNAME to internal, redirect chains.

**Cloud Metadata Protection:** Block `169.254.169.254` (AWS/GCP/Azure/DO), `metadata.google.internal`.

**Implementation Checklist:**
- [ ] Validate URL scheme is HTTP/HTTPS only
- [ ] Resolve DNS and validate IP is not private/internal
- [ ] Block cloud metadata IPs explicitly
- [ ] Limit/disable redirect following
- [ ] Set timeout on requests
- [ ] Limit response size

---

#### Insecure File Upload

**Validation Requirements:**
1. Check file extension against allowlist
2. Validate magic bytes/file signature
3. Enforce file size limits server-side

**Secure Handling:**
1. Rename files to random UUID names
2. Store outside webroot or on separate domain
3. Serve with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`
4. Set restrictive permissions (not executable)

**Magic Bytes Reference:**

| Type | Magic Bytes (hex) |
|------|-------------------|
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` |
| GIF | `47 49 46 38` |
| PDF | `25 50 44 46` |
| ZIP | `50 4B 03 04` |

---

#### SQL Injection

**Primary Defense: Parameterized Queries**
```sql
-- VULNERABLE
query = "SELECT * FROM users WHERE id = " + userId
-- SECURE
query = "SELECT * FROM users WHERE id = ?"
execute(query, [userId])
```

**Injection Points to Watch:** WHERE, ORDER BY (whitelist only), LIMIT/OFFSET, table/column names (whitelist only), IN clauses, LIKE patterns.

**Additional Defenses:** Least privilege DB user, disable dangerous functions, never expose SQL errors to users.

---

#### XML External Entity (XXE)

**Vulnerable Scenarios:** SOAP APIs, XML file uploads, Office documents (DOCX/XLSX are XML in ZIP), SVG files, SAML assertions.

**Prevention Checklist:**
- [ ] Disable DTD processing entirely if possible
- [ ] Disable external entity resolution
- [ ] Disable external DTD loading
- [ ] Disable XInclude processing
- [ ] Use latest patched XML parser versions

---

#### Path Traversal

**Prevention:**
1. Avoid user input in paths — use indirect references (map key → path)
2. Canonicalize and validate: `os.path.commonpath([base, target]) == base`
3. Remove `..`, absolute path indicators, whitelist safe characters

**Checklist:**
- [ ] Never use user input directly in file paths
- [ ] Canonicalize paths and validate against base directory
- [ ] Restrict file extensions if applicable

---

### Security Headers Checklist

Include in all responses:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: [see XSS section]
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Cache-Control: no-store (for sensitive pages)
```

---

### General Security Principles

When generating code, always:
1. **Validate all input server-side** — Never trust client-side validation alone
2. **Use parameterized queries** — Never concatenate user input into queries
3. **Encode output contextually** — HTML, JS, URL, CSS contexts need different encoding
4. **Apply authentication checks** — On every endpoint
5. **Apply authorization checks** — Verify the user can access the specific resource
6. **Use secure defaults**
7. **Handle errors securely** — Don't leak stack traces or internal details
8. **Keep dependencies updated**

When unsure, choose the more restrictive/secure option and document the security consideration in comments.

## Secrets

- `ANTHROPIC_API_KEY` — required for `npm run intel:rebuild`. Place in `.env.local` (gitignored). See `.env.local.example`.
