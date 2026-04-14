const express = require('express');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// VULN: Wildcard CORS on every response
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  next();
});

// VULN: Session cookie with SameSite=None and no Secure flag
app.use((req, res, next) => {
  if (!req.cookies.session_id) {
    res.cookie('session_id', Math.random().toString(36).slice(2), {
      httpOnly: false,
      sameSite: 'None',
      secure: false,
    });
  }
  next();
});

// ── In-memory SQLite with seed data ──
const db = new Database(':memory:');
db.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT);
  INSERT INTO users VALUES (1, 'admin', 'admin', 'admin');
  INSERT INTO users VALUES (2, 'user', 'user123', 'user');

  CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL, description TEXT);
  INSERT INTO products VALUES (1, 'Widget A', 9.99,  'A fine widget');
  INSERT INTO products VALUES (2, 'Widget B', 19.99, 'A better widget');
  INSERT INTO products VALUES (3, 'Gadget X', 49.99, 'The ultimate gadget');

  CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, message TEXT, created_at TEXT);
`);

// ── Routes ──

app.get('/', (_req, res) => {
  res.render('index');
});

// VULN: SQL Injection + Reflected XSS
app.get('/search', (req, res) => {
  const q = req.query.q || '';
  // VULN: String concatenation in SQL query
  const sql = `SELECT * FROM products WHERE name LIKE '%${q}%' OR description LIKE '%${q}%'`;
  let results = [];
  let error = null;
  try {
    results = db.prepare(sql).all();
  } catch (e) {
    error = e.message;
  }
  // VULN: Unescaped query echoed back into HTML
  res.render('search', { query: q, results, error });
});

// VULN: No rate limiting, accepts weak credentials
app.get('/login', (_req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
  if (user) {
    res.cookie('auth_user', user.username);
    res.cookie('auth_role', user.role);
    return res.redirect('/admin');
  }
  res.render('login', { error: 'Invalid credentials' });
});

// VULN: No authentication check — anyone can access
app.get('/admin', (req, res) => {
  const users = db.prepare('SELECT id, username, role FROM users').all();
  res.render('admin', { users, user: req.cookies.auth_user || 'anonymous' });
});

// VULN: Path traversal — reads arbitrary files
app.get('/file', (req, res) => {
  const name = req.query.name || 'readme.txt';
  const filePath = path.join(__dirname, 'public', name);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    res.type('text/plain').send(content);
  } catch (e) {
    res.status(404).send(`File not found: ${name}`);
  }
});

// VULN: No CSRF token, no input validation/length limits
app.get('/feedback', (_req, res) => {
  const entries = db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 20').all();
  res.render('feedback', { entries, success: false });
});

app.post('/feedback', (req, res) => {
  const { name, message } = req.body;
  db.prepare('INSERT INTO feedback (name, message, created_at) VALUES (?, ?, ?)').run(
    name, message, new Date().toISOString()
  );
  const entries = db.prepare('SELECT * FROM feedback ORDER BY id DESC LIMIT 20').all();
  res.render('feedback', { entries, success: true });
});

app.get('/logout', (_req, res) => {
  res.clearCookie('auth_user');
  res.clearCookie('auth_role');
  res.redirect('/');
});

const server = app.listen(PORT, () => {
  console.log(`NEMESIS Demo App running on http://localhost:${PORT}`);
  console.log('WARNING: This app is intentionally vulnerable. Do NOT expose to the internet.');
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
