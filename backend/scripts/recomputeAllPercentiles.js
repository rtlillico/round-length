// backend/scripts/recomputeAllPercentiles.js
// One-off script: recomputes percentiles and daily state for every scenario.
// Run after adding solar factor columns or changing the LAR formula.
//
//   node backend/scripts/recomputeAllPercentiles.js

'use strict';

const { pool, getAllFarms, getScenariosForFarm, getAllSILORows, upsertPercentiles, upsertDailyStateBulk } = require('../db/queries');
const { processHistoricalData } = require('../lib/formula');

async function run() {
  const farms = await getAllFarms();
  console.log(`Found ${farms.length} farm(s)`);

  for (const farm of farms) {
    console.log(`\nFarm ${farm.id}: ${farm.name}`);
    const allSILO = await getAllSILORows(farm.id);
    console.log(`  ${allSILO.length} SILO rows`);

    const scenarios = await getScenariosForFarm(farm.id);
    console.log(`  ${scenarios.length} scenario(s)`);

    for (const scenario of scenarios) {
      console.log(`  Recomputing: ${scenario.name} (id=${scenario.id})`);
      const { dailySeries, percentiles } = processHistoricalData(
        allSILO,
        scenario.pasture_key,
        Number(scenario.target_leaves),
        scenario.soil_type || 'sandyLoam'
      );

      await upsertPercentiles(scenario.id, percentiles);

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

      console.log(`    Done — ${percentiles.length} percentile rows, ${Math.min(dailySeries.length, 365)} daily state rows`);
    }
  }

  console.log('\nAll scenarios recomputed.');
  await pool.end();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
