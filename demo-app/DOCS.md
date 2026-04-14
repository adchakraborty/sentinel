# VulnShop — Product Documentation

**Version:** 1.0 (internal demo)  
**Last updated:** April 2026  
**Maintainer:** Platform / Security Education

---

## 1. Application Overview

VulnShop is a small e-commerce-style demonstration storefront used for training, test automation, and security exercise scenarios. It provides product discovery, a simple sign-in flow, an operations console for user records, a document viewer for static assets, and a customer feedback channel.

The experience is intentionally lightweight: no payment processing, no inventory reservations, and no external integrations. All data lives in a single process-local database that is recreated when the service restarts.

---

## 2. Tech Stack

| Layer | Technology |
|--------|------------|
| Runtime | Node.js |
| HTTP framework | Express.js |
| Templates | EJS (server-rendered HTML) |
| Database | SQLite via `better-sqlite3` (in-memory database) |
| Request bodies | `application/x-www-form-urlencoded` and JSON (middleware enabled) |
| Static assets | Served from the `public/` directory |
| Session / identity hints | `cookie-parser`; authentication state carried in HTTP cookies |

The default listen port is **3001**, overridable with the `PORT` environment variable.

---

## 3. Routes & API Endpoints

### HTML Pages

All routes below are relative to the application root. Unless noted, responses are HTML from EJS views.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` | Home page with navigation to search, login, admin, file viewer, and feedback. |
| `GET` | `/search` | Product search. **Query:** `q` (optional string; empty means broad match behavior). **Output:** Search results page listing matching products; may include database error text if the query cannot be executed. |
| `GET` | `/login` | Renders the login form (no body). |
| `POST` | `/login` | **Body (form):** `username`, `password`. On success: sets auth cookies and redirects to `/admin`. On failure: re-renders login with an error message. |
| `GET` | `/admin` | Admin dashboard: user management table (id, username, role). Displays the current cookie-based display name when present. |
| `GET` | `/file` | Plain-text file viewer. **Query:** `name` (optional; defaults to `readme.txt`). **Output:** File contents as `text/plain`, or `404` with a short message if the file cannot be read. |
| `GET` | `/feedback` | Feedback page listing recent submissions and an entry form. |
| `POST` | `/feedback` | **Body (form):** `name`, `message`. Persists a row and re-renders the page with an updated list and a success indicator. |
| `GET` | `/redirect` | Redirects to the URL specified in the `url` query parameter. Used for external link tracking. |
| `GET` | `/logout` | Clears authentication cookies and redirects to `/`. |

### JSON API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/users` | Returns all user records as JSON. No authentication required. |
| `GET` | `/api/users/:id` | Returns a single user by ID. No authorization check — any user can access any record. |
| `PUT` | `/api/users/:id` | Updates a user record. **Body (JSON):** `username`, `role`, `email`. Accepts any fields including role escalation. |
| `GET` | `/api/products` | Returns products as JSON. **Query:** `category` (filter), `sort` (column name for ORDER BY). |
| `GET` | `/api/orders/:id` | Returns a single order by ID. No authorization — any user can view any order. |
| `POST` | `/api/orders` | Creates an order. **Body (JSON):** `user_id`, `product_id`, `quantity`. No auth required — can create orders for any user. |
| `GET` | `/api/preview` | URL preview/proxy. **Query:** `url` (the URL to fetch server-side). Returns the fetched content as JSON. |
| `GET` | `/api/export` | Exports products as CSV. **Query:** `filename` (sets the Content-Disposition header). |
| `GET` | `/api/debug` | Debug information endpoint. Returns server environment, Node.js version, memory usage, and database schema. |
| `POST` | `/api/validate-email` | Email validation. **Body (JSON):** `email`. Returns whether the email matches the validation regex. |
| `GET` | `/api/profile` | Returns user profile. Requires `Authorization: Bearer <JWT>` header. Decodes the JWT payload to look up the user. |

Cross-origin response headers are set globally to allow browser clients from any origin to call the API with common methods and headers (simplifies local tooling and demos).

The server also sets verbose `X-Powered-By` and `Server` headers that reveal the technology stack.

---

## 4. Authentication

Sign-in is **cookie-based**. Successful `POST /login` sets two non–HTTP-only cookies:

- **`auth_user`** — the authenticated username string.
- **`auth_role`** — the user’s role (`admin` or `user`).

`GET /logout` clears both cookies and returns the user to the home page.

A separate **`session_id`** cookie may be issued for anonymous visitors to support basic continuity across requests; it is not used as the primary authorization mechanism for admin features.

**Demo credentials (seed data):**

- `admin` / `admin` — role `admin`
- `user` / `user123` — role `user`

Passwords are verified with a direct lookup against the `users` table (username and password equality match).

---

## 5. Database Schema

All tables exist only in memory for the lifetime of the process.

### `users`

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER | Primary key |
| `username` | TEXT | Unique in seed data |
| `password` | TEXT | Stored and compared as plain text in this demo |
| `role` | TEXT | `admin`, `user`, or `guest` |
| `email` | TEXT | User email address |
| `api_key` | TEXT | Per-user API key (nullable) |

### `products`

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER | Primary key |
| `name` | TEXT | |
| `price` | REAL | |
| `description` | TEXT | |

Seed data includes three products (two “Widget” items and one “Gadget”).

### `feedback`

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER | Primary key, autoincrement |
| `name` | TEXT | Submitter-provided label |
| `message` | TEXT | Submitter-provided body |
| `created_at` | TEXT | ISO-8601 timestamp at insert time |

### `orders`

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER | Primary key, autoincrement |
| `user_id` | INTEGER | Foreign key to users |
| `product_id` | INTEGER | Foreign key to products |
| `quantity` | INTEGER | |
| `total` | REAL | Computed from product price * quantity |
| `status` | TEXT | `pending` or `completed` |
| `created_at` | TEXT | ISO-8601 timestamp |

---

## 6. Business Rules

- **Product search** matches against both `products.name` and `products.description` using substring matching. Matching is **case-insensitive** for typical ASCII input (SQLite `LIKE` semantics).
- **Search query echo:** The submitted query string is reflected on the results page for clarity.
- **Login:** There is no account lockout, CAPTCHA, or second factor; failed attempts return a generic invalid-credentials message. On success, the user's API key is also set as a cookie.
- **Admin dashboard** renders the **complete** `users` list (id, username, role) for visibility into registered identities.
- **Feedback:** `name` and `message` accept arbitrary length; there is no server-side truncation or minimum length requirement. The feedback page shows the **20 most recent** entries (newest first).
- **File viewer:** Content is read from the configured public content root and returned as plain text.
- **API users endpoint** returns full user objects including passwords and API keys. No authentication is required.
- **API orders** are accessible by ID without authorization — any visitor can view any order.
- **API preview** fetches any URL provided in the `url` parameter from the server side and returns the response body.
- **API debug** exposes server environment, Node.js version, memory usage, working directory, and database table names.
- **Redirect endpoint** redirects to any URL provided in the `url` parameter without validation.
- **API export** sets the `Content-Disposition` header using the user-provided `filename` parameter without sanitization.
- **API profile** accepts JWT tokens and decodes them without signature verification.
- **Error handler** returns detailed error information including the requested path and a list of all available routes.

---

## 7. Known Limitations

- **Login:** No rate limiting, throttling, or progressive backoff on authentication attempts.
- **File viewer:** Only files reachable under the application’s public content directory are intended to be served; error responses include the requested name for troubleshooting.
- **Availability:** In-memory SQLite means all feedback and session-adjacent data is lost on restart; there is no replication or backup in this build.
- **Transport:** Demo configuration does not assume TLS termination at the app layer.
- **CORS:** Wildcard origin is enabled for all responses, which is convenient for local experiments but is not representative of a hardened production API policy.
- **API authentication:** JSON API endpoints have no authentication or authorization checks.
- **Server headers:** Verbose `X-Powered-By` and `Server` headers reveal the technology stack.
- **Error handling:** The 404 handler returns a list of all available routes, which aids in route enumeration.
- **URL preview:** The `/api/preview` endpoint fetches arbitrary URLs from the server, including internal network addresses.

---

## 8. User Roles

| Role | Description |
|------|-------------|
| **admin** | Full access to seeded administrative identity; used for exercises involving elevated capability. |
| **user** | Standard storefront identity with default user role in seed data. |

Role values are stored in the database and copied into the `auth_role` cookie after a successful login. Downstream pages may use this value for display or future feature gating as the product evolves.

---

## Appendix: Local run

```bash
node server.js
```

Then open `http://localhost:3001` (or the host/port implied by your environment).

This document describes behavior as implemented in the reference demo application; behavior in forks or extended deployments may differ.
