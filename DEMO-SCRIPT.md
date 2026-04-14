# NEMESIS — 5-Minute Live Demo Script

> **Total runtime:** 5:00  
> **Format:** Screen recording with voiceover (or live presenter)  
> **Setup:** Cursor IDE open, VulnShop NOT running yet, browser ready  
> **Presentation sync:** Each act maps to a section in `PRESENTATION.html`

---

## Pre-Demo Checklist

- [ ] Cursor IDE open with `c:\workspace\nemesis` workspace
- [ ] Terminal visible at bottom of IDE
- [ ] No VulnShop instance running (`npx tsx src/cli.ts --demo` ready to type)
- [ ] Browser window positioned to the right (for headed mode)
- [ ] `nemesis-knowledge.json` cleared or backed up (optional — for cold-start demo)
- [ ] `PRESENTATION.html` open in a separate browser tab (for quick reference)
- [ ] Screen recording tool running (OBS, Loom, or similar)

---

## ACT 1 — The Hook (0:00–0:30)

**Presentation section:** Hero  
**What's on screen:** Cursor IDE, empty chat

### Voiceover Script

> "What if you could test your entire web application — security, functional QA, input validation, and edge cases — with a single prompt? No setup, no scripting, no configuration files. Just tell the AI: here's my app, here's my docs, test everything."
>
> "That's NEMESIS. Let me show you."

### Actions

1. **0:00** — Show Cursor IDE with the nemesis workspace open
2. **0:15** — Click into the Cursor chat panel
3. **0:20** — Pause briefly to let the audience see the clean starting state

---

## ACT 2 — Launch the Demo App (0:30–1:00)

**Presentation section:** Demo App (VulnShop)  
**What's on screen:** Terminal + IDE

### Voiceover Script

> "NEMESIS ships with VulnShop — a deliberately vulnerable demo app. One command to launch it."

### Actions

1. **0:30** — Type in terminal:
   ```
   npx tsx src/cli.ts --demo
   ```
2. **0:35** — Wait for output: `VulnShop running at http://localhost:XXXX`
3. **0:40** — Briefly open VulnShop in browser to show it's a real app (home page, search page, login page — quick 3-second tour)
4. **0:55** — Switch back to Cursor IDE

### Key talking point

> "This is a real Express.js app with a search page, login, admin panel, file viewer, and feedback form. It has real vulnerabilities baked in — SQL injection, XSS, path traversal, auth bypass. Let's see if NEMESIS can find them."

---

## ACT 3 — The One Prompt (1:00–1:45)

**Presentation section:** How It Works (Step 1)  
**What's on screen:** Cursor chat

### Voiceover Script

> "Now watch. I give NEMESIS one prompt — the URL, the documentation path, some example data, and I ask it to run headed so you can see the browser."

### Actions

1. **1:00** — Type (or paste) into Cursor chat:
   ```
   Call nemesis_scan with targetUrl http://localhost:XXXX,
   docPath ./demo-app/DOCS.md,
   exampleData { "searchQuery": "Widget", "feedbackName": "Tester" },
   headed true.
   Then analyze the results and call nemesis_attack.
   ```
2. **1:15** — Hit Enter
3. **1:20** — Point out: "Notice — no config files, no scan policies, no auth macros. One natural language prompt."
4. **1:30** — The AI starts processing. A Chromium browser window appears.

### Key talking point

> "This is the entire setup. Compare that to Rapid7 or AppScan where you'd spend hours configuring scan policies, recording authentication macros, and defining scope rules."

---

## ACT 4 — Watch It Work (1:45–3:00)

**Presentation section:** How It Works (Steps 2–4) + Architecture  
**What's on screen:** Split view — Cursor chat (left) + Chromium browser (right)

### Voiceover Script (narrate what's happening live)

> **1:45** — "The browser just opened. NEMESIS is crawling the app — you can see it navigating to each page, mapping forms, inputs, cookies, and headers."
>
> **2:00** — "Back in the chat, the AI is reading the documentation. It's learning what the app does — the search page, the login flow, the admin panel, the file viewer."
>
> **2:15** — "Now the AI is analyzing the recon data. It sees the forms, the cookies without Secure flags, the CORS headers. It's designing a custom attack plan — not from a signature database, but from reasoning about THIS specific app."
>
> **2:30** — "Watch the browser — it's now executing the attacks. It's typing SQL injection payloads into the search box... trying XSS on the feedback form... attempting to access /admin without logging in... trying path traversal on the file viewer."
>
> **2:45** — "Every action is captured with a screenshot. Every response is analyzed. The AI decides in real-time whether each test found something."

### Actions

1. **1:45** — Position browser window so audience can see pages loading
2. **2:00** — Briefly scroll the Cursor chat to show the AI's analysis text
3. **2:30** — Watch the browser as attacks execute (SQL injection in search, XSS attempts, /admin access)
4. **2:50** — Browser closes as attacks complete

### Key talking point

> "This is a real Chromium browser, not a proxy. It clicks buttons, fills forms, submits data — exactly like a human tester. But it's doing it in 2 minutes instead of 2 days."

---

## ACT 5 — The Results (3:00–3:45)

**Presentation section:** Demo App results  
**What's on screen:** Cursor chat showing results

### Voiceover Script

> "And here are the results. In under 3 minutes, NEMESIS found 14 issues."

### Actions

1. **3:00** — Scroll through the results in Cursor chat. Pause on each finding:
   - **3:05** — "CRITICAL: SQL Injection on the search page — it used `' OR 1=1 --` and got back the entire database."
   - **3:10** — "CRITICAL: Auth bypass — the /admin page is accessible without any login."
   - **3:15** — "CRITICAL: Path traversal — it read `../../package.json` through the file viewer."
   - **3:20** — "HIGH: Reflected XSS, Stored XSS, Wildcard CORS, Missing CSRF tokens."
   - **3:25** — "And it also ran FUNCTIONAL tests — search works, login works, feedback form saves correctly."

2. **3:30** — Open the HTML report:
   ```
   Open nemesis-results/NEMESIS-REPORT.html in browser
   ```
3. **3:35** — Quick scroll through the report — show the severity cards, evidence blocks, screenshot links

### Key talking point

> "14 issues. 3 critical, 4 high. Plus functional QA tests that passed. All from one prompt. And notice — the AI generated every single payload. There's no signature database. It reasoned about what to test based on the documentation and the recon data."

---

## ACT 6 — The Knowledge Base (3:45–4:15)

**Presentation section:** Knowledge / nemesis-knowledge.json  
**What's on screen:** Cursor IDE showing nemesis-knowledge.json

### Voiceover Script

> "Now here's what makes NEMESIS different from every other scanner. Open nemesis-knowledge.json."

### Actions

1. **3:45** — Open `nemesis-knowledge.json` in the IDE
2. **3:50** — Scroll to `effectivePayloads` array:
   > "Every payload that found a vulnerability is saved here — tagged by category, target type, and app. SQL injection payloads, XSS strings, the CORS probe, the path traversal path."
3. **4:00** — Scroll to `scanHistory`:
   > "And here's the full scan history. Timestamp, pages scanned, attacks executed, findings."
4. **4:05** — Key point:
   > "Next time I scan this app, NEMESIS reads this file first. It already knows what works. It reuses proven attacks and focuses new effort on unexplored areas. Rapid7 and AppScan start from zero every time. NEMESIS gets smarter with every run."

### Key talking point

> "This is the AI's long-term memory. It persists across sessions, across days, across weeks. Each app has its own isolated knowledge. This is something no traditional DAST tool does."

---

## ACT 7 — The Closer (4:15–5:00)

**Presentation section:** vs. Rapid7/AppScan + CTA  
**What's on screen:** PRESENTATION.html comparison section (or Cursor chat)

### Voiceover Script

> **4:15** — "So let's put this in perspective."
>
> **4:20** — "With Rapid7 InsightAppSec or HCL AppScan, you'd spend hours configuring scan policies, recording auth macros, defining scope. Then wait 2 to 8 hours for the scan. Then triage 200+ findings, most of them false positives. Then do it all again next time from scratch."
>
> **4:35** — "With NEMESIS: one prompt, 5 minutes, 14 validated findings, zero false positives, and a knowledge base that carries forward."
>
> **4:45** — "It reads your documentation. It understands your app. It designs custom tests. It runs them in a real browser. It learns from every scan. And it does security, functional QA, input validation, and exploratory testing — all in one run."
>
> **4:55** — "That's NEMESIS. Give it a URL. It does the rest."

### Actions

1. **4:15** — Switch to PRESENTATION.html, scroll to the comparison table (or keep in Cursor)
2. **4:35** — Switch back to Cursor chat showing the results summary
3. **4:55** — End on the Cursor chat or the NEMESIS hero slide

---

## Backup: Enterprise Demo (if time allows or as alternate)

If demoing against Project Titan instead of VulnShop, use this prompt:

```
Call nemesis_scan with:
  targetUrl: https://project-titan.pc.k8s.hyland.io
  docPath: C:/workspace/nemesis/docs/PROJECT-TITAN.md
  auth: {
    type: "idp-login",
    loginUrl: "https://project-titan.pc.k8s.hyland.io/home",
    username: "test2",
    password: "ImageNow!ImageNow!",
    loginTrigger: "button[mat-stroked-button]",
    postLoginUrlPattern: "/home"
  }
  maxPages: 15
  headed: true
```

**Key differences to call out:**
- "Watch it handle enterprise OIDC authentication — click Login, redirect to IDP, fill credentials, handle consent, redirect back. Fully automated."
- "It found CORS misconfiguration on a production enterprise app — the kind of vulnerability that enables full account takeover."
- "It inspected localStorage and found the CSRF token stored in client-side storage — a finding that Rapid7 and AppScan would never catch because they only check cookies."

---

## Tips for Recording

### Screen Layout
```
┌─────────────────────────────────────────────────┐
│  Cursor IDE                    │  Browser        │
│  ┌──────────────────────────┐  │  (appears in    │
│  │  Editor / Files           │  │   Act 4 when   │
│  │                           │  │   headed mode   │
│  │                           │  │   launches)     │
│  ├──────────────────────────┤  │                 │
│  │  Chat Panel               │  │                 │
│  │  (main focus for          │  │                 │
│  │   Acts 3, 5)              │  │                 │
│  ├──────────────────────────┤  │                 │
│  │  Terminal                 │  │                 │
│  │  (Act 2 only)             │  │                 │
│  └──────────────────────────┘  │                 │
└─────────────────────────────────────────────────┘
```

### Pacing
- **Acts 1–2 (0:00–1:00):** Brisk — setup is boring, move fast
- **Act 3 (1:00–1:45):** Slow down — this is the "wow" moment (one prompt)
- **Act 4 (1:45–3:00):** Narrate live — the browser is the star
- **Acts 5–6 (3:00–4:15):** Moderate — let findings sink in
- **Act 7 (4:15–5:00):** Confident, punchy — land the message

### If Things Go Wrong
- **Scan takes too long:** Pre-record Act 4 and splice it in. The rest can be live.
- **VulnShop won't start:** Have a backup terminal with it already running.
- **Browser doesn't appear:** Remove `headed: true` and narrate from the chat output instead.
- **Fewer findings than expected:** Focus on quality over quantity — "Even 5 targeted findings beat 200 false positives from a generic scanner."

---

## Video Generation Options

Since a fully AI-generated video isn't possible from this workspace, here are practical approaches:

### Option A: Screen Record + Edit (Recommended)
1. Use **OBS Studio** (free) or **Loom** to record your screen while following this script
2. Record voiceover separately for cleaner audio (or use OBS's audio mixing)
3. Edit in **DaVinci Resolve** (free) or **CapCut** — add title cards between acts
4. Total effort: ~1 hour recording + 1 hour editing

### Option B: AI Avatar + Screen Capture
1. Record the screen demo silently following this script
2. Upload the script text to **Synthesia** or **HeyGen** to generate an AI avatar presenter
3. Overlay the avatar in a corner of the screen recording
4. Total effort: ~1 hour recording + 30 min AI generation + 30 min compositing

### Option C: Automated Screen Recording with Playwright
Since NEMESIS already uses Playwright, you could script a Playwright test that:
1. Opens Cursor (or a mock IDE interface)
2. Types the prompt
3. Shows the browser crawling
4. Displays results
5. Records the entire session as a video using `context.newPage()` + `page.video()`

This would be fully reproducible but requires building the recording script (~2-3 hours).
