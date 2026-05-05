// round-length/backend/cron/nightly.js
// Nightly cron job — runs at 2am AEST every night.
// Fetches yesterday's SILO data for every farm and updates all scenarios.

'use strict';

const cron = require('node-cron');
const { fetchSILO, yesterday, formatSILODate, SILO_START } = require('../silo');
const {
  getAllFarms,
  getLatestSILODate,
  insertSILORows,
  getAllSILORows,
  getScenariosForFarm,
  upsertPercentiles,
  upsertDailyStateBulk,
} = require('../db/queries');
const {
  calcTMean,
  calcTempLAR,
  calcTrueRoundLength,
  dateToDayOfYear,
  processHistoricalData,
} = require('../lib/formula');

/**
 * Run the full nightly update for all farms.
 * Exported so it can also be triggered manually via API.
 */
async function runNightlyUpdate() {
  console.log(`[cron] Starting nightly update at ${new Date().toISOString()}`);

  const farms = await getAllFarms();
  console.log(`[cron] Processing ${farms.length} farm(s)`);

  for (const farm of farms) {
    try {
      await updateFarm(farm);
    } catch (err) {
      console.error(`[cron] Error updating farm ${farm.id} (${farm.name}):`, err.message);
    }
  }

  console.log(`[cron] Nightly update complete at ${new Date().toISOString()}`);
}

/**
 * Update a single farm — fetch new SILO data and recompute all scenario states.
 */
async function updateFarm(farm) {
  console.log(`[cron] Updating farm ${farm.id}: ${farm.name}`);

  // Find what date we last fetched up to
  const latestDate = await getLatestSILODate(farm.id);
  const yd = yesterday();

  if (latestDate && formatSILODate(new Date(latestDate)) >= yd) {
    console.log(`[cron] Farm ${farm.id} already up to date (latest: ${latestDate})`);
    return;
  }

  // Fetch new data from day after latest (or from SILO_START if first time)
  let startDate;
  if (latestDate) {
    const d = new Date(latestDate);
    d.setDate(d.getDate() + 1);
    startDate = formatSILODate(d);
  } else {
    startDate = SILO_START;
  }

  console.log(`[cron] Fetching SILO data for farm ${farm.id}: ${startDate} to ${yd}`);
  const siloRows = await fetchSILO(farm.lat, farm.lon, startDate, yd, farm.silo_email);
  console.log(`[cron] Fetched ${siloRows.length} rows`);

  await insertSILORows(farm.id, siloRows);

  // Recompute all scenarios for this farm
  const scenarios = await getScenariosForFarm(farm.id);
  const allSILO = await getAllSILORows(farm.id);

  for (const scenario of scenarios) {
    await updateScenario(scenario, allSILO);
  }
}

/**
 * Recompute percentiles and today's state for a single scenario.
 */
async function updateScenario(scenario, allSILO) {
  console.log(`[cron] Computing scenario ${scenario.id}: ${scenario.name}`);

  const { dailySeries, percentiles } = processHistoricalData(
    allSILO,
    scenario.pasture_key,
    Number(scenario.target_leaves)
  );

  // Save percentiles
  await upsertPercentiles(scenario.id, percentiles);

  // Save last 365 days of daily state for chart history
  if (dailySeries.length > 0) {
    const last365 = dailySeries.slice(-365).map(row => ({
      date:        row.date,
      tMean:       row.tMean,
      tempLAR:     row.tempLAR,
      actualLAR:   row.actualLAR,
      solarFactor: row.solarFactor,
      radiation:   row.radiation,
      trueRound:   row.trueRound,
      dataSource:  'silo',
    }));
    await upsertDailyStateBulk(scenario.id, last365);
  }

  console.log(`[cron] Scenario ${scenario.id} updated`);
}

/**
 * Schedule the nightly cron.
 * Call this once from server.js at startup.
 */
function scheduleCron() {
  // Run at 2:00am every night, Hobart time (AEST/AEDT)
  cron.schedule('0 2 * * *', runNightlyUpdate, {
    timezone: 'Australia/Hobart',
  });
  console.log('[cron] Nightly update scheduled for 2:00am Australia/Hobart');
}

module.exports = { scheduleCron, runNightlyUpdate, updateFarm, updateScenario };
