// round-length/backend/server.js

'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { scheduleCron, runNightlyUpdate } = require('./cron/nightly');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.use('/api/farms',     require('./routes/farms'));
app.use('/api/scenarios', require('./routes/scenarios'));

// Manual trigger for nightly update (useful for testing)
app.post('/api/admin/run-nightly', async (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json({ message: 'Nightly update started' });
  runNightlyUpdate().catch(console.error);
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Round Length backend running on port ${PORT}`);
  scheduleCron();
});
