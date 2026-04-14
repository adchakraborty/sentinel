<p align="center">
  <img src="https://img.shields.io/badge/AI-GPT--4o-blueviolet?style=for-the-badge" alt="AI Engine" />
  <img src="https://img.shields.io/badge/Browser-Playwright-45ba63?style=for-the-badge" alt="Browser" />
  <img src="https://img.shields.io/badge/Protocol-MCP-blue?style=for-the-badge" alt="MCP" />
  <img src="https://img.shields.io/badge/Dashboard-Next.js%2015-black?style=for-the-badge" alt="Dashboard" />
  <img src="https://img.shields.io/badge/Categories-17-orange?style=for-the-badge" alt="Categories" />
</p>

# SENTINEL

### Give it a URL. Get a full security, accessibility, and QA report.

---

## The Problem

Application security testing is broken. Enterprise DAST tools like Rapid7 InsightAppSec, HCL AppScan, and Burp Suite demand **hours of configuration** before they even start scanning — authentication macros, scope rules, scan policies, exclusion lists, crawl tuning. When they finally finish (2–8 hours later), they dump hundreds of findings, most of them **false positives**, with no understanding of what your application actually does.

They treat every app the same. They can't read your documentation. They don't understand your business logic. They start from zero every time. And they only test security — your functional QA, accessibility audits, and exploratory testing remain entirely separate workflows with entirely separate tools.

**What if a security scanner could actually think?**

---

## The Idea

SENTINEL is an **AI-native application testing platform** that replaces the entire DAST + QA + accessibility testing stack with a single, intelligent agent.

You give it a URL and (optionally) your product documentation. It does the rest:

1. **Crawls** your application in a real Chromium browser — mapping pages, forms, cookies, headers, localStorage, sessionStorage, and IndexedDB
2. **Reads** your documentation and understands your application's purpose, data model, and user flows
3. **Reasons** about the attack surface using GPT-4o — no hardcoded patterns, no signature databases — generating custom test plans for *this specific application*
4. **Executes** security attacks, functional tests, accessibility audits, UX checks, and exploratory tests in a live browser — clicking buttons, filling forms, navigating pages, exactly like a human tester
5. **Learns** from every run — saving effective payloads, scan history, and application knowledge in a persistent, URL-scoped knowledge base that makes every future scan smarter

**Zero config. One prompt. 17 test categories. The AI is the brain.**

---

## What Makes This Different

| | Traditional DAST | SENTINEL |
|---|---|---|
| **Setup time** | Hours (policies, auth macros, scope) | Zero — give it a URL |
| **Test generation** | Hardcoded signature databases | AI reasons about *your specific app* |
| **Documentation** | Ignored | Read, understood, used for test design |
| **Learning** | Starts from scratch every run | Persistent knowledge base — gets smarter |
| **Coverage** | Security only | Security + QA + Accessibility + UX + Exploratory |
| **False positives** | Hundreds | Near-zero (AI validates each finding) |
| **Evidence** | HTTP logs | Screenshots, reproduction steps, CWE references |
| **Scan time** | 2–8 hours | 3–5 minutes |
| **Integration** | Standalone | MCP server (IDE-native) + Web dashboard + CI/CD (SARIF) |

### The Key Insight

Traditional scanners use **pattern matching** — they fire known payloads and check for known responses. They're sophisticated `grep` at scale.

SENTINEL uses **reasoning**. The AI reads your documentation, analyzes the crawl data, and *designs* attacks tailored to your specific application. It sees a search form and thinks "this concatenates user input into a SQL query" — not because a rule told it to, but because it read your docs and understands the architecture. When it finds a vulnerability, it validates it in real-time and provides evidence. When it doesn't find one, it moves on instead of generating a false positive.

This is not "AI-assisted scanning." This is **AI-native testing** — the LLM is the test designer, the risk assessor, and the evidence analyst.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        SENTINEL                                  │
│                                                                  │
│  ┌──────────┐    ┌───────────┐    ┌───────────┐    ┌──────────┐│
│  │  RECON   │───▶│  GPT-4o   │───▶│ ATTACKER  │───▶│ REPORTER ││
│  │ (crawl)  │    │ (reason)  │    │ (execute)  │    │ (report)  ││
│  └──────────┘    └───────────┘    └───────────┘    └──────────┘│
│       │                │                │                │      │
│       ▼                ▼                ▼                ▼      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    KNOWLEDGE BASE                            ││
│  │  URL-scoped persistent memory: app profiles, effective       ││
│  │  payloads, scan history, test plans — learns across runs     ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Interfaces:  MCP Server (5 tools)  │  Next.js Web Dashboard    │
└─────────────────────────────────────────────────────────────────┘
```

**Phase 1 — Recon:** Playwright launches Chromium, authenticates (form-login, IDP/SSO, bearer, basic, cookie), and crawls the target. Every page is mapped: forms, inputs, cookies (including HttpOnly/Secure/SameSite flags), response headers, localStorage, sessionStorage, IndexedDB, and links. Screenshots captured at every step.

**Phase 2 — Planning:** The crawl data + your documentation + knowledge from past runs are sent to GPT-4o via the GitHub Models API. The LLM designs a complete test plan — not from templates, but from *reasoning about the specific attack surface*. It generates attack payloads, success indicators, and severity ratings.

**Phase 3 — Attack:** Each test is executed in the live browser. SQL injection payloads typed into search boxes. XSS payloads submitted in feedback forms. Direct URL access to admin pages. Path traversal through file viewers. CORS probes via fetch. Accessibility checks via DOM inspection. Functional verification with example data. Every result captured with screenshot evidence.

**Phase 4 — Report:** Four output formats — HTML (visual report with severity cards), Markdown (for PRs/wikis), SARIF 2.1.0 (GitHub Security tab / CI pipelines), JSON (machine-readable). Each finding includes severity, CWE reference, evidence, reproduction steps, and remediation.

**Persistent Memory:** Effective payloads are saved to a URL-scoped JSON knowledge base. The next scan reads it first, reuses proven attacks, and focuses effort on unexplored areas. Traditional DAST tools start from zero every time. SENTINEL compounds its intelligence.

---

## 17 Test Categories

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
| **validation** | Input validation bypass, special characters | Medium |
| **dos** | Regex DoS, resource exhaustion | Medium |
| **accessibility** | WCAG violations — alt text, labels, headings, skip links, lang attr | Medium |
| **ux** | Broken images, dead links, slow loads, overflow | Low |
| **functional** | Feature correctness — search, login, forms | QA |
| **exploratory** | Edge cases, boundary values, deep routes | Explore |

Not a checklist. The AI decides which categories apply based on what it finds during recon.

---

## Two Interfaces

### 1. Web Dashboard (Next.js 15)

A real-time streaming dashboard with scan configuration, live attack timeline, finding cards with severity badges, and one-click report downloads (HTML/Markdown/SARIF/JSON). Built with SSE streaming — you watch the AI work in real time.

### 2. MCP Server (IDE-Native)

SENTINEL exposes 5 MCP tools that integrate directly into Cursor, VS Code, or any MCP-compatible IDE:

| Tool | Purpose |
|------|---------|
| **`sentinel_scan`** | Full pipeline: crawl + read docs + load knowledge (**recommended**) |
| `sentinel_recon` | Crawl only (manual control) |
| `sentinel_attack` | Execute AI-generated test plans |
| `sentinel_learn` | Store app knowledge from documentation |
| `sentinel_knowledge` | Query the knowledge base |

One prompt in your IDE. The AI assistant calls `sentinel_scan`, reads the results, generates attack plans, calls `sentinel_attack`, and reports findings — all in a conversational flow.

---

## Demo: One Prompt, Fourteen Findings

SENTINEL ships with **VulnShop** — a deliberately vulnerable Express.js app with 20+ baked-in vulnerabilities: SQL injection, XSS, auth bypass, path traversal, IDOR, CORS misconfiguration, CSRF, info leaks, and more.

**The prompt:**
```
Call sentinel_scan with:
  targetUrl: http://localhost:3001
  docPath: ./demo-app/DOCS.md
  exampleData: {"searchQuery": "Widget", "username": "admin", "password": "admin"}
  headed: true
```

**The result (under 5 minutes):**

| Severity | Count | Examples |
|----------|-------|---------|
| Critical | 3 | SQL injection (full DB dump), Auth bypass (admin panel), Path traversal (read server files) |
| High | 4 | Reflected XSS, Stored XSS, Wildcard CORS, Missing CSRF tokens |
| Medium | 4 | Browser storage exposure, Input validation bypass, Open redirects, Missing accessibility labels |
| Low/QA | 3+ | Functional verification (search works, login works), UX checks, Exploratory edge cases |

Every finding includes screenshot evidence, reproduction steps, and CWE references. Zero false positives.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Core engine | TypeScript |
| Browser automation | Playwright (Chromium) |
| AI reasoning | GPT-4o via GitHub Models API |
| MCP integration | `@modelcontextprotocol/sdk` |
| Web dashboard | Next.js 15, React, Tailwind CSS |
| Report formats | HTML, Markdown, SARIF 2.1.0, JSON |
| Knowledge base | URL-scoped JSON with atomic writes |
| Schema validation | Zod |
| Demo target | Express.js + sql.js (WASM SQLite) |

---

## Project Structure

```
sentinel/
├── src/                          # Core engine (TypeScript)
│   ├── index.ts                  # MCP server — 5 tools
│   ├── types.ts                  # Shared types (17 attack categories)
│   ├── core/
│   │   ├── recon.ts              # Browser crawler + auth (form, IDP, bearer, basic, cookie)
│   │   ├── attacker.ts           # Test executor — 1,300 lines of browser-based attack logic
│   │   └── orchestrator.ts       # Pipeline coordination + report generation
│   ├── reporters/
│   │   ├── report-generator.ts   # HTML + Markdown report templates
│   │   └── sarif-generator.ts    # SARIF 2.1.0 for GitHub/CI
│   └── memory.ts                 # URL-scoped persistent knowledge base
│
├── web/                          # Web Dashboard (Next.js 15)
│   ├── app/page.tsx              # Landing page + scan orchestration
│   ├── app/api/scan/route.ts     # SSE streaming API
│   ├── lib/github-llm.ts         # GitHub Models API client (GPT-4o)
│   ├── lib/scan-engine.ts        # Scan pipeline for web
│   ├── lib/prompt-builder.ts     # System + user prompt construction
│   ├── lib/baseline-attacks.ts   # Baseline attack generation
│   └── components/               # Dashboard UI components
│
├── demo-app/                     # VulnShop — intentionally vulnerable target
│   ├── server.js                 # Express + sql.js with 20+ vuln types
│   ├── DOCS.md                   # Product docs (fed to SENTINEL)
│   └── views/                    # EJS templates
│
└── PRESENTATION.html             # Hackathon presentation deck
```

---

## Quickstart

### Prerequisites

| Requirement | Check | Install |
|-------------|-------|---------|
| **Node.js 24+** | `node --version` | [nodejs.org](https://nodejs.org) |
| **Chromium** | (installed below) | `npx playwright install chromium` |
| **GITHUB_TOKEN** | `echo %GITHUB_TOKEN%` (Win) | See below |

### 1. GitHub Token

SENTINEL uses the GitHub Models API (GPT-4o). Get a token with `models:read` scope:

1. Go to https://github.com/settings/tokens → **Generate new token (classic)**
2. Check **`models:read`** scope
3. Set as environment variable:

```powershell
# PowerShell (permanent)
[System.Environment]::SetEnvironmentVariable('GITHUB_TOKEN', 'ghp_your_token_here', 'User')
# Restart terminal after setting
```

### 2. Install & Build

```bash
npm install && npx playwright install chromium
cd demo-app && npm install && cd ..
cd web && npm install && cd ..
npm run build
```

### 3. Run the Demo

**Terminal 1** — Start VulnShop:
```bash
cd demo-app && node server.js
```

**Terminal 2** — Start the dashboard:
```bash
cd web && npx next dev
```

Open **http://localhost:3000**, enter target URL `http://localhost:3001`, paste the documentation path `./demo-app/DOCS.md`, add example data, and click **Launch Scan**.

### 4. Run via MCP in Cursor

Add to `.cursor/mcp.json`:
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
  exampleData: {"searchQuery": "Widget", "username": "admin", "password": "admin"}
  headed: true

Then generate security attacks, functional tests, and exploratory tests.
Call sentinel_attack with your plans.
```

### Example Data JSON

```json
{
  "searchQuery": "Widget",
  "feedbackName": "Tester",
  "feedbackMessage": "Great product!",
  "username": "admin",
  "password": "admin",
  "productCategory": "widgets",
  "userId": "1",
  "orderId": "1",
  "email": "test@example.com"
}
```

---

## Reports

Every scan produces four formats:

| Format | Use Case |
|--------|----------|
| **HTML** | Visual report with severity cards, remediation, evidence |
| **Markdown** | Paste into PRs, wikis, docs |
| **SARIF** | GitHub Security tab, CI/CD integration |
| **JSON** | Machine-readable for automation |

Each finding includes: severity badge, detailed evidence, CWE reference, reproduction steps, and remediation recommendation.

---

## Scanning Your Own App

```
Target URL:     https://your-app.com
Documentation:  ./path/to/your/API-DOCS.md  (optional but improves results)
Example Data:   {"searchQuery": "test", "username": "admin", "password": "secret"}
Auth Type:      form-login
Login URL:      https://your-app.com/login
Username:       admin
Password:       your-password
```

Supported auth: `none`, `form-login`, `idp-login`, `basic`, `bearer`, `cookie`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `GITHUB_TOKEN not found` | Set as system env var, restart terminal |
| `Cannot find chromium` | `npx playwright install chromium` |
| Demo app won't start | Check port 3001: `netstat -ano \| findstr :3001` |
| Dashboard won't start | Check port 3000 isn't in use |
| `better-sqlite3` build error | We use `sql.js` (pure WASM) — `cd demo-app && npm install` |
| Tailwind build error | `cd web && rm -rf node_modules package-lock.json && npm install` |

---

## License

MIT
