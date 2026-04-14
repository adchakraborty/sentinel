const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const cookieParser = require('cookie-parser');
const http = require('http');

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

// VULN: Verbose server header leaks technology stack
app.use((_req, res, next) => {
  res.setHeader('X-Powered-By', 'Express 4.18.2 / Node.js 20.11.0');
  res.setHeader('Server', 'VulnShop/1.0 (Ubuntu 22.04)');
  next();
});

let db;

function dbAll(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}

function dbRun(sql, params) {
  db.run(sql, params);
  return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] };
}

function dbExecRaw(sql) {
  try {
    const results = db.exec(sql);
    if (!results.length) return [];
    const cols = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
  } catch (e) {
    throw e;
  }
}

async function startServer() {
  const SQL = await initSqlJs();
  db = new SQL.Database();

  db.run(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT, role TEXT, email TEXT, api_key TEXT);
    INSERT INTO users VALUES (1, 'admin', 'admin', 'admin', 'admin@vulnshop.local', 'sk-admin-a1b2c3d4e5f6');
    INSERT INTO users VALUES (2, 'user', 'user123', 'user', 'user@vulnshop.local', 'sk-user-x9y8z7w6v5u4');
    INSERT INTO users VALUES (3, 'guest', 'guest', 'guest', 'guest@vulnshop.local', NULL);

    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL, description TEXT, category TEXT);
    INSERT INTO products VALUES (1, 'Widget A', 9.99,  'A fine widget', 'widgets');
    INSERT INTO products VALUES (2, 'Widget B', 19.99, 'A better widget', 'widgets');
    INSERT INTO products VALUES (3, 'Gadget X', 49.99, 'The ultimate gadget', 'gadgets');
    INSERT INTO products VALUES (4, 'Security Camera Pro', 199.99, 'HD surveillance camera with night vision', 'electronics');
    INSERT INTO products VALUES (5, 'Smart Lock v2', 89.99, 'Bluetooth-enabled door lock', 'electronics');

    CREATE TABLE feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, message TEXT, created_at TEXT);

    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, product_id INTEGER, quantity INTEGER, total REAL, status TEXT, created_at TEXT);
    INSERT INTO orders VALUES (1, 1, 1, 2, 19.98, 'completed', '2026-04-01T10:00:00Z');
    INSERT INTO orders VALUES (2, 2, 3, 1, 49.99, 'pending', '2026-04-10T14:30:00Z');

    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id INTEGER, data TEXT, created_at TEXT);
  `);

  // ── Routes ──

  app.get('/', (_req, res) => {
    res.render('index');
  });

  // VULN: SQL Injection + Reflected XSS
  app.get('/search', (req, res) => {
    const q = req.query.q || '';
    const sql = `SELECT * FROM products WHERE name LIKE '%${q}%' OR description LIKE '%${q}%'`;
    let results = [];
    let error = null;
    try {
      results = dbExecRaw(sql);
    } catch (e) {
      error = e.message;
    }
    res.render('search', { query: q, results, error });
  });

  // VULN: No rate limiting, accepts weak credentials
  app.get('/login', (_req, res) => {
    res.render('login', { error: null });
  });

  app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = dbGet('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (user) {
      res.cookie('auth_user', user.username);
      res.cookie('auth_role', user.role);
      if (user.api_key) res.cookie('api_key', user.api_key, { httpOnly: false });
      return res.redirect('/admin');
    }
    res.render('login', { error: 'Invalid credentials' });
  });

  // VULN: No authentication check
  app.get('/admin', (req, res) => {
    const users = dbAll('SELECT id, username, role FROM users');
    res.render('admin', { users, user: req.cookies.auth_user || 'anonymous' });
  });

  // VULN: Path traversal
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

  // VULN: No CSRF token, no input validation
  app.get('/feedback', (_req, res) => {
    const entries = dbAll('SELECT * FROM feedback ORDER BY id DESC LIMIT 20');
    res.render('feedback', { entries, success: false });
  });

  app.post('/feedback', (req, res) => {
    const { name, message } = req.body;
    dbRun('INSERT INTO feedback (name, message, created_at) VALUES (?, ?, ?)', [
      name, message, new Date().toISOString(),
    ]);
    const entries = dbAll('SELECT * FROM feedback ORDER BY id DESC LIMIT 20');
    res.render('feedback', { entries, success: true });
  });

  // VULN: API returns full user objects including passwords and API keys
  app.get('/api/users', (_req, res) => {
    const users = dbAll('SELECT * FROM users');
    res.json({ users, total: users.length });
  });

  // VULN: IDOR
  app.get('/api/users/:id', (req, res) => {
    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  });

  // VULN: Mass assignment
  app.put('/api/users/:id', (req, res) => {
    const { username, role, email } = req.body;
    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });
    dbRun('UPDATE users SET username = ?, role = ?, email = ? WHERE id = ?', [
      username || user.username, role || user.role, email || user.email, req.params.id,
    ]);
    res.json({ success: true, message: 'User updated' });
  });

  // VULN: SQL injection in product search API
  app.get('/api/products', (req, res) => {
    const category = req.query.category || '';
    const sort = req.query.sort || 'name';
    let sql = 'SELECT * FROM products';
    if (category) sql += ` WHERE category = '${category}'`;
    sql += ` ORDER BY ${sort}`;
    try {
      const products = dbExecRaw(sql);
      res.json({ products, total: products.length });
    } catch (e) {
      res.status(500).json({ error: e.message, query: sql });
    }
  });

  // VULN: IDOR on orders
  app.get('/api/orders/:id', (req, res) => {
    const order = dbGet('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  });

  // VULN: No auth, allows creating orders for any user
  app.post('/api/orders', (req, res) => {
    const { user_id, product_id, quantity } = req.body;
    const product = dbGet('SELECT * FROM products WHERE id = ?', [product_id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const total = product.price * (quantity || 1);
    const result = dbRun('INSERT INTO orders (user_id, product_id, quantity, total, status, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
      user_id, product_id, quantity || 1, total, 'pending', new Date().toISOString(),
    ]);
    res.json({ success: true, orderId: result.lastInsertRowid, total });
  });

  // VULN: Open redirect
  app.get('/redirect', (req, res) => {
    const url = req.query.url || '/';
    res.redirect(url);
  });

  // VULN: SSRF
  app.get('/api/preview', (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: 'url parameter required' });
    try {
      new URL(url);
      http.get(url, { timeout: 5000 }, (proxyRes) => {
        let data = '';
        proxyRes.on('data', (chunk) => { data += chunk; });
        proxyRes.on('end', () => {
          res.json({ url, status: proxyRes.statusCode, body: data.substring(0, 2000), headers: proxyRes.headers });
        });
      }).on('error', (e) => {
        res.status(500).json({ error: `Fetch failed: ${e.message}`, url });
      });
    } catch (e) {
      res.status(400).json({ error: `Invalid URL: ${e.message}` });
    }
  });

  // VULN: Header injection
  app.get('/api/export', (req, res) => {
    const filename = req.query.filename || 'export.csv';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/csv');
    const products = dbAll('SELECT * FROM products');
    const csv = ['id,name,price,description,category']
      .concat(products.map(p => `${p.id},"${p.name}",${p.price},"${p.description}","${p.category}"`))
      .join('\n');
    res.send(csv);
  });

  // VULN: Debug/info endpoint leaks environment
  app.get('/api/debug', (_req, res) => {
    res.json({
      env: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      node: process.version,
      platform: process.platform,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cwd: process.cwd(),
      dbTables: dbExecRaw("SELECT name FROM sqlite_master WHERE type='table'"),
    });
  });

  // VULN: Regex DoS
  app.post('/api/validate-email', (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });
    const emailRegex = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
    const valid = emailRegex.test(email);
    res.json({ email, valid });
  });

  // VULN: JWT secret exposed, accepts unsigned tokens
  app.get('/api/profile', (req, res) => {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization header required', hint: 'Use Bearer <token>' });
    }
    const token = authHeader.slice(7);
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        const user = dbGet('SELECT id, username, role, email FROM users WHERE username = ?', [payload.user || payload.sub]);
        if (user) return res.json(user);
      }
    } catch {}
    res.status(401).json({ error: 'Invalid token' });
  });

  app.get('/logout', (_req, res) => {
    res.clearCookie('auth_user');
    res.clearCookie('auth_role');
    res.clearCookie('api_key');
    res.redirect('/');
  });

  // VULN: Catch-all returns detailed error with stack trace
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.path,
      method: req.method,
      message: `Route ${req.method} ${req.path} does not exist`,
      availableRoutes: [
        'GET /', 'GET /search', 'GET /login', 'POST /login', 'GET /admin',
        'GET /file', 'GET /feedback', 'POST /feedback', 'GET /redirect',
        'GET /api/users', 'GET /api/users/:id', 'PUT /api/users/:id',
        'GET /api/products', 'GET /api/orders/:id', 'POST /api/orders',
        'GET /api/preview', 'GET /api/export', 'GET /api/debug',
        'POST /api/validate-email', 'GET /api/profile',
      ],
    });
  });

  const server = app.listen(PORT, () => {
    console.log(`SENTINEL Demo App (VulnShop) running on http://localhost:${PORT}`);
    console.log('WARNING: This app is intentionally vulnerable. Do NOT expose to the internet.');
  });

  process.on('SIGTERM', () => server.close());
  process.on('SIGINT', () => server.close());
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
