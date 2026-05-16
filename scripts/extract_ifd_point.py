"""
extract_ifd_point.py
Extracts BOM IFD rainfall depth values for a single lat/lon point.
Reads from local 1°x1° tile ZIPs in IFD_GRIDS_DIR.

Usage:
    python extract_ifd_point.py <lat> <lon>
    python extract_ifd_point.py -40.85 145.12

Output:
    ifd_<lat>_<lon>.json  — all 261 depth values ready to upload to the app
"""

import zipfile
import os
import json
import math
import sys
import re

IFD_GRIDS_DIR = r"C:\runoffData\ifd_grids"


def get_tile_path(lat, lon):
    lat_s = math.floor(abs(lat))
    lat_n = lat_s + 1
    lon_w = math.floor(lon)
    lon_e = lon_w + 1
    name = f"IFD_S{lat_s}-{lat_n}_E{lon_w}-{lon_e}.zip"
    return os.path.join(IFD_GRIDS_DIR, name), name


def parse_esri_ascii(text):
    """Return (header dict, 2-D list of floats). Rows are top-to-bottom."""
    lines = text.strip().splitlines()
    header = {}
    i = 0
    for i, line in enumerate(lines):
        parts = line.strip().split(None, 1)
        if len(parts) == 2 and re.match(r'^[a-zA-Z]', parts[0]):
            header[parts[0].lower()] = float(parts[1])
        else:
            break
    grid = []
    for line in lines[i:]:
        row = [float(v) for v in line.split()]
        if row:
            grid.append(row)
    return header, grid


def cell_value(header, grid, lat, lon):
    """Bilinear lookup — returns the nearest grid cell value."""
    cs     = header['cellsize']
    xll    = header['xllcorner']
    yll    = header['yllcorner']
    nrows  = int(round(header['nrows']))
    ncols  = int(round(header['ncols']))
    nodata = header.get('nodata_value', -9999)

    col           = int((lon - xll) / cs)
    row_from_bot  = int((lat - yll) / cs)
    row_from_top  = nrows - 1 - row_from_bot

    col          = max(0, min(col, ncols - 1))
    row_from_top = max(0, min(row_from_top, nrows - 1))

    val = grid[row_from_top][col]
    return None if val == nodata else round(val, 3)


def parse_filename(fname):
    """
    Extract (duration_min, aep_pct) from filenames like:
        catchment_depth_60min_50aep.txt.asc
        catchment_depth_18.127min_1aep.txt.asc   (unlikely but handled)
        catchment_depth_60min_18.127aep.txt.asc
        catchment_depth_60min_18p127aep.txt.asc
    Returns (int, float) or (None, None).
    """
    m = re.search(r'_(\d+)min_([0-9p.]+)aep', fname, re.IGNORECASE)
    if not m:
        return None, None
    dur = int(m.group(1))
    aep_raw = m.group(2).replace('p', '.')
    try:
        aep = float(aep_raw) / 1000.0  # filenames encode AEP% × 1000
    except ValueError:
        return None, None
    return dur, aep


def extract(lat, lon):
    zip_path, tile_name = get_tile_path(lat, lon)
    if not os.path.exists(zip_path):
        raise FileNotFoundError(
            f"Tile not found: {zip_path}\n"
            f"Check that IFD_GRIDS_DIR is correct and the tile exists."
        )

    print(f"Tile: {tile_name}")
    result = {"lat": lat, "lon": lon, "tile": tile_name, "depths": {}}

    with zipfile.ZipFile(zip_path, 'r') as zf:
        asc_files = sorted(f for f in zf.namelist() if f.lower().endswith('.asc'))
        print(f"Grid files found: {len(asc_files)}")

        for fname in asc_files:
            dur, aep = parse_filename(fname)
            if dur is None:
                print(f"  [skip] unrecognised filename: {fname}")
                continue

            with zf.open(fname) as fh:
                text = fh.read().decode('utf-8', errors='replace')

            header, grid = parse_esri_ascii(text)
            val = cell_value(header, grid, lat, lon)

            dur_key = str(dur)
            if dur_key not in result["depths"]:
                result["depths"][dur_key] = {}
            result["depths"][dur_key][str(aep)] = val

    # Sort durations numerically
    result["depths"] = {
        k: result["depths"][k]
        for k in sorted(result["depths"], key=int)
    }

    return result


def main():
    import argparse
    parser = argparse.ArgumentParser(
        description='Extract BOM IFD rainfall depth values for a single lat/lon point.'
    )
    parser.add_argument('lat', type=float, help='Latitude (negative for south)')
    parser.add_argument('lon', type=float, help='Longitude')
    parser.add_argument('--zip-dir', metavar='DIR', default=None,
                        help='Directory containing IFD ZIP files (overrides IFD_GRIDS_DIR in script)')
    parser.add_argument('--stdout', action='store_true',
                        help='Print JSON to stdout; send log messages to stderr')
    args = parser.parse_args()

    global IFD_GRIDS_DIR
    if args.zip_dir:
        IFD_GRIDS_DIR = args.zip_dir

    lat, lon = args.lat, args.lon
    # When --stdout is set, logs go to stderr so stdout is pure JSON
    out_log = sys.stderr if args.stdout else sys.stdout
    log = lambda *a: print(*a, file=out_log)

    log(f"Extracting IFD point for lat={lat}, lon={lon} ...")
    data = extract(lat, lon)

    durations = sorted(data["depths"].keys(), key=int)
    aeps      = sorted(next(iter(data["depths"].values())).keys(), key=float)
    log(f"Durations extracted : {[int(d) for d in durations]}")
    log(f"AEPs extracted      : {[float(a) for a in aeps]}")
    log(f"Total values        : {sum(len(v) for v in data['depths'].values())}")

    if "1440" in data["depths"]:
        log("\n24-hour depths (mm):")
        for aep, depth in sorted(data["depths"]["1440"].items(), key=lambda x: float(x[0])):
            log(f"  {float(aep):7.3f}% AEP  →  {depth} mm")

    if args.stdout:
        print(json.dumps(data))
    else:
        out = f"ifd_{lat}_{lon}.json"
        with open(out, 'w') as f:
            json.dump(data, f, indent=2)
        log(f"\nSaved: {out}")


if __name__ == "__main__":
    main()
