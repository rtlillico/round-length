// backend/scripts/assignShortCodes.js
// One-off migration: assigns S1, S2, S3... short codes to existing scenarios
// that were created before the short_code column was added.
//
//   node backend/scripts/assignShortCodes.js

'use strict';

const { pool, getAllFarms, getScenariosForFarm } = require('../db/queries');

async function run() {
  const farms = await getAllFarms();
  console.log(`Found ${farms.length} farm(s)`);

  for (const farm of farms) {
    console.log(`\nFarm ${farm.id}: ${farm.name}`);
    const scenarios = await getScenariosForFarm(farm.id);
    console.log(`  ${scenarios.length} scenario(s)`);

    let counter = 1;
    for (const scenario of scenarios) {
      if (scenario.short_code) {
        console.log(`  Scenario ${scenario.id} already has code ${scenario.short_code} — skipping`);
        // Track the numeric part so we don't reuse it
        const match = scenario.short_code.match(/^S(\d+)$/);
        if (match) counter = Math.max(counter, Number(match[1]) + 1);
        continue;
      }
      const code = `S${counter++}`;
      await pool.query(
        `UPDATE scenarios SET short_code = $1 WHERE id = $2`,
        [code, scenario.id]
      );
      console.log(`  Assigned ${code} to scenario ${scenario.id}: ${scenario.name}`);
    }
  }

  console.log('\nDone.');
  await pool.end();
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
