require('dotenv').config();

const express = require('express');
const path = require('path');
const { client } = require('./whatsapp');
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

// Rutas de la API
app.use('/api/messages', messagesRouter);

// Manejador de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// Arranque
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/health\n`);
});

// Inicializa WhatsApp Web (abre Chromium en background)
console.log('🌐 Inicializando cliente WhatsApp Web...');
client.initialize();

// Inicia el scheduler de envíos
startScheduler();

// Manejo limpio de cierre (Ctrl+C en Windows)
process.on('SIGINT', async () => {
  console.log('\n⛔ Cerrando servidor...');
  await client.destroy();
  process.exit(0);
});