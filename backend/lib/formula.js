// round-length/backend/lib/formula.js
// Core pasture growth formula — v1 temperature only.
// This same logic is mirrored in frontend/src/lib/formula.js.
// Keep both files in sync when making changes.

'use strict';

// ─── SOLAR TABLE ─────────────────────────────────────────────────────────────
// Monthly maximum solar radiation (MJ/m²/day) for Smithton Tasmania (lat -40.85).
// Index 0 = January, index 11 = December.
const MAX_SOLAR_BY_MONTH = [28, 25, 20, 14, 9, 7, 7, 10, 15, 20, 25, 27];

// ─── PASTURE PARAMETERS ───────────────────────────────────────────────────────

const PASTURE_PARAMS = {
  perennialRyegrass: {
    name: 'Perennial ryegrass',
    baseTemp: 5,
    optimumTemp: 22,
    ceilingTemp: 35,
    phyllochron: 100,
    region: 'Temperate',
  },
  annualRyegrass: {
    name: 'Annual ryegrass',
    baseTemp: 4,
    optimumTemp: 23,
    ceilingTemp: 35,
    phyllochron: 95,
    region: 'Temperate',
  },
  tallFescue: {
    name: 'Tall fescue',
    baseTemp: 5,
    optimumTemp: 24,
    ceilingTemp: 38,
    phyllochron: 110,
    region: 'Temperate',
  },
  cocksfoot: {
    name: 'Cocksfoot',
    baseTemp: 4,
    optimumTemp: 24,
    ceilingTemp: 38,
    phyllochron: 105,
    region: 'Temperate',
  },
  phalaris: {
    name: 'Phalaris',
    baseTemp: 4,
    optimumTemp: 20,
    ceilingTemp: 36,
    phyllochron: 100,
    region: 'Temperate',
  },
  kikuyu: {
    name: 'Kikuyu',
    baseTemp: 10,
    optimumTemp: 32,
    ceilingTemp: 45,
    phyllochron: 85,
    region: 'Subtropical',
  },
  rhodesGrass: {
    name: 'Rhodes grass',
    baseTemp: 12,
    optimumTemp: 33,
    ceilingTemp: 45,
    phyllochron: 80,
    region: 'Tropical',
  },
};

// ─── CORE CALCULATIONS ────────────────────────────────────────────────────────

/**
 * Calculate mean daily temperature from max and min.
 * @param {number} tMax - Maximum temperature (°C)
 * @param {number} tMin - Minimum temperature (°C)
 * @returns {number} Mean temperature (°C)
 */
function calcTMean(tMax, tMin) {
  return (tMax + tMin) / 2;
}

/**
 * Calculate Temp LAR (Leaf Appearance Rate driven by temperature only).
 * Returns 0 if temperature is below base temp — no growth.
 * @param {number} tMean - Mean daily temperature (°C)
 * @param {string} pastureKey - Key into PASTURE_PARAMS
 * @returns {number} Temp LAR (leaves/day)
 */
function calcTempLAR(tMean, pastureKey) {
  const pasture = PASTURE_PARAMS[pastureKey];
  if (!pasture) throw new Error(`Unknown pasture key: ${pastureKey}`);
  const { baseTemp, optimumTemp, ceilingTemp, phyllochron } = pasture;
  const maxLAR = (optimumTemp - baseTemp) / phyllochron;
  if (tMean < baseTemp)    return 0;
  if (tMean < optimumTemp) return (tMean - baseTemp) / phyllochron;
  if (tMean < ceilingTemp) return maxLAR * (ceilingTemp - tMean) / (ceilingTemp - optimumTemp);
  return 0;
}

/**
 * Calculate the maximum possible Temp LAR (at optimum temperature).
 * @param {string} pastureKey
 * @returns {number} Max Temp LAR (leaves/day)
 */
function calcMaxTempLAR(pastureKey) {
  const pasture = PASTURE_PARAMS[pastureKey];
  if (!pasture) throw new Error(`Unknown pasture key: ${pastureKey}`);
  const { baseTemp, optimumTemp, phyllochron } = pasture;
  return (optimumTemp - baseTemp) / phyllochron;
}

/**
 * Calculate the Solar factor (0–1) — fraction of maximum possible solar radiation.
 * Returns null if radiation data is missing.
 * @param {number|null} radiation - MJ/m²/day from SILO
 * @param {number} month - 0-based month (0 = January)
 * @returns {number|null}
 */
function calcSolarFactor(radiation, month) {
  if (radiation == null || radiation < 0) return null;
  return Math.min(1, radiation / MAX_SOLAR_BY_MONTH[month]);
}

/**
 * Calculate Actual LAR = Temp LAR × Solar factor.
 * Falls back to Temp LAR alone if radiation is unavailable.
 * @param {number} tMean - Mean daily temperature (°C)
 * @param {number|null} radiation - MJ/m²/day
 * @param {number} month - 0-based month
 * @param {string} pastureKey
 * @returns {{ tempLAR: number, solarFactor: number|null, actualLAR: number }}
 */
function calcActualLAR(tMean, radiation, month, pastureKey) {
  const tempLAR = calcTempLAR(tMean, pastureKey);
  const solarFactor = calcSolarFactor(radiation, month);
  if (solarFactor == null) return { tempLAR, solarFactor: null, actualLAR: tempLAR };
  return { tempLAR, solarFactor, actualLAR: tempLAR * solarFactor };
}

/**
 * Calculate instantaneous round length from today's Temp LAR.
 * Note: this assumes today's growth rate continues — use calcTrueRoundLength
 * for a more accurate measure that accounts for seasonal variation.
 * @param {number} tempLAR - Leaves per day
 * @param {number} targetLeaves - Target leaf stage (1.5, 2.0, 2.5, or 3.0)
 * @returns {number} Round length in days (Infinity if no growth)
 */
function calcInstantRoundLength(tempLAR, targetLeaves) {
  if (tempLAR <= 0) return Infinity;
  return targetLeaves / tempLAR;
}

/**
 * Calculate true round length by summing LAR backwards from a given date index.
 * Finds how many past days of cumulative LAR are needed to reach targetLeaves.
 * This is the preferred method — accounts for real seasonal temperature variation.
 *
 * @param {Array<number>} larSeries - Array of daily Temp LAR values (oldest first)
 * @param {number} endIndex - Index in larSeries to count backwards from (today)
 * @param {number} targetLeaves - Target leaf stage
 * @returns {number} True round length in days (capped at 365)
 */
function calcTrueRoundLength(larSeries, endIndex, targetLeaves) {
  let cumLAR = 0;
  let days = 0;
  for (let i = endIndex; i >= 0; i--) {
    cumLAR += larSeries[i];
    days++;
    if (cumLAR >= targetLeaves) return days;
    if (days >= 365) return 365; // cap — more than a year means near-zero growth
  }
  return days; // ran out of data before reaching target
}

/**
 * Calculate true round length projecting FORWARD from today using
 * historical median LAR values for each future day of year.
 *
 * @param {Array<number>} medianLARByDoy - Array of 365 median LAR values indexed by day-of-year (0-based)
 * @param {number} startDoy - Day of year to start from (0-based, today)
 * @param {number} targetLeaves - Target leaf stage
 * @returns {number} Projected round length in days (capped at 365)
 */
function calcProjectedRoundLength(medianLARByDoy, startDoy, targetLeaves) {
  let cumLAR = 0;
  for (let d = 0; d < 365; d++) {
    const doy = (startDoy + d) % 365;
    cumLAR += medianLARByDoy[doy];
    if (cumLAR >= targetLeaves) return d + 1;
  }
  return 365;
}

/**
 * Convert a Date object to day-of-year (1-based, leap years normalised to 365).
 * Leap day (Feb 29) is treated as day 59 (same as Feb 28).
 * @param {Date} date
 * @returns {number} Day of year (1–365)
 */
function dateToDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  let doy = Math.floor(diff / oneDay);
  // Normalise leap years: if after Feb 28 in a leap year, subtract 1
  const isLeap =
    date.getFullYear() % 4 === 0 &&
    (date.getFullYear() % 100 !== 0 || date.getFullYear() % 400 === 0);
  if (isLeap && doy > 59) doy--;
  return Math.min(doy, 365);
}

/**
 * Calculate percentile from a sorted array of numbers.
 * @param {Array<number>} sorted - Sorted array (ascending)
 * @param {number} p - Percentile (0–100)
 * @returns {number}
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Process a full SILO dataset for one farm+scenario to compute:
 * - Daily Temp LAR for every day in the dataset
 * - Daily true round length for every day
 * - Day-of-year percentiles (p10, p50, p90) for LAR, true round, and temperature
 *
 * This is the heavy computation run once on scenario creation and nightly thereafter.
 *
 * @param {Array<{date, max_temp, min_temp}>} siloData - Raw SILO rows, oldest first
 * @param {string} pastureKey
 * @param {number} targetLeaves
 * @returns {{
 *   dailySeries: Array<{date, tMean, tempLAR, trueRound}>,
 *   percentiles: Array<{dayOfYear, larP10, larP50, larP90, roundP10, roundP50, roundP90, tempP10, tempP50, tempP90, yearsCount}>
 * }}
 */
function processHistoricalData(siloData, pastureKey, targetLeaves) {
  // Step 1: calculate Actual LAR (Temp LAR × Solar factor) for every day
  const dailySeries = siloData.map((row) => {
    const tMean = calcTMean(Number(row.max_temp), Number(row.min_temp));
    const month = new Date(row.date).getUTCMonth(); // 0-based, UTC-safe
    const radiation = row.radiation != null ? Number(row.radiation) : null;
    const { tempLAR, solarFactor, actualLAR } = calcActualLAR(tMean, radiation, month, pastureKey);
    return { date: row.date, tMean, tempLAR, solarFactor, actualLAR, radiation, trueRound: null };
  });

  // Step 2: calculate true round length using actualLAR (backwards cumulative sum)
  const larValues = dailySeries.map((d) => d.actualLAR);
  for (let i = 0; i < dailySeries.length; i++) {
    dailySeries[i].trueRound = calcTrueRoundLength(larValues, i, targetLeaves);
  }

  // Step 3: group by day-of-year and compute percentiles
  const buckets = {};
  for (let doy = 1; doy <= 365; doy++) {
    buckets[doy] = { lars: [], rounds: [], temps: [], solars: [] };
  }

  for (const row of dailySeries) {
    const doy = dateToDayOfYear(new Date(row.date));
    buckets[doy].lars.push(row.actualLAR);
    buckets[doy].rounds.push(row.trueRound);
    buckets[doy].temps.push(row.tMean);
    if (row.solarFactor != null) buckets[doy].solars.push(row.solarFactor);
  }

  const percentileRows = [];
  for (let doy = 1; doy <= 365; doy++) {
    const b = buckets[doy];
    const sortedLars   = [...b.lars].sort((a, b) => a - b);
    const sortedRounds = [...b.rounds].sort((a, b) => a - b);
    const sortedTemps  = [...b.temps].sort((a, b) => a - b);
    const sortedSolars = [...b.solars].sort((a, b) => a - b);

    percentileRows.push({
      dayOfYear: doy,
      larP10: percentile(sortedLars, 10),
      larP25: percentile(sortedLars, 25),
      larP50: percentile(sortedLars, 50),
      larP75: percentile(sortedLars, 75),
      larP90: percentile(sortedLars, 90),
      roundP10: percentile(sortedRounds, 10),
      roundP25: percentile(sortedRounds, 25),
      roundP50: percentile(sortedRounds, 50),
      roundP75: percentile(sortedRounds, 75),
      roundP90: percentile(sortedRounds, 90),
      tempP10: percentile(sortedTemps, 10),
      tempP25: percentile(sortedTemps, 25),
      tempP50: percentile(sortedTemps, 50),
      tempP75: percentile(sortedTemps, 75),
      tempP90: percentile(sortedTemps, 90),
      solarP10: percentile(sortedSolars, 10),
      solarP25: percentile(sortedSolars, 25),
      solarP50: percentile(sortedSolars, 50),
      solarP75: percentile(sortedSolars, 75),
      solarP90: percentile(sortedSolars, 90),
      solarHistoricalMax: sortedSolars.length > 0 ? sortedSolars[sortedSolars.length - 1] : null,
      solarHistoricalMin: sortedSolars.length > 0 ? sortedSolars[0] : null,
      yearsCount: b.lars.length,
    });
  }

  return { dailySeries, percentiles: percentileRows };
}

module.exports = {
  PASTURE_PARAMS,
  MAX_SOLAR_BY_MONTH,
  calcTMean,
  calcTempLAR,
  calcMaxTempLAR,
  calcSolarFactor,
  calcActualLAR,
  calcInstantRoundLength,
  calcTrueRoundLength,
  calcProjectedRoundLength,
  dateToDayOfYear,
  percentile,
  processHistoricalData,
};
