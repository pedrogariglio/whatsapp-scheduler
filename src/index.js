require('dotenv').config();
const { client, getContacts } = require('./whatsapp');
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { startScheduler } = require('./scheduler');
const messagesRouter = require('./routes/messages');

const PORT = process.env.PORT || 3000;
const app = express();

// Load config
const configPath = path.join(__dirname, '..', 'config.json');
if (!fs.existsSync(configPath)) {
  fs.writeFileSync(configPath, JSON.stringify({ firstRun: true, auth: { username: '', password: '' } }, null, 2));
}

function getConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function saveConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// Middleware
app.use(express.json());
app.use(session({
  secret: 'wa-scheduler-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true },
}));

// Auth middleware
function requireAuth(req, res, next) {
  const config = getConfig();

  // First run — only allow setup routes
  if (config.firstRun) {
    const allowedPaths = ['/setup.html', '/auth/setup'];
    if (allowedPaths.includes(req.path)) return next();
    if (req.path === '/' || !req.path.startsWith('/api/')) {
      return res.redirect('/setup.html');
    }
    return res.status(403).json({ ok: false, error: 'Setup required' });
  }

  const publicPaths = ['/auth/login', '/login.html'];
  if (publicPaths.includes(req.path) || req.session.authenticated) {
    return next();
  }
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  res.redirect('/login.html');
}

app.use(requireAuth);
app.use(express.static(path.join(__dirname, '..', 'public')));

// Setup route — only works on first run
app.post('/auth/setup', (req, res) => {
  const config = getConfig();
  if (!config.firstRun) {
    return res.status(403).json({ ok: false, error: 'Setup already completed' });
  }

  const { username, password } = req.body;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ ok: false, error: 'El usuario debe tener al menos 3 caracteres' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ ok: false, error: 'La contrasena debe tener al menos 6 caracteres' });
  }

  saveConfig({ firstRun: false, auth: { username: username.trim(), password } });
  return res.json({ ok: true });
});

// Auth routes
app.post('/auth/login', (req, res) => {
  const config = getConfig();
  const { username, password } = req.body;
  if (username === config.auth.username && password === config.auth.password) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// Health check
app.get('/health', (req, res) => {
  const { isClientReady } = require('./whatsapp');
  res.json({
    ok: true,
    whatsappReady: isClientReady(),
    timestamp: new Date().toISOString(),
  });
});

// Contacts
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await getContacts();
    return res.json({ ok: true, count: contacts.length, contacts });
  } catch (error) {
    console.error('Error getting contacts:', error);
    return res.status(500).json({ ok: false, error: 'Error getting contacts' });
  }
});

// Messages API
app.use('/api/messages', messagesRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route not found' });
});

// Init
const { initDB } = require('./db');
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`   Health check: http://localhost:${PORT}/health\n`);
  });
  console.log('🌐 Inicializando cliente WhatsApp Web...');
  client.initialize();
  startScheduler();
}).catch(err => {
  console.error('❌ Error iniciando la base de datos:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n⛔ Cerrando servidor...');
  await client.destroy();
  process.exit(0);
});
