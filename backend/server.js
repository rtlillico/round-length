// round-length/backend/server.js

'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { scheduleCron, runNightlyUpdate } = require('./cron/nightly');
const { applySchema } = require('./db/queries');

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

// Never let browsers cache API responses — chart data changes after a recompute
// and a stale cached response would show old/missing percentile bands.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
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

// Start the HTTP server immediately so a schema/DB hiccup (slow or unreachable
// DB) can never crash-loop or block the whole API. The migration is idempotent
// and runs in the background; it will re-run cleanly on the next boot.
app.listen(PORT, () => {
  console.log(`Round Length backend running on port ${PORT}`);
  scheduleCron();
});

applySchema()
  .then(() => console.log('Database schema applied'))
  .catch((err) => console.error('Failed to apply database schema (continuing):', err));
