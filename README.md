# SENTINEL — AI Security, Accessibility & QA

**Give it a URL. Get a full security, accessibility, and QA report.**

SENTINEL is an AI-powered testing platform with a beautiful web dashboard AND MCP server integration. It crawls your app, reads your documentation, generates security attacks, accessibility audits, UX checks, and QA tests, executes them in a real Chromium browser, and learns from every run. Powered by GitHub Models API (GPT-4o).

**Zero hardcoded patterns. 16 attack categories. Web dashboard + IDE integration. The AI is the brain.**

---

## Runbook — Demo in 2 Minutes

### Prerequisites

| Requirement | How to check | Install |
|-------------|-------------|---------|
| **Node.js 24+** | `node --version` | [nodejs.org](https://nodejs.org) |
| **Chromium for Playwright** | (installed below) | `npx playwright install chromium` |
| **GITHUB_TOKEN** env var | `echo %GITHUB_TOKEN%` (Windows) | See [Token Setup](#1-github-token-setup) below |

---

### 1. GitHub Token Setup

SENTINEL uses the **GitHub Models API** (GPT-4o) for AI-powered test generation. You need a GitHub token with `models:read` scope.

**Get a token:**
1. Go to https://github.com/settings/tokens → **Generate new token (classic)**
2. Check the **`models:read`** scope
3. Copy the token

**Set it as a system environment variable (Windows):**

```powershell
# PowerShell (permanent — survives restarts)
[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'ghp_your_token_here', 'User')

# Then restart your terminal / IDE for it to take effect
```

**Verify:**

```powershell
echo $env:GITHUB_TOKEN
# Should print your token
```

---

### 2. Install Dependencies

```bash
# From the project root
npm install
npx playwright install chromium

# Install demo app dependencies
cd demo-app && npm install && cd ..

# Install web dashboard dependencies
cd web && npm install && cd ..
```

---

### 3. Build

```bash
# Build the core TypeScript
npm run build

# Build the web dashboard (optional — dev mode works fine for demos)
cd web && npx next build && cd ..
```

---

### 4. Run the Demo

Open **two terminals**:

**Terminal 1 — Start the demo app (VulnShop):**

```bash
cd demo-app
node server.js
```

You should see:
```
SENTINEL Demo App (VulnShop) running on http://localhost:3001
```

**Terminal 2 — Start the web dashboard:**

```bash
cd web
npx next dev
```

You should see:
```
▲ Next.js 15.x
- Local: http://localhost:3000
✓ Ready
```

---

### 5. Run a Scan

1. Open **http://localhost:3000** in your browser
2. Fill in the form:

| Field | Value |
|-------|-------|
| **Target URL** | `http://localhost:3001` |
| **Documentation** | `./demo-app/DOCS.md` |
| **Example Data** | See JSON below |
| **Auth** | (leave as "None" — VulnShop has no auth requirement for scanning) |

**Example Data JSON** — paste this into the "Example Data" field:

```json
{"searchQuery": "Widget", "feedbackName": "Tester", "feedbackMessage": "Great product!", "username": "admin", "password": "admin", "productCategory": "widgets", "userId": "1", "orderId": "1", "email": "test@example.com"}
```

This tells SENTINEL what kind of data to use when filling forms and testing APIs:

| Key | Purpose | Used by |
|-----|---------|---------|
| `searchQuery` | Text to type into the product search box | `/search?q=Widget` |
| `feedbackName` | Name to submit in the feedback form | `POST /feedback` |
| `feedbackMessage` | Message to submit in the feedback form | `POST /feedback` |
| `username` | Login username to try | `POST /login` |
| `password` | Login password to try | `POST /login` |
| `productCategory` | Category filter for product API | `/api/products?category=widgets` |
| `userId` | User ID for IDOR testing | `/api/users/1` |
| `orderId` | Order ID for IDOR testing | `/api/orders/1` |
| `email` | Email for validation endpoint | `POST /api/validate-email` |

3. Click **Launch Scan**
4. Watch the real-time timeline as SENTINEL:
   - Crawls the app and discovers pages/forms
   - Sends recon data to GPT-4o to generate attack plans
   - Executes attacks in a real Chromium browser
   - Reports findings with severity, evidence, CWE, and remediation

5. When complete, download reports (HTML, Markdown, SARIF, JSON)

---

### 6. What SENTINEL Tests (16 Categories)

| Category | What It Tests | Severity |
|----------|--------------|----------|
| **injection** | SQL/NoSQL injection via forms and API params | Critical |
| **xss** | Reflected and stored cross-site scripting | High |
| **auth** | Authentication bypass, unauthenticated access | Critical |
| **traversal** | Directory traversal via URL params | Critical |
| **ssrf** | Server-side request forgery | Critical |
| **idor** | Insecure direct object references | High |
| **info-leak** | Debug endpoints, exposed credentials | High |
| **redirect** | Open redirects to external domains | Medium |
| **cors** | Wildcard origins, credential exposure | High |
| **csrf** | Missing CSRF tokens | High |
| **storage** | Sensitive data in browser storage | Medium |
| **validation** | Input validation bypass, special chars | Medium |
| **dos** | Regex DoS, resource exhaustion | Medium |
| **accessibility** | WCAG violations — alt text, labels, headings, skip links, lang attr | Medium |
| **ux** | Broken images, dead links, slow loads, overflow | Low |
| **functional** | Feature correctness — search, login, forms | QA |
| **exploratory** | Edge cases, boundary values, deep routes | Explore |

---

### 7. Alternative: Run via MCP in Cursor/VSCode

Add to your `.cursor/mcp.json`:

```json
{
  "servers": {
    "sentinel": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/workspace/nemesis/dist/index.js"]
    }
  }
}
```

Then in Cursor chat:

```
Call sentinel_scan with:
  targetUrl: http://localhost:3001
  docPath: c:/workspace/nemesis/demo-app/DOCS.md
  exampleData: {"searchQuery": "Widget", "feedbackName": "Tester", "feedbackMessage": "Great product!", "username": "admin", "password": "admin"}
  headed: true

Then generate security attacks, functional tests, and exploratory tests.
Call sentinel_attack with your plans.
```

### MCP Tools

| Tool | Purpose |
|------|---------|
| **`sentinel_scan`** | Full pipeline: crawl + read docs + load knowledge. **Recommended.** |
| `sentinel_recon` | Crawl only (manual control) |
| `sentinel_attack` | Execute AI-generated test plans |
| `sentinel_learn` | Store app knowledge from documentation |
| `sentinel_knowledge` | Query the knowledge base |

---

### 8. Scanning Your Own App

```
Target URL:     https://your-app.com
Documentation:  ./path/to/your/API-DOCS.md  (optional but improves results)
Example Data:   {"searchQuery": "test", "username": "admin", "password": "secret"}
Auth Type:      form-login
Login URL:      https://your-app.com/login
Username:       admin
Password:       your-password
```

**Auth types:** `none`, `form-login`, `basic`, `bearer`, `cookie`

---

### 9. Reports

Every scan produces four report formats, downloadable from the dashboard:

| Format | Use case |
|--------|----------|
| **HTML** | Visual report with severity cards, remediation, evidence |
| **Markdown** | Paste into PRs, wikis, docs |
| **SARIF** | GitHub Security tab, CI/CD integration |
| **JSON** | Machine-readable for automation |

Reports include: executive summary, risk score, severity breakdown, per-finding evidence, reproduction steps, CWE references, and remediation recommendations.

---

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `GITHUB_TOKEN not found` | Set it as a system env var and restart your terminal |
| `Cannot find chromium` | Run `npx playwright install chromium` |
| Demo app won't start | Check port 3001 isn't in use: `netstat -ano \| findstr :3001` |
| Web dashboard won't start | Check port 3000 isn't in use |
| `better-sqlite3` build error | We use `sql.js` (pure WASM) — run `cd demo-app && npm install` |
| Build fails with Tailwind error | `cd web && rm -rf node_modules package-lock.json && npm install` |

---

## Architecture

```
sentinel/
├── src/                      # Core engine (TypeScript)
│   ├── index.ts              # MCP server — 5 tools
│   ├── types.ts              # Shared types (16 attack categories)
│   ├── core/
│   │   ├── recon.ts          # Browser crawler + auth + storage inspection
│   │   ├── attacker.ts       # Test executor (security + a11y + UX + QA)
│   │   └── orchestrator.ts   # Pipeline coordination
│   ├── reporters/
│   │   ├── report-generator.ts  # HTML + Markdown reports
│   │   └── sarif-generator.ts   # SARIF 2.1.0 for CI
│   └── memory.ts             # URL-scoped persistent knowledge base
│
├── web/                      # Web Dashboard (Next.js 15)
│   ├── app/page.tsx          # Landing page + scan orchestration
│   ├── app/api/scan/route.ts # SSE streaming API
│   ├── lib/github-llm.ts     # GitHub Models API client
│   ├── lib/scan-engine.ts    # Scan pipeline for web
│   └── components/           # Dashboard UI components
│
├── demo-app/                 # VulnShop — intentionally vulnerable target
│   ├── server.js             # Express + sql.js with 20+ vuln types
│   ├── DOCS.md               # Product docs (fed to SENTINEL)
│   └── views/                # EJS templates
│
└── PRESENTATION.html         # Hackathon presentation deck
```

---

## License

MIT
