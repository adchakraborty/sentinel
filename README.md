# SENTINEL — AI Security, Accessibility & QA

**Give it a URL. Get a full security, accessibility, and QA report.**

SENTINEL is an AI-powered testing platform with a beautiful web dashboard AND MCP server integration. It crawls your app, reads your documentation, authenticates with your credentials (including enterprise SSO), generates security attacks, accessibility audits, UX checks, and QA tests, executes them in a real Chromium browser, and learns from every run. Powered by GitHub Models API (GPT-4o).

**Zero hardcoded patterns. 16 attack categories. Web dashboard + IDE integration. The AI is the brain.**

---

## What Makes It Different

| Traditional DAST (Rapid7, AppScan, Burp) | SENTINEL |
|------------------------------------------|---------|
| Hours of scan policy configuration | One natural language prompt |
| 10,000+ generic signature-based payloads | 30-50 precision AI-generated tests |
| Security only | Security + Functional QA + Input Validation + Exploratory |
| Manual auth macro recording | Native SSO/OIDC/OAuth — automated |
| Starts from zero every scan | Persistent per-app knowledge base |
| 2-8 hour scan times | ~5 minutes |
| $10K-$100K+/year | Free / MIT |

---

## Quick Start (60 seconds)

```bash
# 1. Install
cd nemesis && npm install && npx playwright install chromium && npm run build

# 2. Launch the demo app
npx tsx src/cli.ts --demo

# 3. In Cursor/VSCode chat, paste:
```

```
Call nemesis_scan with:
  targetUrl: http://localhost:3001
  docPath: ./demo-app/DOCS.md
  exampleData: {"searchQuery": "Widget", "feedbackName": "Tester", "feedbackMessage": "Great product"}
  headed: true

Then generate security attacks, functional tests, and exploratory tests.
Call nemesis_attack with your plans.
```

### What happens next:
1. SENTINEL reads your product docs and understands the app
2. Opens a real Chromium browser, crawls every page
3. AI designs custom attack plans (SQL injection, XSS, auth bypass, SSRF, IDOR, and more)
4. Executes tests in the browser — clicking, typing, submitting — with screenshot evidence
5. Delivers reports (HTML, Markdown, SARIF) with remediation recommendations
6. Saves effective payloads to the knowledge base for smarter future scans

---

## Attack Categories

| Category | What It Tests | Severity |
|----------|--------------|----------|
| **injection** | SQL/NoSQL injection via forms and API params | Critical |
| **xss** | Reflected and stored cross-site scripting with DOM verification | High |
| **auth** | Authentication bypass, unauthenticated access, brute-force | Critical |
| **traversal** | Directory traversal via URL params and file inputs | Critical |
| **ssrf** | Server-side request forgery — making the server fetch internal URLs | Critical |
| **idor** | Insecure direct object references — accessing other users' data | High |
| **info-leak** | Debug endpoints, verbose errors, exposed credentials/API keys | High |
| **redirect** | Open redirects to arbitrary external domains | Medium |
| **cors** | Wildcard origins, origin reflection with credentials | High |
| **csrf** | Missing CSRF tokens on state-changing operations | High |
| **storage** | Sensitive data in localStorage/sessionStorage (tokens, PII, API keys) | Medium |
| **validation** | Null bytes, CRLF, unicode, long strings, special characters | Medium |
| **functional** | Does search work? Does login accept valid creds? Do dialogs render? | QA |
| **exploratory** | Edge cases, boundary values, invalid IDs, deep routes | Explore |

---

## Authentication Types

| Type | What It Does | Parameters |
|------|-------------|------------|
| `form-login` | Browser fills login form and submits | `loginUrl`, `username`, `password`, optional selectors |
| `idp-login` | Clicks login button, fills IDP credentials, handles OAuth consent | `loginUrl`, `username`, `password`, `loginTrigger`, `postLoginUrlPattern` |
| `cookie` | Sets cookies directly in the browser | `cookies: {"session": "abc123"}` |
| `bearer` | Adds `Authorization: Bearer <token>` header | `token` |
| `basic` | HTTP Basic Authentication | `username`, `password` |
| `none` | No authentication (default) | — |

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

## Reports

Every scan produces four report formats:

```
nemesis-results/
├── SENTINEL-REPORT.md        # Markdown with Mermaid attack surface diagram
├── SENTINEL-REPORT.html      # Visual HTML report with severity cards + remediation
├── nemesis-results.json     # Machine-readable JSON
├── nemesis-results.sarif    # SARIF 2.1.0 for GitHub Security tab / CI
└── screenshots/             # Evidence screenshots per finding
```

Reports include:
- Executive summary with risk score
- Severity breakdown (Critical / High / Medium / Low)
- Attack surface visualization (Mermaid flowchart)
- Per-finding evidence, reproduction steps, and CWE references
- **Remediation recommendations** for every vulnerability category
- Category breakdown table

---

## Knowledge Base

SENTINEL maintains a persistent knowledge base (`nemesis-knowledge.json`) **scoped by URL**:

- **App Profiles** — Name, tech stack, routes, auth config, example data
- **Scan History** — Every scan with results (per URL)
- **Effective Payloads** — Payloads that found real issues (per URL, reused in future scans)
- **Test Plans** — Plans from documentation (per URL)

Knowledge is automatically loaded, updated, and persisted across sessions. Each app gets its own isolated context.

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

---

## Architecture

```
src/
├── index.ts              # MCP server — 5 tools
├── types.ts              # Shared types (14 attack categories)
├── cli.ts                # CLI with demo instructions
├── launcher.ts           # Demo app lifecycle
├── memory.ts             # URL-scoped persistent knowledge base
├── core/
│   ├── recon.ts          # Browser crawler with 5 auth types + storage inspection
│   ├── attacker.ts       # Test executor (security + QA + API + exploratory)
│   └── orchestrator.ts   # Recon + Attack + Report coordination
└── reporters/
    ├── report-generator.ts  # Markdown + HTML reports with remediation
    └── sarif-generator.ts   # SARIF 2.1.0 for CI

demo-app/                 # VulnShop — deliberately vulnerable target
├── server.js             # Express app with 20+ vulnerability types
├── DOCS.md               # Product documentation (fed to SENTINEL)
└── views/                # EJS templates
```

---

## VulnShop Demo App

VulnShop ships with SENTINEL as a deliberately vulnerable target. It includes:

**Web vulnerabilities:** SQL injection, reflected XSS, stored XSS, auth bypass, path traversal, wildcard CORS, missing CSRF, insecure cookies, browser storage exposure

**API vulnerabilities:** IDOR on user/order endpoints, mass assignment, API SQL injection, SSRF via preview endpoint, open redirect, information disclosure (debug endpoint, password/API key exposure), header injection

**14+ distinct vulnerability types** across web pages and JSON APIs — designed to showcase SENTINEL finding real issues in under 5 minutes.

---

## License

MIT
