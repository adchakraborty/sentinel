# NEMESIS — Demo Prompts

Ready-to-use prompts for the hackathon demo. Copy-paste each one into Cursor chat.

---

## Demo 1: VulnShop (Built-in Demo App)

### Step 1 — Launch the demo app

```
Run: npx tsx src/cli.ts --demo
```

### Step 2 — Scan VulnShop

```
Call nemesis_scan with:
  targetUrl: http://localhost:3001
  docPath: C:/workspace/nemesis/demo-app/DOCS.md
  exampleData: {"searchQuery": "Widget", "feedbackName": "Tester", "feedbackMessage": "Great product"}
  headed: true

Then generate security attacks, functional tests, and exploratory tests.
Call nemesis_attack with your plans.
```

---

## Demo 2: Project Titan (Live Enterprise App)

### Step 1 — Scan with IDP login + documentation

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

Then generate security attacks, functional tests, and exploratory tests covering:
- All module navigation (Documents, Folders, Tasks, Workflow, Capture, Capture & Indexing)
- Create Document and Create Folder menu availability
- Shell navigation, toolbar, profile menu
- Logout flow
- CORS configuration audit
- Cookie security flags audit
Then call nemesis_attack with your plans.
```

### Step 2 — Input validation & sanitization tests

```
The recon is already done from the previous scan. Now generate a focused set of input validation and sanitization tests:

- XSS payloads via document and folder route parameters (<script>alert(1)</script>, <img src=x onerror=alert(1)>, <svg onload=alert(1)>)
- SQL injection via document and folder IDs (' OR '1'='1, UNION SELECT, DROP TABLE)
- Path traversal via document and folder IDs (../../etc/passwd, double-encoded variants)
- CRLF injection (%0d%0a headers)
- Null byte injection (%00)
- Special characters (!@#$%^&*()_+-=[]{}|;':,./<>?`~)
- Extremely long strings (500+ characters)
- Unicode and control characters
- Invalid/bogus IDs (99999999999, -1, null, undefined, NaN)
- Deeply nested non-existent routes

Call nemesis_attack with these validation plans.
```

---

## Demo 3: Full Titan Run (Single Prompt — Does Everything)

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
  exampleData: {
    "documentName": "Nemesis Test Doc",
    "folderName": "Nemesis Test Folder",
    "xssPayload": "<script>alert('xss')</script>",
    "sqlPayload": "' OR 1=1 --",
    "specialChars": "!@#$%^&*()_+-=[]{}|;:<>?",
    "longString": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
  }
  maxPages: 15
  headed: true

Then generate a comprehensive test suite covering ALL of the following:

FUNCTIONAL TESTS:
- Home page shows all 6 module tiles after login
- Navigate to each module: Documents, Folders, Tasks, Workflow, Capture, Capture & Indexing
- Create Document and Create Folder menus are accessible from toolbar
- Shell left navigation renders with all module nav items
- Shell toolbar shows logo, title, and profile menu
- Logout flow clears session and shows login button

SECURITY TESTS:
- CORS configuration: check if Access-Control-Allow-Origin reflects arbitrary origins with credentials
- Cookie security: idsrv.session missing HttpOnly, shib cookies missing Secure flag
- XSS via document and folder route parameters
- SQL injection via document and folder route parameters
- Path traversal via document and folder route parameters

INPUT VALIDATION TESTS:
- Special characters in route parameters
- Extremely long strings in route parameters
- Null byte injection
- CRLF injection
- Double-encoded path traversal
- Unicode characters
- Invalid/bogus document and folder IDs

EXPLORATORY TESTS:
- Non-existent routes (404 handling)
- Deeply nested invalid routes
- Integration Server API endpoint probing

Call nemesis_attack with all your plans.
```

---

## Bonus: Check Knowledge Base

```
Call nemesis_knowledge with url: https://project-titan.pc.k8s.hyland.io
```

---

## Demo Flow (Suggested Order)

1. **Open PRESENTATION.html** in browser — walk through slides
2. **Demo 1** — VulnShop scan (fast, lots of findings, shows the tool working)
3. **Demo 2 Step 1** — Titan scan (shows IDP login, enterprise app, real-world)
4. **Demo 2 Step 2** — Titan validation tests (shows input sanitization depth)
5. **Bonus** — Show knowledge base growing across runs
6. **Show reports** — Open `nemesis-results/NEMESIS-REPORT.html` in browser
