// round-length/backend/routes/farms.js

'use strict';

const express = require('express');
const router = express.Router();
const { createFarm, getFarm, getAllFarms, updateFarm } = require('../db/queries');
const { fetchSILO, yesterday, SILO_START } = require('../silo');
const { insertSILORows, getAllSILORows, getScenariosForFarm } = require('../db/queries');
const { updateScenario } = require('../cron/nightly');
const { farmProgress } = require('../lib/progress');

// GET /api/farms — list all farms
router.get('/', async (req, res) => {
  try {
    const farms = await getAllFarms();
    res.json(farms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/farms/:id — get single farm
router.get('/:id', async (req, res) => {
  try {
    const farm = await getFarm(req.params.id);
    if (!farm) return res.status(404).json({ error: 'Farm not found' });
    res.json(farm);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/farms — create farm and trigger full SILO download
router.post('/', async (req, res) => {
  const { name, lat, lon, siloEmail } = req.body;
  if (!name || !lat || !lon || !siloEmail) {
    return res.status(400).json({ error: 'name, lat, lon and siloEmail are required' });
  }

  try {
    // Create the farm record
    const farm = await createFarm({ name, lat, lon, siloEmail });

    // Respond immediately so the client knows the farm was created
    res.status(201).json({ farm, status: 'downloading' });

    // Download all SILO data in background (this takes 1-3 minutes)
    console.log(`[farms] Starting full SILO download for farm ${farm.id}`);
    farmProgress.set(farm.id, { phase: 'downloading', pct: 0 });
    try {
      const siloRows = await fetchSILO(lat, lon, SILO_START, yesterday(), siloEmail);
      console.log(`[farms] SILO download complete for farm ${farm.id}: ${siloRows.length} rows`);

      // Insert in batches — maps to 5–80% of overall progress
      const BATCH = 500;
      for (let i = 0; i < siloRows.length; i += BATCH) {
        await insertSILORows(farm.id, siloRows.slice(i, i + BATCH));
        const insertPct = Math.min(1, (i + BATCH) / siloRows.length);
        farmProgress.set(farm.id, { phase: 'inserting', pct: Math.round(5 + insertPct * 75) });
      }

      // Computing — maps to 80–100% of overall progress
      const scenarios = await getScenariosForFarm(farm.id);
      const allSILO = await getAllSILORows(farm.id);
      for (let i = 0; i < scenarios.length; i++) {
        farmProgress.set(farm.id, { phase: 'computing', pct: Math.round(80 + (i / scenarios.length) * 20) });
        await updateScenario(scenarios[i], allSILO);
      }
      farmProgress.delete(farm.id);
    } catch (err) {
      farmProgress.set(farm.id, { phase: 'error', error: err.message });
      console.error(`[farms] SILO download failed for farm ${farm.id}:`, err.message);
    }
  } catch (err) {
    console.error('[farms] POST /api/farms error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// PATCH /api/farms/:id — update farm details
router.patch('/:id', async (req, res) => {
  try {
    const farm = await updateFarm(req.params.id, req.body);
    if (!farm) return res.status(404).json({ error: 'Farm not found' });
    res.json(farm);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/farms/:id/status — check SILO download progress and readiness
router.get('/:id/status', async (req, res) => {
  try {
    const { getLatestSILODate } = require('../db/queries');
    const latest = await getLatestSILODate(req.params.id);
    const progress = farmProgress.get(Number(req.params.id)) || null;
    res.json({ latestSILODate: latest, ready: !!latest, downloadProgress: progress });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
