// round-length/backend/lib/ifd.js
// Calls the Python extraction script to get BOM IFD point data for a lat/lon.
// Set IFD_ZIP_DIR in .env to the directory containing the IFD ZIP files.

'use strict';

const { execFile } = require('child_process');
const path = require('path');

const SCRIPT  = path.join(__dirname, '../../scripts/extract_ifd_point.py');
const ZIP_DIR = process.env.IFD_ZIP_DIR || null;
const PYTHON  = process.env.IFD_PYTHON  || 'python3';

/**
 * Extract IFD point data for a lat/lon using the Python script.
 * Returns the parsed JSON object, or null if IFD_ZIP_DIR is not configured
 * or the tile is not found for this location.
 */
async function extractIFDPoint(lat, lon) {
  if (!ZIP_DIR) {
    console.log('[ifd] IFD_ZIP_DIR not set — skipping IFD extraction');
    return null;
  }

  return new Promise((resolve, reject) => {
    const args = [SCRIPT, String(lat), String(lon), '--zip-dir', ZIP_DIR, '--stdout'];
    execFile(PYTHON, args, { maxBuffer: 5 * 1024 * 1024, timeout: 30_000 }, (err, stdout, stderr) => {
      if (stderr) console.log('[ifd]', stderr.trim());
      if (err) {
        console.error('[ifd] Extraction failed:', err.message);
        return reject(err);
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (e) {
        reject(new Error(`[ifd] Could not parse output: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

module.exports = { extractIFDPoint };
