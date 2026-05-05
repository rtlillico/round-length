// round-length/backend/silo.js
// SILO climate data API client.
// Fetches daily climate data for a given lat/lon and date range.

'use strict';

const https = require('https');

const SILO_BASE = 'https://www.longpaddock.qld.gov.au/cgi-bin/silo/DataDrillDataset.php';

// Variables to fetch: Rain, Tmax, Tmin, radiation, vapour pressure, Morton wet ET
const SILO_COMMENT = 'RXNJVW';

/**
 * Fetch SILO data for a location and date range.
 * Returns parsed array of daily rows.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string} startDate - YYYYMMDD
 * @param {string} endDate   - YYYYMMDD
 * @param {string} email     - SILO requires a valid email address
 * @returns {Promise<Array<{date, max_temp, min_temp, radiation, daily_rain, vp, et_morton_wet}>>}
 */
async function fetchSILO(lat, lon, startDate, endDate, email) {
  const url = `${SILO_BASE}?lat=${lat}&lon=${lon}&start=${startDate}&finish=${endDate}&format=json&username=${encodeURIComponent(email)}&comment=${SILO_COMMENT}`;

  const raw = await httpGet(url);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`SILO returned non-JSON response: ${raw.slice(0, 200)}`);
  }

  if (!parsed.data || !Array.isArray(parsed.data)) {
    throw new Error(`SILO response missing data array: ${JSON.stringify(parsed).slice(0, 200)}`);
  }

  // Parse each daily row into a flat object
  return parsed.data.map((day) => {
    const vars = {};
    for (const v of day.variables) {
      vars[v.variable_code] = v.value;
    }
    return {
      date:           day.date,
      max_temp:       vars.max_temp       ?? null,
      min_temp:       vars.min_temp       ?? null,
      radiation:      vars.radiation      ?? null,
      daily_rain:     vars.daily_rain     ?? null,
      vp:             vars.vp             ?? null,
      et_morton_wet:  vars.et_morton_wet  ?? null,
    };
  });
}

/**
 * Format a Date as YYYYMMDD for SILO requests.
 * @param {Date} date
 * @returns {string}
 */
function formatSILODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Get yesterday's date as YYYYMMDD.
 * SILO data is available up to yesterday.
 * @returns {string}
 */
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatSILODate(d);
}

/**
 * Earliest SILO date to fetch — starting 1 January 1970.
 */
const SILO_START = '19700101';

/**
 * Simple HTTPS GET — returns response body as string.
 * @param {string} url
 * @returns {Promise<string>}
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from SILO`));
        } else {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

module.exports = { fetchSILO, formatSILODate, yesterday, SILO_START };
