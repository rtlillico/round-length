// round-length/backend/db/queries.js
// All PostgreSQL queries in one place.

'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'roundlength',
  user:     process.env.DB_USER     || 'roundlength',
  password: process.env.DB_PASSWORD,
});

/**
 * Apply schema.sql on startup. Every statement is idempotent (IF NOT EXISTS),
 * so this safely creates tables/columns/indexes that don't exist yet —
 * a lightweight auto-migration on each deploy.
 *
 * Each statement is run SEPARATELY: pg executes a multi-statement query as a
 * single implicit transaction, so one failing statement would roll back the
 * whole batch (silently reverting every new column). Running them one at a time
 * means a single bad migration can't block the others.
 */
async function applySchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.replace(/--[^\n]*/g, '').trim()) // strip line comments
    .filter(Boolean);
  let failed = 0;
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (err) {
      failed++;
      console.error('[schema] statement failed (continuing):', err.message, '::', stmt.replace(/\s+/g, ' ').slice(0, 90));
    }
  }
  console.log(`[schema] applied ${statements.length - failed}/${statements.length} statements`);
}

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

async function setFarmIFD(id, ifdData) {
  const { rows } = await pool.query(
    `UPDATE farms SET ifd_data=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
    [JSON.stringify(ifdData), id]
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

  // Chunk to stay within PostgreSQL's ~32k parameter limit (8 cols × 3000 rows = 24000 params)
  const COLS = 8;
  const CHUNK = 3000;
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const chunk = rows.slice(offset, offset + CHUNK);
    const values = [];
    const params = [];
    chunk.forEach((row, i) => {
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

async function createScenario({ farmId, name, pastureKey, targetLeaves, shortCode, soilType, description }) {
  const { rows } = await pool.query(
    `INSERT INTO scenarios (farm_id, name, pasture_key, target_leaves, short_code, soil_type, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [farmId, name, pastureKey, targetLeaves, shortCode || null, soilType || 'sandyLoam', description || null]
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

async function updateScenarioMeta(id, { name, pastureKey, targetLeaves, soilType, description }) {
  const { rows } = await pool.query(
    `UPDATE scenarios SET name=$1, pasture_key=$2, target_leaves=$3, soil_type=$4, description=$5
     WHERE id=$6 RETURNING *`,
    [name, pastureKey, targetLeaves, soilType, description ?? null, id]
  );
  return rows[0] || null;
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

  // Single bulk INSERT for all 365 rows (365 * 45 = 16425 params, within pg limit)
  const COLS = 45;
  const values = [];
  const params = [];
  percentileRows.forEach((row, i) => {
    const b = i * COLS;
    values.push(
      `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10}` +
      `,$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19}` +
      `,$${b+20},$${b+21},$${b+22},$${b+23},$${b+24},$${b+25},$${b+26},$${b+27},$${b+28}` +
      `,$${b+29},$${b+30},$${b+31},$${b+32},$${b+33},$${b+34},$${b+35},$${b+36},$${b+37}` +
      `,$${b+38},$${b+39},$${b+40},$${b+41},$${b+42},$${b+43},$${b+44},$${b+45})`
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
      row.tminP50, row.tmaxP50,
      row.tminP10, row.tminP25, row.tminP75, row.tminP90,
      row.tmaxP10, row.tmaxP25, row.tmaxP75, row.tmaxP90,
      row.radP10, row.radP25, row.radP50, row.radP75, row.radP90,
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
        years_counted,
        tmin_p50, tmax_p50,
        tmin_p10, tmin_p25, tmin_p75, tmin_p90,
        tmax_p10, tmax_p25, tmax_p75, tmax_p90,
        rad_p10, rad_p25, rad_p50, rad_p75, rad_p90)
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
       years_counted=EXCLUDED.years_counted,
       tmin_p50=EXCLUDED.tmin_p50, tmax_p50=EXCLUDED.tmax_p50,
       tmin_p10=EXCLUDED.tmin_p10, tmin_p25=EXCLUDED.tmin_p25,
       tmin_p75=EXCLUDED.tmin_p75, tmin_p90=EXCLUDED.tmin_p90,
       tmax_p10=EXCLUDED.tmax_p10, tmax_p25=EXCLUDED.tmax_p25,
       tmax_p75=EXCLUDED.tmax_p75, tmax_p90=EXCLUDED.tmax_p90,
       rad_p10=EXCLUDED.rad_p10, rad_p25=EXCLUDED.rad_p25, rad_p50=EXCLUDED.rad_p50,
       rad_p75=EXCLUDED.rad_p75, rad_p90=EXCLUDED.rad_p90`,
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
  // 365 rows * 14 cols = 5110 params, well within pg limit
  const COLS = 14;
  const values = [];
  const params = [];
  rows.forEach((row, i) => {
    const b = i * COLS;
    values.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14})`);
    params.push(
      scenarioId, row.date, row.tMean, row.tempLAR,
      row.actualLAR ?? null, row.solarFactor ?? null, row.radiation ?? null,
      row.trueRound, row.dataSource || 'silo',
      row.moistureFactor ?? null, row.soilWater ?? null,
      row.tMin ?? null, row.tMax ?? null,
      row.rainfall ?? null
    );
  });
  await pool.query(
    `INSERT INTO scenario_daily_state
       (scenario_id, date, t_mean, temp_lar, actual_lar, solar_factor, radiation, true_round, data_source, moisture_factor, soil_water, t_min, t_max, daily_rain)
     VALUES ${values.join(',')}
     ON CONFLICT (scenario_id, date) DO UPDATE SET
       t_mean=EXCLUDED.t_mean, temp_lar=EXCLUDED.temp_lar,
       actual_lar=EXCLUDED.actual_lar, solar_factor=EXCLUDED.solar_factor,
       radiation=EXCLUDED.radiation, true_round=EXCLUDED.true_round,
       data_source=EXCLUDED.data_source,
       moisture_factor=EXCLUDED.moisture_factor, soil_water=EXCLUDED.soil_water,
       t_min=EXCLUDED.t_min, t_max=EXCLUDED.t_max,
       daily_rain=EXCLUDED.daily_rain`,
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

async function getLatestDailyStateForScenarios(scenarioIds) {
  if (scenarioIds.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (scenario_id) *
     FROM scenario_daily_state
     WHERE scenario_id = ANY($1)
     ORDER BY scenario_id, date DESC`,
    [scenarioIds]
  );
  return Object.fromEntries(rows.map(r => [r.scenario_id, r]));
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
  applySchema,
  createFarm, getFarm, getAllFarms, updateFarm, setFarmIFD,
  insertSILORows, getAllSILORows, getSILORange, getLatestSILODate,
  getNextShortCode, createScenario, getScenario, getScenariosForFarm, updateScenarioMeta, deleteScenario,
  upsertPercentiles, getPercentiles,
  upsertDailyState, upsertDailyStateBulk, getLatestDailyState, getLatestDailyStateForScenarios, getDailyStateRange,
};
