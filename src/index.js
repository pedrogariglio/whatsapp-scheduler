require('dotenv').config();
const { client, getContacts } = require('./whatsapp');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { startScheduler } = require('./scheduler');
const messagesRouter = require('./routes/messages');
const { hashPassword, verifyPassword } = require('./auth');
const { ensureConfig, getConfig, saveConfig, hasConfiguredAdmin } = require('./config');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const SESSION_SECRET = process.env.SESSION_SECRET;
const app = express();

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET debe existir y tener al menos 32 caracteres.');
  process.exit(1);
}

ensureConfig();

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Middleware
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(session({
  name: 'wa.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.COOKIE_SECURE === 'true',
  },
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiados intentos. Intenta de nuevo mas tarde.' },
});

function isLocalRequest(req) {
  const remoteAddress = req.ip || req.socket.remoteAddress || '';
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}

// Auth middleware
function requireAuth(req, res, next) {
  const config = getConfig();

  if (!hasConfiguredAdmin(config)) {
    const allowLocalWebSetup = process.env.ALLOW_LOCAL_WEB_SETUP === 'true';
    const allowedPaths = ['/setup.html', '/auth/setup'];

    if (allowLocalWebSetup && isLocalRequest(req) && allowedPaths.includes(req.path)) {
      return next();
    }

    if (req.path === '/health') {
      return res.status(503).json({ ok: false, error: 'Admin setup required' });
    }

    if (req.path.startsWith('/api/')) {
      return res.status(503).json({ ok: false, error: 'Admin setup required. Run npm run setup-admin on the server.' });
    }

    return res.status(503).send('Admin setup required. Run "npm run setup-admin" on the server.');
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

// Setup route — disabled by default and only allowed from loopback
app.post('/auth/setup', authLimiter, (req, res) => {
  if (process.env.ALLOW_LOCAL_WEB_SETUP !== 'true' || !isLocalRequest(req)) {
    return res.status(403).json({ ok: false, error: 'Web setup disabled' });
  }

  const config = getConfig();
  if (hasConfiguredAdmin(config)) {
    return res.status(403).json({ ok: false, error: 'Setup already completed' });
  }

  const { username, password } = req.body;
  if (!username || username.trim().length < 3) {
    return res.status(400).json({ ok: false, error: 'El usuario debe tener al menos 3 caracteres' });
  }
  if (!password || password.length < 10) {
    return res.status(400).json({ ok: false, error: 'La contrasena debe tener al menos 10 caracteres' });
  }

  saveConfig({
    firstRun: false,
    auth: {
      username: username.trim(),
      passwordHash: hashPassword(password),
    },
  });
  return res.json({ ok: true });
});

// Auth routes
app.post('/auth/login', authLimiter, (req, res, next) => {
  const config = getConfig();
  const { username, password } = req.body;
  const isValidUser = username === config.auth.username;
  const isValidPassword = verifyPassword(password, config.auth.passwordHash);

  if (isValidUser && isValidPassword) {
    return req.session.regenerate((error) => {
      if (error) return next(error);
      req.session.authenticated = true;
      return res.json({ ok: true });
    });
  }

  return res.status(401).json({ ok: false, error: 'Invalid credentials' });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('wa.sid');
    res.json({ ok: true });
  });
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
  app.listen(PORT, HOST, () => {
    console.log(`\n🚀 Servidor corriendo en http://${HOST}:${PORT}`);
    console.log(`   Health check: http://${HOST}:${PORT}/health\n`);
  });
  console.log('🌐 Inicializando cliente WhatsApp Web...');
  const { initializeClient } = require('./whatsapp');
  initializeClient();
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
