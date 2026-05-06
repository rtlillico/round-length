// round-length/backend/routes/scenarios.js

'use strict';

const express = require('express');
const router = express.Router();
const {
  getNextShortCode,
  createScenario,
  getScenario,
  getScenariosForFarm,
  deleteScenario,
  getAllSILORows,
  getPercentiles,
  getDailyStateRange,
  getLatestDailyState,
  upsertPercentiles,
  upsertDailyStateBulk,
} = require('../db/queries');
const { processHistoricalData, calcProjectedRoundLength, dateToDayOfYear } = require('../lib/formula');

// GET /api/scenarios?farmId=1 — list all scenarios for a farm
router.get('/', async (req, res) => {
  const { farmId } = req.query;
  if (!farmId) return res.status(400).json({ error: 'farmId is required' });
  try {
    const scenarios = await getScenariosForFarm(farmId);
    // Attach today's state to each scenario
    const withState = await Promise.all(scenarios.map(async (s) => {
      const state = await getLatestDailyState(s.id);
      return { ...s, todayState: state };
    }));
    res.json(withState);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scenarios/:id — single scenario with today's state
router.get('/:id', async (req, res) => {
  try {
    const scenario = await getScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
    const state = await getLatestDailyState(scenario.id);
    res.json({ ...scenario, todayState: state });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scenarios — create scenario and compute percentiles
router.post('/', async (req, res) => {
  const { farmId, name, pastureKey, targetLeaves, soilType } = req.body;
  if (!farmId || !name || !pastureKey || !targetLeaves) {
    return res.status(400).json({ error: 'farmId, name, pastureKey and targetLeaves are required' });
  }

  try {
    const shortCode = await getNextShortCode(farmId);
    const scenario = await createScenario({ farmId, name, pastureKey, targetLeaves, shortCode, soilType });

    // Respond immediately
    res.status(201).json({ scenario, status: 'computing' });


    // Compute percentiles in background
    console.log(`[scenarios] Computing percentiles for scenario ${scenario.id}`);
    try {
      const allSILO = await getAllSILORows(farmId);
      const { dailySeries, percentiles } = processHistoricalData(
        allSILO,
        pastureKey,
        Number(targetLeaves),
        soilType || 'sandyLoam'
      );
      await upsertPercentiles(scenario.id, percentiles);

      // Save last 365 days of daily state for chart history
      if (dailySeries.length > 0) {
        const last365 = dailySeries.slice(-365).map(row => ({
          date:           row.date,
          tMean:          row.tMean,
          tempLAR:        row.tempLAR,
          actualLAR:      row.actualLAR,
          solarFactor:    row.solarFactor,
          radiation:      row.radiation,
          trueRound:      row.trueRound,
          moistureFactor: row.moistureFactor,
          soilWater:      row.soilWater,
          dataSource:     'silo',
        }));
        await upsertDailyStateBulk(scenario.id, last365);
      }
      console.log(`[scenarios] Percentiles computed for scenario ${scenario.id}`);
    } catch (err) {
      console.error(`[scenarios] Percentile computation failed for scenario ${scenario.id}:`, err.message);
    }
  } catch (err) {
    console.error('[scenarios] POST /api/scenarios error:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// DELETE /api/scenarios/:id
router.delete('/:id', async (req, res) => {
  try {
    await deleteScenario(req.params.id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scenarios/:id/chart — all data needed to render the chart
// Returns: past 12 months actual + all 365 percentile rows for historical band + projected future
router.get('/:id/chart', async (req, res) => {
  try {
    const scenario = await getScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

    // Past 6 months actual daily state
    const endDate   = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 6);
    const actual = await getDailyStateRange(
      scenario.id,
      startDate.toISOString().slice(0, 10),
      endDate.toISOString().slice(0, 10)
    );

    // Historical percentiles (all 365 day-of-year rows)
    const percentiles = await getPercentiles(scenario.id);

    // Build projected future round length (next 365 days using median LAR)
    // medianLARByDoy is indexed 0-based (doy-1)
    const medianLARByDoy = new Array(365).fill(0);
    for (const p of percentiles) {
      medianLARByDoy[p.day_of_year - 1] = Number(p.lar_p50) || 0;
    }
    const todayDoy = dateToDayOfYear(new Date()) - 1; // 0-based
    const projectedRound = calcProjectedRoundLength(
      medianLARByDoy,
      todayDoy,
      Number(scenario.target_leaves)
    );

    // Build projected daily LAR series for next 6 months (~180 days)
    const projectedSeries = [];
    for (let d = 0; d < 180; d++) {
      const date = new Date();
      date.setDate(date.getDate() + d);
      const doy = (todayDoy + d) % 365;
      projectedSeries.push({
        date: date.toISOString().slice(0, 10),
        larP10:   percentiles[doy]?.lar_p10,
        larP25:   percentiles[doy]?.lar_p25,
        larP50:   percentiles[doy]?.lar_p50,
        larP75:   percentiles[doy]?.lar_p75,
        larP90:   percentiles[doy]?.lar_p90,
        roundP10: percentiles[doy]?.round_p10,
        roundP25: percentiles[doy]?.round_p25,
        roundP50: percentiles[doy]?.round_p50,
        roundP75: percentiles[doy]?.round_p75,
        roundP90: percentiles[doy]?.round_p90,
        solarP10: percentiles[doy]?.solar_p10,
        solarP25: percentiles[doy]?.solar_p25,
        solarP50: percentiles[doy]?.solar_p50,
        solarP75: percentiles[doy]?.solar_p75,
        solarP90: percentiles[doy]?.solar_p90,
        moistureP10: percentiles[doy]?.moisture_p10,
        moistureP25: percentiles[doy]?.moisture_p25,
        moistureP50: percentiles[doy]?.moisture_p50,
        moistureP75: percentiles[doy]?.moisture_p75,
        moistureP90: percentiles[doy]?.moisture_p90,
      });
    }

    res.json({
      scenario,
      actual,          // past 12 months
      percentiles,     // historical band (all 365 doy rows)
      projected: {
        series: projectedSeries,
        roundLength: projectedRound,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scenarios/:id/status — check if percentiles are ready
router.get('/:id/status', async (req, res) => {
  try {
    const percentiles = await getPercentiles(req.params.id);
    res.json({ ready: percentiles.length === 365, rowCount: percentiles.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
