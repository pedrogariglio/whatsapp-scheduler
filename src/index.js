require('dotenv').config();

const { client, getContacts } = require('./whatsapp');
const express = require('express');
const path = require('path');
const { startScheduler } = require('./scheduler');
const messagesRouter = require('./routes/messages');

const PORT = process.env.PORT || 3000;

const app = express();

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Ruta de salud — útil para verificar que el servidor corre
app.get('/health', (req, res) => {
  const { isClientReady } = require('./whatsapp');
  res.json({
    ok: true,
    whatsappReady: isClientReady(),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/contacts — Lista de contactos para el buscador
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await getContacts();
    return res.json({ ok: true, count: contacts.length, contacts });
  } catch (error) {
    console.error('Error obteniendo contactos:', error);
    return res.status(500).json({ ok: false, error: 'Error al obtener contactos' });
  }
});

// Rutas de la API
app.use('/api/messages', messagesRouter);

// Manejador de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});


// Inicializar la base de datos y el servidor

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

// Manejo limpio de cierre (Ctrl+C en Windows)
process.on('SIGINT', async () => {
  console.log('\n⛔ Cerrando servidor...');
  await client.destroy();
  process.exit(0);
});