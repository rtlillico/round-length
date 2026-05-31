// round-length/backend/lib/recompute-worker.js
// Runs as a child_process.fork() so the heavy CPU work never blocks the main event loop.
'use strict';

const { getScenario, getFarm, getAllSILORows } = require('../db/queries');
const { updateScenario } = require('../cron/nightly');

const [scenarioId, farmId] = process.argv.slice(2);

async function main() {
  const [scenario, farm, allSILO] = await Promise.all([
    getScenario(scenarioId),
    getFarm(farmId),
    getAllSILORows(farmId),
  ]);
  await updateScenario(scenario, allSILO, farm?.ifd_data || null);
  console.log(`[recompute-worker] Scenario ${scenarioId} done`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(`[recompute-worker] Error for scenario ${scenarioId}:`, err.message);
    process.exit(1);
  });
