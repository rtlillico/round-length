// round-length/backend/db/queries.js
// All PostgreSQL queries in one place.

'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'roundlength',
  user:     process.env.DB_USER     || 'roundlength',
  password: process.env.DB_PASSWORD,
});

// ─── FARMS ────────────────────────────────────────────────────────────────────

async function createFarm({ name, lat, lon, siloEmail }) {
  const { rows } = await pool.query(
    `INSERT INTO farms (name, lat, lon, silo_email)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [name, lat, lon, siloEmail]
  );
  return rows[0];
}

async function getFarm(id) {
  const { rows } = await pool.query(
    'SELECT * FROM farms WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function getAllFarms() {
  const { rows } = await pool.query('SELECT * FROM farms ORDER BY created_at');
  return rows;
}

async function updateFarm(id, { name, lat, lon, siloEmail }) {
  const { rows } = await pool.query(
    `UPDATE farms SET name=$1, lat=$2, lon=$3, silo_email=$4, updated_at=NOW()
     WHERE id=$5 RETURNING *`,
    [name, lat, lon, siloEmail, id]
  );
  return rows[0] || null;
}

// ─── SILO DAILY ───────────────────────────────────────────────────────────────

/**
 * Insert a batch of SILO rows. Skips duplicates (same farm_id + date).
 * @param {number} farmId
 * @param {Array<Object>} rows
 */
async function insertSILORows(farmId, rows) {
  if (rows.length === 0) return;

  // Build a single multi-row INSERT per chunk (max 1000 rows = 8000 params, well within pg limit)
  const COLS = 8;
  const values = [];
  const params = [];
  rows.forEach((row, i) => {
    const b = i * COLS;
    values.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`);
    params.push(farmId, row.date, row.max_temp, row.min_temp, row.radiation, row.daily_rain, row.vp, row.et_morton_wet);
  });

  await pool.query(
    `INSERT INTO silo_daily (farm_id, date, max_temp, min_temp, radiation, daily_rain, vp, et_morton_wet)
     VALUES ${values.join(',')}
     ON CONFLICT (farm_id, date) DO NOTHING`,
    params
  );
}

/**
 * Get all SILO rows for a farm, ordered oldest first.
 * Used for historical computation.
 */
async function getAllSILORows(farmId) {
  const { rows } = await pool.query(
    `SELECT date, max_temp, min_temp, radiation, daily_rain, vp, et_morton_wet
     FROM silo_daily
     WHERE farm_id = $1
     ORDER BY date ASC`,
    [farmId]
  );
  return rows;
}

/**
 * Get SILO rows for a farm within a date range.
 * Used for the rolling 12-month chart.
 */
async function getSILORange(farmId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT date, max_temp, min_temp, radiation, daily_rain, vp, et_morton_wet
     FROM silo_daily
     WHERE farm_id = $1 AND date BETWEEN $2 AND $3
     ORDER BY date ASC`,
    [farmId, startDate, endDate]
  );
  return rows;
}

/**
 * Get the most recent SILO date for a farm.
 * Used to determine what needs to be fetched tonight.
 */
async function getLatestSILODate(farmId) {
  const { rows } = await pool.query(
    `SELECT MAX(date) as latest FROM silo_daily WHERE farm_id = $1`,
    [farmId]
  );
  return rows[0]?.latest || null;
}

// ─── SCENARIOS ────────────────────────────────────────────────────────────────

/**
 * Get the next available short code (S1, S2, S3...) for a farm.
 * Finds the lowest N where S{N} is not already assigned to a scenario in this farm.
 */
async function getNextShortCode(farmId) {
  const { rows } = await pool.query(
    `SELECT short_code FROM scenarios WHERE farm_id = $1 AND short_code IS NOT NULL`,
    [farmId]
  );
  const used = new Set(rows.map(r => r.short_code));
  for (let n = 1; n <= 999; n++) {
    const code = `S${n}`;
    if (!used.has(code)) return code;
  }
  return 'S999';
}

async function createScenario({ farmId, name, pastureKey, targetLeaves, shortCode, soilType }) {
  const { rows } = await pool.query(
    `INSERT INTO scenarios (farm_id, name, pasture_key, target_leaves, short_code, soil_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [farmId, name, pastureKey, targetLeaves, shortCode || null, soilType || 'sandyLoam']
  );
  return rows[0];
}

async function getScenario(id) {
  const { rows } = await pool.query(
    'SELECT * FROM scenarios WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

async function getScenariosForFarm(farmId) {
  const { rows } = await pool.query(
    'SELECT * FROM scenarios WHERE farm_id = $1 ORDER BY created_at',
    [farmId]
  );
  return rows;
}

async function deleteScenario(id) {
  await pool.query('DELETE FROM scenarios WHERE id = $1', [id]);
}

// ─── SCENARIO PERCENTILES ─────────────────────────────────────────────────────

/**
 * Upsert all 365 percentile rows for a scenario.
 * Called after initial SILO download and after nightly update.
 */
async function upsertPercentiles(scenarioId, percentileRows) {
  if (percentileRows.length === 0) return;

  // Single bulk INSERT for all 365 rows (365 * 30 = 10950 params, within pg limit)
  const COLS = 30;
  const values = [];
  const params = [];
  percentileRows.forEach((row, i) => {
    const b = i * COLS;
    values.push(
      `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10}` +
      `,$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19}` +
      `,$${b+20},$${b+21},$${b+22},$${b+23},$${b+24},$${b+25},$${b+26},$${b+27},$${b+28}` +
      `,$${b+29},$${b+30})`
    );
    params.push(
      scenarioId, row.dayOfYear,
      row.larP10, row.larP25, row.larP50, row.larP75, row.larP90,
      row.roundP10, row.roundP25, row.roundP50, row.roundP75, row.roundP90,
      row.tempP10, row.tempP25, row.tempP50, row.tempP75, row.tempP90,
      row.solarP10, row.solarP25, row.solarP50, row.solarP75, row.solarP90,
      row.solarHistoricalMax, row.solarHistoricalMin,
      row.moistureP10, row.moistureP25, row.moistureP50, row.moistureP75, row.moistureP90,
      row.yearsCount,
    );
  });

  await pool.query(
    `INSERT INTO scenario_percentiles
       (scenario_id, day_of_year,
        lar_p10, lar_p25, lar_p50, lar_p75, lar_p90,
        round_p10, round_p25, round_p50, round_p75, round_p90,
        temp_p10, temp_p25, temp_p50, temp_p75, temp_p90,
        solar_p10, solar_p25, solar_p50, solar_p75, solar_p90,
        solar_historical_max, solar_historical_min,
        moisture_p10, moisture_p25, moisture_p50, moisture_p75, moisture_p90,
        years_counted)
     VALUES ${values.join(',')}
     ON CONFLICT (scenario_id, day_of_year) DO UPDATE SET
       lar_p10=EXCLUDED.lar_p10, lar_p25=EXCLUDED.lar_p25, lar_p50=EXCLUDED.lar_p50,
       lar_p75=EXCLUDED.lar_p75, lar_p90=EXCLUDED.lar_p90,
       round_p10=EXCLUDED.round_p10, round_p25=EXCLUDED.round_p25, round_p50=EXCLUDED.round_p50,
       round_p75=EXCLUDED.round_p75, round_p90=EXCLUDED.round_p90,
       temp_p10=EXCLUDED.temp_p10, temp_p25=EXCLUDED.temp_p25, temp_p50=EXCLUDED.temp_p50,
       temp_p75=EXCLUDED.temp_p75, temp_p90=EXCLUDED.temp_p90,
       solar_p10=EXCLUDED.solar_p10, solar_p25=EXCLUDED.solar_p25, solar_p50=EXCLUDED.solar_p50,
       solar_p75=EXCLUDED.solar_p75, solar_p90=EXCLUDED.solar_p90,
       solar_historical_max=EXCLUDED.solar_historical_max,
       solar_historical_min=EXCLUDED.solar_historical_min,
       moisture_p10=EXCLUDED.moisture_p10, moisture_p25=EXCLUDED.moisture_p25,
       moisture_p50=EXCLUDED.moisture_p50, moisture_p75=EXCLUDED.moisture_p75,
       moisture_p90=EXCLUDED.moisture_p90,
       years_counted=EXCLUDED.years_counted`,
    params
  );
}

/**
 * Get all 365 percentile rows for a scenario.
 * Used for chart rendering.
 */
async function getPercentiles(scenarioId) {
  const { rows } = await pool.query(
    `SELECT * FROM scenario_percentiles
     WHERE scenario_id = $1
     ORDER BY day_of_year`,
    [scenarioId]
  );
  return rows;
}

// ─── SCENARIO DAILY STATE ─────────────────────────────────────────────────────

async function upsertDailyState(scenarioId, { date, tMean, tempLAR, actualLAR, solarFactor, radiation, trueRound, dataSource }) {
  await pool.query(
    `INSERT INTO scenario_daily_state
       (scenario_id, date, t_mean, temp_lar, actual_lar, solar_factor, radiation, true_round, data_source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (scenario_id, date) DO UPDATE SET
       t_mean=$3, temp_lar=$4, actual_lar=$5, solar_factor=$6, radiation=$7, true_round=$8, data_source=$9`,
    [scenarioId, date, tMean, tempLAR, actualLAR ?? null, solarFactor ?? null, radiation ?? null, trueRound, dataSource || 'silo']
  );
}

async function upsertDailyStateBulk(scenarioId, rows) {
  if (rows.length === 0) return;
  // 365 rows * 11 cols = 4015 params, well within pg limit
  const COLS = 11;
  const values = [];
  const params = [];
  rows.forEach((row, i) => {
    const b = i * COLS;
    values.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11})`);
    params.push(
      scenarioId, row.date, row.tMean, row.tempLAR,
      row.actualLAR ?? null, row.solarFactor ?? null, row.radiation ?? null,
      row.trueRound, row.dataSource || 'silo',
      row.moistureFactor ?? null, row.soilWater ?? null
    );
  });
  await pool.query(
    `INSERT INTO scenario_daily_state
       (scenario_id, date, t_mean, temp_lar, actual_lar, solar_factor, radiation, true_round, data_source, moisture_factor, soil_water)
     VALUES ${values.join(',')}
     ON CONFLICT (scenario_id, date) DO UPDATE SET
       t_mean=EXCLUDED.t_mean, temp_lar=EXCLUDED.temp_lar,
       actual_lar=EXCLUDED.actual_lar, solar_factor=EXCLUDED.solar_factor,
       radiation=EXCLUDED.radiation, true_round=EXCLUDED.true_round,
       data_source=EXCLUDED.data_source,
       moisture_factor=EXCLUDED.moisture_factor, soil_water=EXCLUDED.soil_water`,
    params
  );
}

async function getLatestDailyState(scenarioId) {
  const { rows } = await pool.query(
    `SELECT * FROM scenario_daily_state
     WHERE scenario_id = $1
     ORDER BY date DESC
     LIMIT 1`,
    [scenarioId]
  );
  return rows[0] || null;
}

/**
 * Get daily state rows for a scenario within a date range.
 * Used for the rolling 12-month actual chart.
 */
async function getDailyStateRange(scenarioId, startDate, endDate) {
  const { rows } = await pool.query(
    `SELECT * FROM scenario_daily_state
     WHERE scenario_id = $1 AND date BETWEEN $2 AND $3
     ORDER BY date ASC`,
    [scenarioId, startDate, endDate]
  );
  return rows;
}

module.exports = {
  pool,
  createFarm, getFarm, getAllFarms, updateFarm,
  insertSILORows, getAllSILORows, getSILORange, getLatestSILODate,
  getNextShortCode, createScenario, getScenario, getScenariosForFarm, deleteScenario,
  upsertPercentiles, getPercentiles,
  upsertDailyState, upsertDailyStateBulk, getLatestDailyState, getDailyStateRange,
};
