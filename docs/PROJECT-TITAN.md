# Project Titan — Product Documentation

**Version:** 7.0.0  
**Last updated:** April 2026  
**Target URL:** https://project-titan.pc.k8s.hyland.io/home

---

## 1. Application Overview

Project Titan is a Hyland enterprise document management web application built on Angular 19. It provides document search, workflow management, folder browsing, task management, document capture, and capture & indexing capabilities. The application connects to a Hyland Integration Server backend for all data operations.

The application uses the Hyland UI Shell framework (`@hyland/ui-shell`) for its overall layout, navigation, theming, and authentication. Authentication is handled via OIDC (OpenID Connect) through a Hyland Identity Provider (IDP).

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend framework | Angular 19 |
| UI components | Angular Material, Ignite UI Angular |
| Shell / layout | Hyland UI Shell (`@hyland/ui-shell`) |
| State management | Akita (`@datorama/akita`) |
| i18n | Transloco (`@jsverse/transloco`) |
| Authentication | angular-oauth2-oidc + HyAuthService (OIDC/OAuth2) |
| Backend API | Hyland Integration Server (REST) |
| E2E testing | Cypress |
| Build | Angular CLI with `@hyland/dev-kit` |

---

## 3. Authentication

### Login Flow

Authentication uses **OIDC Authorization Code flow** with an external Identity Provider:

1. User navigates to `/home` and sees the **Login** button (a `mat-stroked-button` with text from translation key `home.login`)
2. Clicking **Login** triggers `HyAuthService.login()` which redirects the browser to the Hyland IDP
3. On the IDP page, user enters **username** and **password** in the IDP login form
4. If this is the first login or consent has expired, an **OAuth consent page** appears — user must click **Accept/Allow**
5. IDP redirects back to the app at `/view/authentication-confirmation`
6. The app exchanges the authorization code for tokens and establishes an Integration Server session via `GET v1/sso/token/login/{bearerLoginProfileName}` with the access token

### IDP Configuration

| Setting | Value |
|---------|-------|
| Issuer | `https://hyland-idp-v3.csfservices.onbase.net/identityprovider` |
| Client ID | `titan-app` |
| Scope | `openid profile profile.onbase` |
| Redirect URI | `{origin}/view/authentication-confirmation` |
| Post-logout redirect | `{origin}/home` |

### Test Credentials

| Username | Password |
|----------|----------|
| `test2` | `ImageNow!ImageNow!` |

### Logout

- Route: `/logout`
- Behavior: Calls `HyAuthService.logout()` if access token exists, otherwise deletes Integration Server connection and navigates to `/home`

---

## 4. Application Routes

### Public Routes (no auth required)

| Path | Description |
|------|-------------|
| `/home` | Landing page — shows Login button when unauthenticated, module tiles when authenticated |

### Protected Routes (auth required, guarded by `canActivateAuthGuard`)

| Path | Module | Description |
|------|--------|-------------|
| `/documents` | Documents | Document search with views |
| `/documents/view/:viewId` | Documents | Specific document search view |
| `/documents/view/:viewId/document/:documentId` | Documents | Document viewer |
| `/document/:documentId` | Documents | Quick access to a specific document |
| `/workflow` | Workflow | Workflow item search |
| `/workflow/view/:viewId` | Workflow | Specific workflow view |
| `/workflow/view/:viewId/item/:workflowItemId` | Workflow | Workflow item viewer |
| `/folders` | Folders | Folder search |
| `/folders/view/:viewId` | Folders | Specific folder search view |
| `/folder/:folderId` | Folders | Quick access to a specific folder |
| `/tasks` | Tasks | Task search |
| `/tasks/view/:viewId` | Tasks | Specific task view |
| `/tasks/view/:viewId/task/:taskId` | Tasks | Task viewer |
| `/capture` | Capture | Document capture (scan/file upload) |
| `/captureindexing` | Capture & Indexing | Capture and indexing workflow |
| `/captureindexing/view/:viewId` | Capture & Indexing | Specific capture indexing view |
| `/print/document/:documentId` | Print | Document printing |
| `/logout` | Logout | Logout and session cleanup |
| `**` | Error | Unknown URLs show error page |

---

## 5. Page Descriptions

### 5.1 Home Page (`/home`)

**Unauthenticated state:**
- Displays application logo (theme-dependent: light or dark mode)
- Shows application title ("Titan") from config
- Shows subtitle ("click login to get started")
- **Login button**: `mat-stroked-button` with primary color, triggers OIDC login flow
- Shows a spinner inside the button while login is in progress

**Authenticated state:**
- Displays a grid of **module tiles** (Material cards with icons and labels)
- Each tile links to a feature module
- Tiles are config-driven via `displayModules` in `app.config.json`
- Available tiles (when all enabled): Capture, Capture & Indexing, Documents, Folders, Tasks, Workflow
- Capture & Indexing tile is hidden on mobile devices

### 5.2 Document Search (`/documents`)

- Split-pane layout using `angular-split`
- Left pane: View list (`ti-view-list`) — user selects a saved search view
- Right pane: Search results displayed in a data grid
- Toolbar with actions when a view is selected
- On desktop: shows a billboard/placeholder when no view is selected
- On mobile: uses modal `hy-shell-view` with back navigation

### 5.3 Document Viewer (`/documents/view/:viewId/document/:documentId`)

- Full document viewer with:
  - Page viewer (supports images, PDFs, text, audio, video)
  - Properties pane (name, location, keys, type, notes, custom properties, page properties)
  - Forms pane (optional, can be removed via config)
  - Related documents pane
  - Related tasks pane
  - Annotations support
  - Dirty document guard (warns on unsaved changes)

### 5.4 Workflow (`/workflow`)

- Similar split-pane layout to document search
- View list for workflow queues
- Workflow item viewer with toolbar actions
- Route actions for workflow operations

### 5.5 Folder Search (`/folders`)

- Split-pane layout
- Folder search views
- Folder viewer with properties, related folders, related tasks
- Page label editing support

### 5.6 Task Search (`/tasks`)

- Split-pane layout
- Task search views
- Task viewer with properties

### 5.7 Capture (`/capture`)

- Document capture interface
- Supports scanner source and file source
- Profile-based capture with source mapping (regex patterns)
- Autocapture guard

### 5.8 Capture & Indexing (`/captureindexing`)

- Workflow-based document indexing
- Batch routing and submission via server actions
- Document type list with application plans
- Lookup-based field population (patient, encounter, order lookups)
- Dependent property updates
- Barcode document split mode
- Validation rules per workflow queue
- Property visibility settings per queue (enabled/disabled/hidden)

---

## 6. Shell / Navigation

The application uses `hy-shell` (Hyland UI Shell) which provides:

- **Top toolbar**: Application title, logo (theme-dependent), help link
- **Left navigation** (`hy-shell-nav`): Visible when authenticated and not on small form factor
  - One nav item per enabled module with icon and translated name
  - Links to each module's base route
- **Keyboard shortcuts**: Configurable shortcut groups via `TiKeyboardShortcutService`
- **Settings**: Shell settings component (`ti-app-shell-settings`)

---

## 7. Backend API

### Integration Server Client

All API calls go through `IntegrationServerClient` which:
- Uses base URL from config: `/integrationserver`
- Appends query params: `extenderType=114`, `cookieApplicationId`
- Sends CSRF token as `X-IntegrationServer-{applicationId}-CSRFToken` header
- Uses `withCredentials: true` for cookie-based sessions

### Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `v2/connection` | Verify session / get user info |
| `GET` | `v1/sso/token/login/{profile}` | Exchange bearer token for IS session |
| `DELETE` | `v1/connection` | Tear down session |

### Application Settings

| Setting | Value |
|---------|-------|
| Application ID | `titan` |
| Bearer login profile | `testbearerv3` |
| Path delimiter | `\` |
| Inactivity timeout | 30 minutes |

---

## 8. Configuration

### Display Modules (enabled features)

| Module ID | Enabled |
|-----------|---------|
| Capture | Yes |
| CaptureIndexing | Yes |
| Documents | Yes |
| Folders | Yes |
| Tasks | Yes |
| Workflow | Yes |

### Document Viewer Settings

| Setting | Value |
|---------|-------|
| Remove forms pane | Yes |
| Remove properties pane | No |
| Remove related documents pane | No |
| Remove related tasks pane | No |
| Use native PDF viewer | No |

### Search Settings

| Setting | Value |
|---------|-------|
| Full text search | Disabled |
| VSL extended operators | Disabled |
| VSL any key condition | Enabled |

---

## 9. Supported File Types

### Audio
- MP3 (`audio/mp3`), WAV (`audio/wav`)

### Video
- MP4 (`video/mp4`), WebM (`video/webm`), QuickTime/MOV (`video/quicktime`)

### Text/Document
- CSV, DOC, DOCX, EML, HTM, HTML, INI, LOG, MSG, ODT, PDF, PPT, PPTX, RTF, TXT, WPD, WPS, XLS, XLSX, XML

---

## 10. Key UI Elements for Testing

### Home Page (Unauthenticated)
- Login button: `button[mat-stroked-button]` with text from `home.login` translation
- App logo: `img` element with alt text from `home.logo-alt-text` translation
- App title: `h1.application-title`
- Subtitle: `p.hy-text-subhead`

### Home Page (Authenticated)
- Module tiles: `mat-card[appearance="outlined"]` inside `a[routerLink]`
- Each tile has `mat-icon` and module name text

### Shell Navigation
- Shell: `hy-shell` with `homeRoute="/home"`
- Nav items: `hy-shell-nav-item` with icon and translated name

### Search Pages (Documents, Folders, Workflow, Tasks)
- View list: `ti-view-list` component
- Toolbar: `ti-toolbar` component
- Split pane: `as-split` / `as-split-area` (angular-split)

---

## 11. Business Rules

- **Session timeout**: 30-minute inactivity timeout
- **Module visibility**: Controlled by `displayModules` config — each module can be enabled/disabled
- **Mobile restrictions**: Capture & Indexing tile hidden on mobile devices
- **Dirty document guard**: Warns users about unsaved changes when navigating away from document viewer
- **Autocapture guard**: Controls capture workflow navigation
- **Out of office**: Delegate support enabled
- **Document printing**: Letter page size, cover page enabled, annotations enabled
- **Batch operations**: Page deletion requires confirmation

---

## 12. Known Constraints

- Application requires HTTPS (configured with `requireHttps: true` in auth config, though `strictDiscoveryDocumentValidation` is false)
- IDP login is external — the login form is NOT on the Titan app domain
- Integration Server session is separate from OIDC session — both must be active for "authenticated" state
- CSRF protection is active on Integration Server API calls
- Cookie-based sessions with `withCredentials: true`

---

## 13. Functional Operations (User Actions)

### 13.1 Create Document

- **Where:** Document viewer or Folder viewer toolbar → **Create** menu (plus icon + chevron)
- **Trigger:** Button `#btn-create-control-actions` opens menu → click `#btn-create-document-action`
- **Dialog:** Document action dialog with fields: application plan, document properties, optional page range, version control, send to workflow queue, shortcut, submit for indexing
- **Also via:** Capture module (`/capture`) — acquire pages then Save

### 13.2 Create Folder

- **Where:** Same **Create** menu as documents in document viewer or folder viewer toolbar
- **Trigger:** `#btn-create-folder-action` in the Create menu
- **Dialog:** Folder action dialog with fields: application plan, folder properties, optional send to workflow queue + queue picker, create shortcut section (checkbox + path selector)

### 13.3 Create Task

- **Where:** Document viewer and Folder viewer toolbars
- **Trigger:** Icon button with `tasks` icon, tooltip `titan-lib.toolbar-actions.create-tasks.title`
- **Dialog fields:** Task type (required), Task template (required), Location (autosuggest), Users/groups assignment, Start date (required), Due date, Expedite switch, Instructions (max 512), Comments (max 512)

### 13.4 Capture / Scan Document

- **Route:** `/capture`
- **Flow:** Choose capture profile → click **Capture** button → pages are acquired from scanner or file source → edit properties → click **Save** to complete
- **Toolbar actions:** Capture, Save (complete capture), Reset, Thumbnails toggle, Properties toggle, Source settings, Link document

### 13.5 Search (Documents, Folders, Tasks, Workflow)

- **Routes:** `/documents`, `/folders`, `/tasks`, `/workflow`
- **Flow:** Select a saved view from the view list → constraints are loaded → optionally edit constraints → click **Search** button
- **Constraint editor:** Constraint type, Field, Property (for composite), List, Operator, Value
- **Search button:** `ti-search-container__submit-btn`
- **Additional:** Column manager, view filter, group-by, find-in-grid, restore view

### 13.6 Workflow Actions

- **Where:** Document viewer, Folder viewer, Workflow item viewer toolbars
- **Trigger:** `workflow-actions-btn` (archive icon + chevron)
- **Available actions:**
  - Add to workflow
  - Open in workflow
  - Route upstream / Route back / Route forward / Route anywhere
  - Open next workflow item
  - Set status (submenu of statuses)
  - Set priority
  - Archive item (opens dialog)
  - Remove from workflow
  - Workflow history
  - Recently routed items

### 13.7 Document Viewer Actions

- **Route:** `/documents/view/:viewId/document/:documentId`
- **Toolbar (left, priority order):** Save, Create task, Create (new doc/folder/shortcuts), Annotation menu, Redaction menu, Add page, Download, Export PDF, Print, Export email, Digital signature menu, Copy document, Retention holds, Version control menu, Workflow menu
- **Toolbar (right):** Thumbnails, Related documents, Related tasks, Properties, Full-text search toggle

### 13.8 Folder Viewer Actions

- **Route:** `/folders/view/:viewId` or `/folder/:folderId`
- **Toolbar:** Save, Create task, Create, Download, Export PDF, Print, Email, Export grid, Retention holds, Version control, Copy, Move, Delete, Merge documents, Workflow
- **Right side:** Related folders, Related tasks, Properties

### 13.9 Task Actions

- **Route:** `/tasks/view/:viewId/task/:taskId`
- **Buttons:** Return (undo icon, hidden for approval tasks), Complete (circle_check icon), Skip (redo icon)

---

## Appendix: How to Access

1. Navigate to `https://project-titan.pc.k8s.hyland.io/home`
2. Click the **Login** button
3. On the IDP page, enter credentials: `test2` / `ImageNow!ImageNow!`
4. Accept the OAuth consent if prompted
5. You will be redirected back to the home page with module tiles visible
