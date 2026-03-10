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
  console.error('❌ config.json not found. Copy config.example.json and set your credentials.');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// Middleware
app.use(express.json());
app.use(session({
  secret: 'wa-scheduler-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true },
}));

// Auth middleware — protects all routes except /auth and /login.html
function requireAuth(req, res, next) {
  const publicPaths = ['/auth/login', '/login.html'];
  if (publicPaths.includes(req.path) || req.session.authenticated) {
    return next();
  }
  // API requests get 401 instead of redirect
  if (req.path.startsWith('/api/') || req.path.startsWith('/health')) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  res.redirect('/login.html');
}

app.use(requireAuth);
app.use(express.static(path.join(__dirname, '..', 'public')));

// Auth routes
app.post('/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (
    username === config.auth.username &&
    password === config.auth.password
  ) {
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
