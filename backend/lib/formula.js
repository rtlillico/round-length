// round-length/backend/lib/formula.js
// Core pasture growth formula — v2 includes solar factor and moisture factor.
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

// ─── SOIL PARAMETERS ──────────────────────────────────────────────────────────
// SWmax: field capacity (mm). drainageRate: fraction of excess drained per day.
// infiltrationRate: max soil absorption rate (mm/hr) — used in IFD runoff model.

const SOIL_PARAMS = {
  sand:      { name: 'Sand',        SWmax: 18, drainageRate: 0.90, infiltrationRate: 25 },
  sandyLoam: { name: 'Sandy loam',  SWmax: 30, drainageRate: 0.60, infiltrationRate: 15 },
  sandyClay: { name: 'Sandy clay',  SWmax: 35, drainageRate: 0.40, infiltrationRate: 10 },
  clay:      { name: 'Clay',        SWmax: 45, drainageRate: 0.20, infiltrationRate:  5 },
  peat:      { name: 'Peat',        SWmax: 75, drainageRate: 0.50, infiltrationRate: 20 },
};

// Waterlogging thresholds per soil type.
// Check severe first, then moderate, else return 1.0.
const WATERLOGGING_THRESHOLDS = {
  sand:      { severe: 0.99, severeF: 0.70, moderate: 0.95, moderateF: 0.85 },
  sandyLoam: { severe: 0.95, severeF: 0.50, moderate: 0.90, moderateF: 0.75 },
  sandyClay: { severe: 0.92, severeF: 0.40, moderate: 0.85, moderateF: 0.65 },
  clay:      { severe: 0.88, severeF: 0.30, moderate: 0.80, moderateF: 0.55 },
  peat:      { severe: 0.92, severeF: 0.55, moderate: 0.85, moderateF: 0.70 },
};

// ─── CORE CALCULATIONS ────────────────────────────────────────────────────────

function calcTMean(tMax, tMin) {
  return (tMax + tMin) / 2;
}

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

function calcMaxTempLAR(pastureKey) {
  const pasture = PASTURE_PARAMS[pastureKey];
  if (!pasture) throw new Error(`Unknown pasture key: ${pastureKey}`);
  const { baseTemp, optimumTemp, phyllochron } = pasture;
  return (optimumTemp - baseTemp) / phyllochron;
}

function calcSolarFactor(radiation, month) {
  if (radiation == null || radiation < 0) return null;
  return Math.min(1, radiation / MAX_SOLAR_BY_MONTH[month]);
}

/**
 * Waterlogging factor: penalises growth when soil is near saturation.
 */
function calcWaterloggingFactor(SW, SWmax, soilType) {
  const t = WATERLOGGING_THRESHOLDS[soilType] || WATERLOGGING_THRESHOLDS.sandyLoam;
  if (SW >= SWmax * t.severe)   return t.severeF;
  if (SW >= SWmax * t.moderate) return t.moderateF;
  return 1.0;
}

/**
 * Moisture factor (0–1): scales growth by soil water availability.
 * Reaches 1.0 at 50% of field capacity; penalised below that and for waterlogging.
 */
function calcMoistureFactor(SW, SWmax, soilType) {
  const waterlogging = calcWaterloggingFactor(SW, SWmax, soilType);
  return Math.min(1, SW / (SWmax * 0.5)) * waterlogging;
}

/**
 * Estimate runoff from daily rainfall using BOM IFD data.
 *
 * Method:
 *  1. Find the AEP of today's rainfall from the 24-hour IFD curve (interpolated).
 *  2. At that AEP, read the 1-hour depth → peak hourly intensity (mm/hr).
 *  3. Runoff fraction = max(0, (intensity − infiltrationRate) / intensity).
 *  4. Runoff = rainfall × runoff fraction.
 *
 * Returns { runoff, effectiveRainfall, aep, peakIntensity1hr, runoffFraction }
 * Returns null for all if ifdData is missing or rainfall is 0.
 *
 * @param {number} rainfall - Daily rainfall (mm)
 * @param {object|null} ifdData - Parsed IFD JSON { depths: { "60": { "1.0": mm, ... }, "1440": {...} } }
 * @param {number} infiltrationRate - Soil infiltration capacity (mm/hr)
 */
function calcIFDRunoff(rainfall, ifdData, infiltrationRate) {
  if (!ifdData || !ifdData.depths || rainfall <= 0) {
    return { runoff: 0, effectiveRainfall: rainfall, aep: null, peakIntensity1hr: null, runoffFraction: 0 };
  }

  const depths24h = ifdData.depths['1440'];
  const depths1h  = ifdData.depths['60'];
  if (!depths24h || !depths1h) {
    return { runoff: 0, effectiveRainfall: rainfall, aep: null, peakIntensity1hr: null, runoffFraction: 0 };
  }

  // Build sorted array of [aep, depth24h] pairs — AEP ascending, depth descending
  const curve = Object.entries(depths24h)
    .map(([aep, depth]) => [parseFloat(aep), depth])
    .filter(([, d]) => d != null)
    .sort((a, b) => a[0] - b[0]);

  if (curve.length === 0) {
    return { runoff: 0, effectiveRainfall: rainfall, aep: null, peakIntensity1hr: null, runoffFraction: 0 };
  }

  // Find AEP by interpolating the 24-hour depth curve
  let aep;
  if (rainfall >= curve[0][1]) {
    aep = curve[0][0]; // at or above rarest event — cap at lowest AEP
  } else if (rainfall <= curve[curve.length - 1][1]) {
    aep = curve[curve.length - 1][0]; // below most common — use highest AEP
  } else {
    // Linear interpolation between bracketing pairs
    for (let i = 0; i < curve.length - 1; i++) {
      const [aep1, d1] = curve[i];
      const [aep2, d2] = curve[i + 1];
      if (rainfall <= d1 && rainfall >= d2) {
        const t = (d1 - rainfall) / (d1 - d2);
        aep = aep1 + t * (aep2 - aep1);
        break;
      }
    }
  }

  // Read 1-hour depth at the interpolated AEP
  const aepKey = String(aep);
  let peakIntensity1hr = null;

  // Find bracketing AEP keys in 1-hour table and interpolate
  const aepKeys = Object.keys(depths1h).map(Number).sort((a, b) => a - b);
  if (aepKeys.length > 0) {
    if (aep <= aepKeys[0]) {
      peakIntensity1hr = depths1h[String(aepKeys[0])];
    } else if (aep >= aepKeys[aepKeys.length - 1]) {
      peakIntensity1hr = depths1h[String(aepKeys[aepKeys.length - 1])];
    } else {
      for (let i = 0; i < aepKeys.length - 1; i++) {
        if (aep >= aepKeys[i] && aep <= aepKeys[i + 1]) {
          const t = (aep - aepKeys[i]) / (aepKeys[i + 1] - aepKeys[i]);
          const d1 = depths1h[String(aepKeys[i])];
          const d2 = depths1h[String(aepKeys[i + 1])];
          peakIntensity1hr = d1 + t * (d2 - d1);
          break;
        }
      }
    }
  }

  if (peakIntensity1hr == null) {
    return { runoff: 0, effectiveRainfall: rainfall, aep, peakIntensity1hr: null, runoffFraction: 0 };
  }

  // Runoff fraction: proportion of rain that exceeds soil infiltration capacity
  const runoffFraction = Math.max(0, (peakIntensity1hr - infiltrationRate) / peakIntensity1hr);
  const runoff         = Math.round(rainfall * runoffFraction * 10) / 10;
  const effectiveRainfall = rainfall - runoff;

  return {
    runoff,
    effectiveRainfall,
    aep:              Math.round(aep * 1000) / 1000,
    peakIntensity1hr: Math.round(peakIntensity1hr * 10) / 10,
    runoffFraction:   Math.round(runoffFraction * 1000) / 1000,
  };
}

/**
 * Update soil water balance for one day.
 * Uses Morton wet-environment ET from SILO when available; falls back to a
 * radiation × temp approximation for older rows where SILO is missing it.
 * If ifdData is provided, subtracts estimated runoff before adding rainfall.
 * Drainage removes excess water above field capacity.
 *
 * Returns { SW, runoff, effectiveRainfall, aep, peakIntensity1hr, runoffFraction }
 */
function calcSoilWater(SW_prev, rainfall, etMorton, radiation, tMean, soilParams, ifdData = null) {
  const ET0 = etMorton != null
    ? Math.max(0, Number(etMorton))
    : Math.max(0, 0.0135 * (radiation ?? 10) * (tMean + 17.8));

  const runoffResult    = calcIFDRunoff(rainfall, ifdData, soilParams.infiltrationRate ?? 15);
  const effectiveRain   = runoffResult.effectiveRainfall;

  const potential = SW_prev + effectiveRain - ET0;
  const drainage  = Math.max(0, potential - soilParams.SWmax) * soilParams.drainageRate;
  const SW        = Math.min(soilParams.SWmax, Math.max(0, potential - drainage));

  return { SW, ...runoffResult };
}

/**
 * Calculate Actual LAR = Temp LAR × Solar factor × Moisture factor.
 * Falls back gracefully when radiation or moisture data is unavailable.
 */
function calcActualLAR(tMean, radiation, month, pastureKey, moistureFactor = 1.0) {
  const tempLAR    = calcTempLAR(tMean, pastureKey);
  const solarFactor = calcSolarFactor(radiation, month);
  if (solarFactor == null) {
    return { tempLAR, solarFactor: null, actualLAR: tempLAR * moistureFactor };
  }
  return { tempLAR, solarFactor, actualLAR: tempLAR * solarFactor * moistureFactor };
}

function calcInstantRoundLength(tempLAR, targetLeaves) {
  if (tempLAR <= 0) return Infinity;
  return targetLeaves / tempLAR;
}

function calcTrueRoundLength(larSeries, endIndex, targetLeaves) {
  let cumLAR = 0;
  let days   = 0;
  for (let i = endIndex; i >= 0; i--) {
    cumLAR += larSeries[i];
    days++;
    if (cumLAR >= targetLeaves) return days;
    if (days >= 365) return 365;
  }
  return days;
}

function calcProjectedRoundLength(medianLARByDoy, startDoy, targetLeaves) {
  let cumLAR = 0;
  for (let d = 0; d < 365; d++) {
    const doy = (startDoy + d) % 365;
    cumLAR += medianLARByDoy[doy];
    if (cumLAR >= targetLeaves) return d + 1;
  }
  return 365;
}

function dateToDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff  = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  let doy = Math.floor(diff / oneDay);
  const isLeap =
    date.getFullYear() % 4 === 0 &&
    (date.getFullYear() % 100 !== 0 || date.getFullYear() % 400 === 0);
  if (isLeap && doy > 59) doy--;
  return Math.min(doy, 365);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

/**
 * Process a full SILO dataset for one scenario to compute daily series and
 * day-of-year percentiles. Includes soil water balance and moisture factor.
 *
 * @param {Array} siloData - Raw SILO rows, oldest first
 * @param {string} pastureKey
 * @param {number} targetLeaves
 * @param {string} soilType - Key into SOIL_PARAMS (default: 'sandyLoam')
 * @param {object|null} ifdData - BOM IFD point data for runoff calculation (optional)
 */
function processHistoricalData(siloData, pastureKey, targetLeaves, soilType = 'sandyLoam', ifdData = null) {
  const soilParams = SOIL_PARAMS[soilType] || SOIL_PARAMS.sandyLoam;
  const { SWmax } = soilParams;

  // Step 1: forward pass — soil water balance, moisture factor, LAR
  let SW = SWmax; // start at field capacity
  const dailySeries = siloData.map((row) => {
    const tMin      = Number(row.min_temp);
    const tMax      = Number(row.max_temp);
    const tMean     = calcTMean(tMax, tMin);
    const month     = new Date(row.date).getUTCMonth(); // 0-based, UTC-safe
    const radiation = row.radiation     != null ? Number(row.radiation)     : null;
    const rainfall  = row.daily_rain    != null ? Number(row.daily_rain)    : 0;
    const etMorton  = row.et_morton_wet != null ? Number(row.et_morton_wet) : null;

    const swResult   = calcSoilWater(SW, rainfall, etMorton, radiation, tMean, soilParams, ifdData);
    SW = swResult.SW;
    const moistureFactor = calcMoistureFactor(SW, SWmax, soilType);

    const { tempLAR, solarFactor, actualLAR: baseActual } = calcActualLAR(tMean, radiation, month, pastureKey);
    const actualLAR = baseActual * moistureFactor;

    return {
      date: row.date, tMean, tMin, tMax, tempLAR, solarFactor, actualLAR,
      radiation, rainfall, moistureFactor, soilWater: SW, trueRound: null,
      runoff:           swResult.runoff,
      effectiveRain:    swResult.effectiveRainfall,
      runoffAEP:        swResult.aep,
      peakIntensity1hr: swResult.peakIntensity1hr,
      runoffFraction:   swResult.runoffFraction,
    };
  });

  // Step 2: backward pass — true round length from actualLAR (includes all factors)
  const larValues = dailySeries.map((d) => d.actualLAR);
  for (let i = 0; i < dailySeries.length; i++) {
    dailySeries[i].trueRound = calcTrueRoundLength(larValues, i, targetLeaves);
  }

  // Step 3: group by day-of-year and compute percentiles
  const buckets = {};
  for (let doy = 1; doy <= 365; doy++) {
    buckets[doy] = { lars: [], rounds: [], temps: [], solars: [], moistures: [] };
  }

  for (const row of dailySeries) {
    const doy = dateToDayOfYear(new Date(row.date));
    buckets[doy].lars.push(row.actualLAR);
    buckets[doy].rounds.push(row.trueRound);
    buckets[doy].temps.push(row.tMean);
    buckets[doy].moistures.push(row.moistureFactor);
    if (row.solarFactor != null) buckets[doy].solars.push(row.solarFactor);
  }

  const percentileRows = [];
  for (let doy = 1; doy <= 365; doy++) {
    const b = buckets[doy];
    const sL = [...b.lars].sort((a, b) => a - b);
    const sR = [...b.rounds].sort((a, b) => a - b);
    const sT = [...b.temps].sort((a, b) => a - b);
    const sS = [...b.solars].sort((a, b) => a - b);
    const sM = [...b.moistures].sort((a, b) => a - b);

    percentileRows.push({
      dayOfYear: doy,
      larP10: percentile(sL, 10), larP25: percentile(sL, 25), larP50: percentile(sL, 50),
      larP75: percentile(sL, 75), larP90: percentile(sL, 90),
      roundP10: percentile(sR, 10), roundP25: percentile(sR, 25), roundP50: percentile(sR, 50),
      roundP75: percentile(sR, 75), roundP90: percentile(sR, 90),
      tempP10: percentile(sT, 10), tempP25: percentile(sT, 25), tempP50: percentile(sT, 50),
      tempP75: percentile(sT, 75), tempP90: percentile(sT, 90),
      solarP10: percentile(sS, 10), solarP25: percentile(sS, 25), solarP50: percentile(sS, 50),
      solarP75: percentile(sS, 75), solarP90: percentile(sS, 90),
      solarHistoricalMax: sS.length > 0 ? sS[sS.length - 1] : null,
      solarHistoricalMin: sS.length > 0 ? sS[0] : null,
      moistureP10: percentile(sM, 10), moistureP25: percentile(sM, 25),
      moistureP50: percentile(sM, 50), moistureP75: percentile(sM, 75),
      moistureP90: percentile(sM, 90),
      yearsCount: b.lars.length,
    });
  }

  return { dailySeries, percentiles: percentileRows };
}

module.exports = {
  PASTURE_PARAMS,
  SOIL_PARAMS,
  MAX_SOLAR_BY_MONTH,
  calcTMean,
  calcTempLAR,
  calcMaxTempLAR,
  calcSolarFactor,
  calcWaterloggingFactor,
  calcMoistureFactor,
  calcSoilWater,
  calcActualLAR,
  calcInstantRoundLength,
  calcTrueRoundLength,
  calcProjectedRoundLength,
  dateToDayOfYear,
  percentile,
  processHistoricalData,
};
