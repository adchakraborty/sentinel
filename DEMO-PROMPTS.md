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

### Step 1 — Scan with IDP login + documentation + example data

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
    "documentDrawer": "Default Drawer",
    "documentField1": "Test Value 1",
    "documentField2": "Test Value 2",
    "folderName": "Nemesis Test Folder",
    "folderPath": "\\Default Drawer",
    "folderType": "Default",
    "taskType": "Document deficiency",
    "taskTemplate": "Bill",
    "taskUser": "Murray, Bill (test1)",
    "taskLocation": "Page with an annotation",
    "taskStartDate": "4/7/2026",
    "taskDueDate": "4/12/2026",
    "taskInstructions": "Review this document for completeness",
    "taskComments": "Created by Nemesis automated testing"
  }
  maxPages: 15
  headed: true

Then generate security attacks, functional tests, and exploratory tests covering:
- All module navigation (Documents, Folders, Tasks, Workflow, Capture, Capture & Indexing)
- Create Document dialog: open it, verify fields (Name, Drawer, Field1-4, Application Plan, version control, workflow queue)
- Create Folder dialog: open it, verify fields (Name, Path, Type, Application Plan, workflow queue, shortcut)
- Create Task dialog: open it, verify fields (Task type, Template, Users/group, Location, Start date, Due date, Expedite, Instructions, Comments)
- Shell navigation, toolbar, profile menu
- Logout flow
- CORS configuration audit
- Cookie security flags audit
- Browser storage audit (localStorage, sessionStorage for sensitive data like tokens, credentials, API keys)
Then call nemesis_attack with your plans.
```

### Step 2 — Input validation & sanitization tests

```
The recon is already done from the previous scan. Now generate a focused set of input validation and sanitization tests.

Test BOTH route parameters AND form fields:

ROUTE PARAMETER INJECTION:
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

FORM FIELD INJECTION (use Create Document and Create Folder dialogs):
- Open Create Document dialog, enter XSS payload (<script>alert('xss')</script>) in the Name field
- Open Create Document dialog, enter SQL injection (' OR 1=1 --) in the Name field
- Open Create Folder dialog, enter path traversal (../../etc/passwd) in the Name field
- Open Create Folder dialog, enter extremely long string (500+ chars) in the Name field
- Open Create Document dialog, enter special characters (!@#$%^&*) in Field1 and Field2
- Open Create Folder dialog, enter null byte (%00) in the Name field

Call nemesis_attack with these validation plans.
```

---

## Demo 3: Full Titan Run (Single Prompt — Does Everything)
Add creds before running the actual prompt
```
Call nemesis_scan with:
  targetUrl: https://project-titan.pc.k8s.hyland.io
  docPath: C:/workspace/nemesis/docs/PROJECT-TITAN.md
  auth: {
    type: "idp-login",
    loginUrl: "https://project-titan.pc.k8s.hyland.io/home",
    loginTrigger: "button[mat-stroked-button]",
    postLoginUrlPattern: "/home"
  }
  exampleData: {
    "documentName": "Nemesis Test Doc",
    "documentDrawer": "Default Drawer",
    "documentField1": "Test Value 1",
    "documentField2": "Test Value 2",
    "folderName": "Nemesis Test Folder",
    "folderPath": "\\Default Drawer",
    "folderType": "Default",
    "taskType": "Document deficiency",
    "taskTemplate": "Bill",
    "taskUser": "Murray, Bill (test1)",
    "taskLocation": "Page with an annotation",
    "taskStartDate": "4/7/2026",
    "taskDueDate": "4/12/2026",
    "taskInstructions": "Review this document for completeness",
    "taskComments": "Created by Nemesis automated testing",
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
- Create Document dialog: open via toolbar "Create" menu, fill in Name, Drawer, Field1-4, verify form fields render
- Create Folder dialog: open via toolbar "Create" menu, fill in Name, Path, Type, verify form fields render
- Create Task dialog: open via toolbar "Create" menu, fill in Task type, Template, Users, Location, Dates, Instructions, Comments
- Shell left navigation renders with all module nav items
- Shell toolbar shows logo, title, and profile menu
- Logout flow clears session and shows login button

SECURITY TESTS:
- CORS configuration: check if Access-Control-Allow-Origin reflects arbitrary origins with credentials
- Cookie security: idsrv.session missing HttpOnly, shib cookies missing Secure flag
- Browser storage: check localStorage and sessionStorage for tokens, credentials, API keys, PII, or other sensitive data
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
