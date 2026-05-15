// round-length/frontend/src/lib/formula.js
// Mirror of backend/lib/formula.js — keep in sync.
// Used for instant UI feedback without waiting for an API call.

// Monthly maximum solar radiation (MJ/m²/day) for Smithton Tasmania (lat -40.85).
// Index 0 = January, index 11 = December.
export const MAX_SOLAR_BY_MONTH = [28, 25, 20, 14, 9, 7, 7, 10, 15, 20, 25, 27];

export const PASTURE_PARAMS = {
  perennialRyegrass: { name: 'Perennial ryegrass', baseTemp: 5,  optimumTemp: 22, ceilingTemp: 35, phyllochron: 100, region: 'Temperate' },
  annualRyegrass:    { name: 'Annual ryegrass',    baseTemp: 4,  optimumTemp: 23, ceilingTemp: 35, phyllochron: 95,  region: 'Temperate' },
  tallFescue:        { name: 'Tall fescue',        baseTemp: 5,  optimumTemp: 24, ceilingTemp: 38, phyllochron: 110, region: 'Temperate' },
  cocksfoot:         { name: 'Cocksfoot',           baseTemp: 4,  optimumTemp: 24, ceilingTemp: 38, phyllochron: 105, region: 'Temperate' },
  phalaris:          { name: 'Phalaris',            baseTemp: 4,  optimumTemp: 20, ceilingTemp: 36, phyllochron: 100, region: 'Temperate' },
  kikuyu:            { name: 'Kikuyu',              baseTemp: 10, optimumTemp: 32, ceilingTemp: 45, phyllochron: 85,  region: 'Subtropical' },
  rhodesGrass:       { name: 'Rhodes grass',        baseTemp: 12, optimumTemp: 33, ceilingTemp: 45, phyllochron: 80,  region: 'Tropical' },
};

export function calcTMean(tMax, tMin) {
  return (tMax + tMin) / 2;
}

export function calcTempLAR(tMean, pastureKey) {
  const p = PASTURE_PARAMS[pastureKey];
  if (!p) throw new Error(`Unknown pasture: ${pastureKey}`);
  const maxLAR = (p.optimumTemp - p.baseTemp) / p.phyllochron;
  if (tMean < p.baseTemp)    return 0;
  if (tMean < p.optimumTemp) return (tMean - p.baseTemp) / p.phyllochron;
  if (tMean < p.ceilingTemp) return maxLAR * (p.ceilingTemp - tMean) / (p.ceilingTemp - p.optimumTemp);
  return 0;
}

export function calcMaxTempLAR(pastureKey) {
  const p = PASTURE_PARAMS[pastureKey];
  return (p.optimumTemp - p.baseTemp) / p.phyllochron;
}

export function calcInstantRoundLength(tempLAR, targetLeaves) {
  if (tempLAR <= 0) return Infinity;
  return targetLeaves / tempLAR;
}

export const SOIL_PARAMS = {
  sand:      { name: 'Sand',        SWmax: 18, drainageRate: 0.90, infiltrationRate: 25 },
  sandyLoam: { name: 'Sandy loam',  SWmax: 30, drainageRate: 0.60, infiltrationRate: 15 },
  sandyClay: { name: 'Sandy clay',  SWmax: 35, drainageRate: 0.40, infiltrationRate: 10 },
  clay:      { name: 'Clay',        SWmax: 45, drainageRate: 0.20, infiltrationRate:  5 },
  peat:      { name: 'Peat',        SWmax: 75, drainageRate: 0.50, infiltrationRate: 20 },
};

const WATERLOGGING_THRESHOLDS = {
  sand:      { severe: 0.99, severeF: 0.70, moderate: 0.95, moderateF: 0.85 },
  sandyLoam: { severe: 0.95, severeF: 0.50, moderate: 0.90, moderateF: 0.75 },
  sandyClay: { severe: 0.92, severeF: 0.40, moderate: 0.85, moderateF: 0.65 },
  clay:      { severe: 0.88, severeF: 0.30, moderate: 0.80, moderateF: 0.55 },
  peat:      { severe: 0.92, severeF: 0.55, moderate: 0.85, moderateF: 0.70 },
};

export function calcSolarFactor(radiation, month) {
  if (radiation == null || radiation < 0) return null;
  return Math.min(1, radiation / MAX_SOLAR_BY_MONTH[month]);
}

export function calcWaterloggingFactor(SW, SWmax, soilType) {
  const t = WATERLOGGING_THRESHOLDS[soilType] || WATERLOGGING_THRESHOLDS.sandyLoam;
  if (SW >= SWmax * t.severe)   return t.severeF;
  if (SW >= SWmax * t.moderate) return t.moderateF;
  return 1.0;
}

export function calcMoistureFactor(SW, SWmax, soilType) {
  const waterlogging = calcWaterloggingFactor(SW, SWmax, soilType);
  return Math.min(1, SW / (SWmax * 0.5)) * waterlogging;
}

export function calcActualLAR(tMean, radiation, month, pastureKey, moistureFactor = 1.0) {
  const tempLAR    = calcTempLAR(tMean, pastureKey);
  const solarFactor = calcSolarFactor(radiation, month);
  if (solarFactor == null) return { tempLAR, solarFactor: null, actualLAR: tempLAR * moistureFactor };
  return { tempLAR, solarFactor, actualLAR: tempLAR * solarFactor * moistureFactor };
}

export function dateToDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  let doy = Math.floor(diff / oneDay);
  const isLeap = date.getFullYear() % 4 === 0 &&
    (date.getFullYear() % 100 !== 0 || date.getFullYear() % 400 === 0);
  if (isLeap && doy > 59) doy--;
  return Math.min(doy, 365);
}
