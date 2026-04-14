# NEMESIS — AI Red Team + QA

**Give it a URL, point it at your docs, and the LLM finds every way to break your app.**

NEMESIS is an LLM-powered testing tool that runs as an MCP server inside Cursor/VSCode. It crawls your app, reads your documentation, authenticates with your credentials, uses your example data for functional tests, generates security attacks AND QA tests, executes them in a real Chromium browser, and learns from every run.

**Zero hardcoded patterns. URL-scoped knowledge. The LLM is the brain.**

---

## Demo Instructions

### Step 1: Launch the demo app

```bash
cd nemesis
npm install && npx playwright install chromium && npm run build
npx tsx src/cli.ts --demo
```

This starts VulnShop (a deliberately vulnerable app).

### Step 2: Scan it from Cursor/VSCode chat

```
Call nemesis_scan with:
  targetUrl: http://localhost:3001
  docPath: C:/workspace/nemesis/demo-app/DOCS.md
  exampleData: {"searchQuery": "Widget", "feedbackName": "Tester", "feedbackMessage": "Great product"}
  headed: true

Then generate security attacks, functional tests, and exploratory tests.
Call nemesis_attack with your plans.
```

### Step 3: View reports

```
nemesis-results/
├── NEMESIS-REPORT.md        # Markdown report
├── NEMESIS-REPORT.html      # HTML report
├── nemesis-results.json     # Machine-readable
├── nemesis-results.sarif    # SARIF for CI/CD
└── screenshots/             # Evidence screenshots
```

---

## Scanning Your Own App

```
Call nemesis_scan with:
  targetUrl: http://localhost:3000
  docPath: ./path/to/your/API-DOCS.md
  auth: {
    type: "form-login",
    loginUrl: "http://localhost:3000/login",
    username: "admin",
    password: "secret"
  }
  exampleData: {
    "searchQuery": "test item",
    "newUserName": "john",
    "newUserEmail": "john@example.com"
  }

Then generate tests and call nemesis_attack.
```

---

## Authentication Types

| Type | What It Does | Parameters |
|------|-------------|------------|
| `form-login` | Browser fills login form and submits | `loginUrl`, `username`, `password`, optional `usernameField`/`passwordField` selectors |
| `idp-login` | Clicks login button on app, fills credentials on external IDP, handles consent | `loginUrl` (app URL), `username`, `password`, optional `loginTrigger`, `consentButton`, `postLoginUrlPattern` |
| `cookie` | Sets cookies directly in the browser | `cookies: {"session": "abc123", "auth": "token"}` |
| `bearer` | Adds `Authorization: Bearer <token>` header | `token` |
| `basic` | HTTP Basic Authentication | `username`, `password` |
| `none` | No authentication (default) | — |

---

## MCP Setup

Add to your `mcp.json` (user-level or workspace):

```json
{
  "servers": {
    "nemesis": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/workspace/nemesis/dist/index.js"]
    }
  }
}
```

---

## MCP Tools

| Tool | Purpose |
|------|---------|
| **`nemesis_scan`** | Full pipeline: crawl + read docs + load knowledge. **Recommended entry point.** |
| `nemesis_recon` | Crawl only (for manual control) |
| `nemesis_attack` | Execute LLM-generated test plans |
| `nemesis_learn` | Store app profiles, auth, example data, test plans from docs |
| `nemesis_knowledge` | Query the knowledge base (optionally scoped to a URL) |

### nemesis_scan Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `targetUrl` | string | Yes | URL to scan |
| `docPath` | string | No | Path to documentation file — NEMESIS reads it and returns content |
| `auth` | object | No | Authentication credentials (see auth types above) |
| `exampleData` | object | No | Key-value pairs of sample data for functional testing |
| `maxPages` | number | No | Max pages to crawl (default: 10) |
| `headed` | boolean | No | Show the browser |

### nemesis_attack Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `plans` | AttackPlan[] | LLM-generated test plans with payloads and indicators |

**Categories:** `injection`, `xss`, `auth`, `traversal`, `validation`, `cors`, `csrf`, `functional`, `exploratory`

---

## Knowledge Base

NEMESIS maintains a persistent knowledge base (`nemesis-knowledge.json`) **scoped by URL**. Each app gets its own context:

- **App Profiles** — Name, tech stack, routes, auth config, example data
- **Scan History** — Every scan run with results (per URL)
- **Effective Payloads** — Payloads that found real issues (per URL)
- **Test Plans** — Plans from documentation (per URL)

Knowledge is automatically:
- Loaded during `nemesis_scan` / `nemesis_recon` and shown to the LLM
- Updated after `nemesis_attack` with new findings and effective payloads
- Persisted across sessions — close Cursor, reopen, knowledge is still there

---

## Test Categories

| Category | What It Tests |
|----------|--------------|
| **Security** | SQL injection, XSS, auth bypass, path traversal, CORS, CSRF |
| **Functional** | Does search work? Does login accept valid creds? Does form save data? |
| **Exploratory** | Random inputs, edge cases, boundary values, empty submissions |

---

## Architecture

```
src/
├── index.ts              # MCP server — 5 tools
├── types.ts              # Shared types
├── cli.ts                # CLI with demo instructions
├── launcher.ts           # Demo app lifecycle
├── memory.ts             # URL-scoped persistent knowledge base
├── core/
│   ├── recon.ts          # Browser crawler with auth support
│   ├── attacker.ts       # Test executor (security + QA + exploratory)
│   └── orchestrator.ts   # Recon + Attack + Report coordination
└── reporters/
    ├── report-generator.ts  # Markdown + HTML reports
    └── sarif-generator.ts   # SARIF 2.1.0 for CI
```

---

## License

MIT
