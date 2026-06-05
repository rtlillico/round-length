// round-length/frontend/src/pages/TemperatureScreen.jsx
import { useState, useMemo, useRef, useEffect } from 'react';
import { C, styles } from '../App';
import { PASTURE_PARAMS, dateToDayOfYear, calcTempLAR } from '../lib/formula';
import {
  Chart, BarController, LineController, LinearScale, CategoryScale,
  BarElement, LineElement, PointElement, Filler, Tooltip,
} from 'chart.js';
import {
  ScenarioBanner, NavLinks, FormulaBtn, FormulaBox, ToggleBar, Legend,
} from '../components/SeasonUI';

Chart.register(BarController, LineController, LinearScale, CategoryScale, BarElement, LineElement, PointElement, Filler, Tooltip);

const N = 730, TODAY = 365;
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PILLS = [{ label: '1M', w: 30 }, { label: '4M', w: 120 }, { label: '8M', w: 240 }, { label: 'Full', w: 730 }];

function fmtDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}
function fmtDayFull(dateStr) {
  if (!dateStr) return '';
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(-2)}`;
}

function buildTickLabels(dates) {
  return dates.map(dateStr => {
    const d = new Date(dateStr + 'T00:00:00Z');
    if (d.getUTCDate() === 1) {
      const mon = MO[d.getUTCMonth()];
      return d.getUTCMonth() === 0 ? `${mon} '${String(d.getUTCFullYear()).slice(-2)}` : mon;
    }
    if (d.getUTCDay() === 0) return String(d.getUTCDate());
    return '';
  });
}

function buildArrays(chartData, targetLeaves, pastureKey) {
  const now = new Date();
  const dates = new Array(N);
  for (let i = 0; i < N; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() + (i - TODAY));
    dates[i] = d.toISOString().slice(0, 10);
  }

  const larData   = new Array(N).fill(null);
  const larP10    = new Array(N).fill(null);
  const larP25    = new Array(N).fill(null);
  const larP50    = new Array(N).fill(null);
  const larP75    = new Array(N).fill(null);
  const larP90    = new Array(N).fill(null);
  const roundData = new Array(N).fill(null);
  const roundP50  = new Array(N).fill(null);
  const tMaxData  = new Array(N).fill(null);
  const tMeanData = new Array(N).fill(null);
  const tMinData  = new Array(N).fill(null);

  if (!chartData) return { dates, larData, larP10, larP25, larP50, larP75, larP90, roundData, roundP50, tMaxData, tMeanData, tMinData, lastActual: -1 };

  const percByDoy = {};
  for (const p of (chartData.percentiles || [])) percByDoy[p.day_of_year] = p;

  const projByDate = {};
  for (const r of (chartData.projected?.series || [])) projByDate[r.date] = r;

  const allActual      = [...(chartData.actual || [])].sort((a, b) => a.date < b.date ? -1 : 1);
  const actualTempLARs = allActual.map(r => Number(r.temp_lar ?? 0));
  const actualIdx      = {};
  for (let i = 0; i < allActual.length; i++) actualIdx[allActual[i].date?.slice(0, 10)] = i;

  // Populate percentile bands for ALL days (independent of SILO data availability)
  for (let i = 0; i < N; i++) {
    const doy  = dateToDayOfYear(new Date(dates[i] + 'T00:00:00Z'));
    const perc = percByDoy[doy] || {};
    larP10[i] = perc.temp_p10 != null ? calcTempLAR(Number(perc.temp_p10), pastureKey) : null;
    larP25[i] = perc.temp_p25 != null ? calcTempLAR(Number(perc.temp_p25), pastureKey) : null;
    larP50[i] = perc.temp_p50 != null ? calcTempLAR(Number(perc.temp_p50), pastureKey) : null;
    larP75[i] = perc.temp_p75 != null ? calcTempLAR(Number(perc.temp_p75), pastureKey) : null;
    larP90[i] = perc.temp_p90 != null ? calcTempLAR(Number(perc.temp_p90), pastureKey) : null;
  }

  let lastActual = -1;
  for (let i = 0; i <= TODAY; i++) {
    const ds  = dates[i];
    const ai  = actualIdx[ds];
    if (ai == null) continue;
    lastActual = i;
    const row = allActual[ai];

    larData[i]   = row.temp_lar != null ? Number(row.temp_lar) : null;
    tMaxData[i]  = row.t_max   != null ? Number(row.t_max)    : null;
    tMeanData[i] = row.t_mean  != null ? Number(row.t_mean)   : null;
    tMinData[i]  = row.t_min   != null ? Number(row.t_min)    : null;

    let sum = 0, days = 0;
    for (let j = ai; j >= 0; j--) { sum += actualTempLARs[j]; days++; if (sum >= targetLeaves) { roundData[i] = days; break; } }
    if (roundData[i] == null) roundData[i] = days;
  }

  // Compute roundP50 from larP50 (temp-only P50 LAR) using same backward-accumulation as roundData
  for (let i = 0; i < N; i++) {
    let sum = 0, days = 0;
    for (let j = i; j >= 0; j--) {
      const v = larP50[j];
      if (v != null) { sum += v; days++; }
      if (sum >= targetLeaves) { roundP50[i] = days; break; }
      if (days >= 365) { roundP50[i] = 365; break; }
    }
    if (roundP50[i] == null) roundP50[i] = days || null;
  }

  return { dates, larData, larP10, larP25, larP50, larP75, larP90, roundData, roundP50, tMaxData, tMeanData, tMinData, lastActual };
}

const toXY = (arr) => arr.map((v, i) => v != null ? { x: i, y: v } : null).filter(Boolean);
const toXYWin = (arr, s, e) => { const r = []; for (let i = s; i <= e; i++) { if (arr[i] != null) r.push({ x: i, y: arr[i] }); } return r; };
// Centered moving average — returns same-length array, nulls excluded from window
const smooth = (arr, w) => {
  const half = Math.floor(w / 2);
  return arr.map((_, i) => {
    const vals = [];
    for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) {
      if (arr[j] != null && isFinite(arr[j])) vals.push(arr[j]);
    }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  });
};

function clampWin(start, width) {
  let end = start + width - 1;
  if (start < 0) { start = 0; end = width - 1; }
  if (end > N - 1) { end = N - 1; start = Math.max(0, end - width + 1); }
  return { start, end };
}

// ── static overlay styles ──────────────────────────────────────────────────────
const S = {
  dim:    { position: 'absolute', top: 0, bottom: 0, background: 'rgba(245,240,232,0.78)', pointerEvents: 'none' },
  band:   { position: 'absolute', top: 0, bottom: 0, borderLeft: '2px solid #3a6b1a', borderRight: '2px solid #3a6b1a', pointerEvents: 'none' },
  scrub:  { position: 'absolute', top: 0, bottom: 0, width: 2, background: '#2d4a1e', pointerEvents: 'none', zIndex: 5 },
  sDot:   { width: 10, height: 10, borderRadius: '50%', background: '#2d4a1e', border: '2px solid #f5fae8', marginLeft: -4 },
  todayL: { position: 'absolute', top: 0, bottom: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7, pointerEvents: 'none' },
  todayP: { position: 'absolute', top: 3, transform: 'translateX(-50%)', background: '#3a6b1a', color: '#fff', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 8, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 },
  edge:   { position: 'absolute', top: 0, bottom: 0, width: 18, cursor: 'ew-resize', zIndex: 6, touchAction: 'none' },
  ePill:  { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 5, height: 30, background: '#3a6b1a', border: '1.5px solid #fff', borderRadius: 3, boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
};

// ── TemperatureScreen ──────────────────────────────────────────────────────────
export default function TemperatureScreen({ scenario, chartData, loading, onNavigate, onGoToScenarios }) {
  const [fTemp,   setFTemp]  = useState(false);
  const [infoRL,  setInfoRL]  = useState(false);
  const [infoLAR, setInfoLAR] = useState(false);
  const [visC1,   setVisC1]  = useState({ tempLAR: true, tempRound: true });
  const [visC2,   setVisC2]  = useState({ tMax: true, tMean: true, tMin: true });
  const [pill,    setPill]   = useState(120);
  const [winInfo, setWinInfo] = useState(null);  // { start, end }
  const [ctr1,    setCtr1]   = useState(null);
  const [ctr2,    setCtr2]   = useState(null);
  const [expandCtr1, setExpandCtr1] = useState(false);
  const [ctrPc, setCtrPc] = useState(null);
  const [expandCtrPc, setExpandCtrPc] = useState(false);
  const [showPct, setShowPct] = useState(false);
  const showPctRef = useRef(false);
  const [visPcBands, setVisPcBands] = useState({ p50: true, p2575: true, p1090: true });
  const vPcRef = useRef({ p50: true, p2575: true, p1090: true });

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const pasture = PASTURE_PARAMS[scenario.pasture_key];
  const target  = Number(scenario.target_leaves);
  const st      = scenario.todayState;
  const tMean   = st?.t_mean   != null ? Number(st.t_mean)   : null;
  const tMin    = st?.t_min    != null ? Number(st.t_min)    : null;
  const tMax    = st?.t_max    != null ? Number(st.t_max)    : null;
  const tLAR    = st?.temp_lar != null ? Number(st.temp_lar) : null;

  const arrays  = useMemo(() => buildArrays(chartData, target, scenario.pasture_key), [chartData, target, scenario.pasture_key]);
  const tLabels = useMemo(() => buildTickLabels(arrays.dates), [arrays.dates]);

  // mutable refs for perf-sensitive state
  const winRef  = useRef({ width: 120, start: TODAY - 60 });
  const panM    = useRef(null);
  const panZ    = useRef(null);
  const edgeR   = useRef(null);
  const arrRef  = useRef(arrays);
  const tlRef   = useRef(tLabels);
  const v1Ref   = useRef(visC1);
  const v2Ref   = useRef(visC2);
  useEffect(() => { arrRef.current = arrays;  }, [arrays]);
  useEffect(() => { tlRef.current  = tLabels; }, [tLabels]);
  useEffect(() => { v1Ref.current  = visC1;   }, [visC1]);
  useEffect(() => { v2Ref.current  = visC2;   }, [visC2]);
  useEffect(() => { showPctRef.current = showPct; }, [showPct]);
  useEffect(() => { vPcRef.current = visPcBands; }, [visPcBands]);

  // chart instances
  const mC1 = useRef(null), zC1 = useRef(null);
  const mC2 = useRef(null), zC2 = useRef(null);

  // canvas elements
  const mCv1 = useRef(null), zCv1 = useRef(null);
  const mCv2 = useRef(null), zCv2 = useRef(null);

  // container elements (for width measurement)
  const mCt1 = useRef(null), zCt1 = useRef(null);
  const mCt2 = useRef(null), zCt2 = useRef(null);

  // overlay elements — card 1
  const sdl1 = useRef(null), sdr1 = useRef(null), sb1 = useRef(null);
  const seL1 = useRef(null), seR1 = useRef(null);
  const scM1 = useRef(null), scZ1 = useRef(null);
  const tL1  = useRef(null), tP1  = useRef(null);

  // overlay elements — card 2
  const sdl2 = useRef(null), sdr2 = useRef(null), sb2 = useRef(null);
  const seL2 = useRef(null), seR2 = useRef(null);
  const scM2 = useRef(null), scZ2 = useRef(null);
  const tL2  = useRef(null), tP2  = useRef(null);
  const tLZ1 = useRef(null), tLZ2 = useRef(null);

  // percentile card refs
  const pcZC1 = useRef(null), pcMC1 = useRef(null);
  const pcZCv1 = useRef(null), pcMCv1 = useRef(null);
  const pcZCt1 = useRef(null), pcMCt1 = useRef(null);
  const pcSdl1 = useRef(null), pcSb1 = useRef(null), pcSdr1 = useRef(null);
  const pcSeL1 = useRef(null), pcSeR1 = useRef(null);
  const pcScM1 = useRef(null), pcScZ1 = useRef(null);
  const pcTL1  = useRef(null), pcTLZ1 = useRef(null);

  // ── x-scale configs ───────────────────────────────────────────────────────────
  function xMain() {
    const tl = tlRef.current;
    return {
      type: 'linear', min: 0, max: N - 1,
      ticks: {
        autoSkip: false, maxRotation: 0, padding: 2, color: '#5a6f48', font: { size: 9 },
        callback(val) { const i = Math.round(val); return (i >= 0 && i < tl.length && tl[i]) ? tl[i] : null; },
      },
      afterBuildTicks(sc) {
        const all  = sc.ticks.filter(t => { const i = Math.round(t.value); return i >= 0 && i < tl.length && tl[i]; });
        const ppd  = ((sc.right ?? 300) - (sc.left ?? 0) || 300) / N;
        const gap  = Math.max(2, Math.ceil(30 / ppd));
        const mSet = new Set(all.map(t => Math.round(t.value)).filter(i => { const l = tl[i]; return l && (l.length > 2 || isNaN(Number(l))); }));
        sc.ticks = all.filter(t => {
          const i = Math.round(t.value); const l = tl[i] || '';
          if (l.length > 2 || isNaN(Number(l))) return true;
          for (const mi of mSet) { if (Math.abs(i - mi) < gap) return false; }
          return true;
        });
      },
      grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false },
    };
  }

  function xMainPast() {
    const tl = tlRef.current;
    return {
      type: 'linear', min: 0, max: TODAY,
      ticks: {
        autoSkip: false, maxRotation: 0, padding: 2, color: '#5a6f48', font: { size: 9 },
        callback(val) { const i = Math.round(val); return (i >= 0 && i <= TODAY && tl[i]) ? tl[i] : null; },
      },
      afterBuildTicks(sc) {
        const all  = sc.ticks.filter(t => { const i = Math.round(t.value); return i >= 0 && i <= TODAY && tl[i]; });
        const ppd  = ((sc.right ?? 300) - (sc.left ?? 0) || 300) / TODAY;
        const gap  = Math.max(2, Math.ceil(30 / ppd));
        const mSet = new Set(all.map(t => Math.round(t.value)).filter(i => { const l = tl[i]; return l && (l.length > 2 || isNaN(Number(l))); }));
        sc.ticks = all.filter(t => {
          const i = Math.round(t.value); const l = tl[i] || '';
          if (l.length > 2 || isNaN(Number(l))) return true;
          for (const mi of mSet) { if (Math.abs(i - mi) < gap) return false; }
          return true;
        });
      },
      grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false },
    };
  }
  function xZoom(xMin, xMax) {
    const tl = tlRef.current;
    const span = xMax - xMin;
    return {
      type: 'linear', min: xMin, max: xMax, offset: false,
      ticks: {
        autoSkip: false, maxRotation: 0, padding: 2, color: '#5a6f48', font: { size: 10 },
        callback(val) { const i = Math.round(val); return (i >= 0 && i < tl.length && tl[i]) ? tl[i] : null; },
      },
      afterBuildTicks(sc) {
        const isYearStart  = l => l && l.includes("'");
        const isMonthStart = l => l && isNaN(Number(l));
        const yearTicks = [], months = [], weeks = [];
        for (let i = Math.floor(sc.min); i <= Math.ceil(sc.max); i++) {
          const l = tl[i];
          if (!l) continue;
          if (isYearStart(l)) yearTicks.push(i);
          else if (isMonthStart(l)) months.push(i);
          else weeks.push(i);
        }
        // For short spans use weekly ticks; for longer use month-starts only
        const pool = (span <= 45 || months.length < 3)
          ? [...yearTicks, ...months, ...weeks].sort((a, b) => a - b)
          : months;
        // Thin to ~5 ticks
        const target = 5;
        let chosen = pool;
        if (pool.length > target) {
          const step = Math.ceil(pool.length / target);
          chosen = pool.filter((_, idx) => idx % step === 0);
        }
        // Always include year-boundary ticks regardless of thinning
        const chosenSet = new Set(chosen);
        yearTicks.forEach(i => chosenSet.add(i));
        sc.ticks = [...chosenSet].sort((a, b) => a - b).map(v => ({ value: v }));
      },
      grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false },
    };
  }

  // Tick callback: appends a unit label below the top tick value
  const withUnit = (unit) => (val, idx, ticks) => idx === ticks.length - 1 ? [unit, val] : val;
  // Factory functions — Chart.js mutates scale objects internally, so never reuse across charts
  // Max from full dataset so axis doesn't rescale while panning
  function mkYL() {
    const { roundData, roundP50 } = arrRef.current;
    const v = v1Ref.current;
    const vals = [
      ...(v.tempRound ? roundData : []),
      ...(v.tempRound ? roundP50 : []),
    ].filter(x => x != null && isFinite(x) && x > 0);
    const rawMax = vals.length ? Math.max(...vals) : 80;
    const step = rawMax > 50 ? 20 : rawMax > 20 ? 10 : 5;
    const max = Math.ceil(rawMax / step) * step;
    return { type: 'linear', position: 'left', min: 0, max, ticks: { color: '#c47a12', font: { size: 9 }, maxTicksLimit: 5, callback: withUnit('days') }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } };
  }
  const mkYR = () => ({ type: 'linear', position: 'right', ticks: { color: '#4aa8d8', font: { size: 9 }, maxTicksLimit: 5, callback: withUnit('LAR')  }, grid: { display: false }, border: { display: false } });
  const mkYS = () => ({                                     ticks: { color: '#5a6f48', font: { size: 9 }, maxTicksLimit: 4, callback: withUnit('°C')   }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } });
  function mkYRZoom() {
    const { larData, larP50 } = arrRef.current;
    const vals = [...larData, ...larP50].filter(v => v != null && isFinite(v) && v > 0);
    const rawMax = vals.length ? Math.max(...vals) : 0.15;
    const max = Math.ceil(rawMax * 20) / 20;
    return { type: 'linear', position: 'right', min: 0, max, ticks: { color: '#4aa8d8', font: { size: 9 }, maxTicksLimit: 3, callback: withUnit('LAR') }, grid: { display: false }, border: { display: false } };
  }
  function mkYRpc() {
    const { larData, larP90 } = arrRef.current;
    const vals = [...larData, ...(larP90 || [])].filter(v => v != null && isFinite(v) && v > 0);
    const rawMax = vals.length ? Math.max(...vals) : 0.15;
    const max = Math.ceil(rawMax * 20) / 20;
    return { type: 'linear', position: 'right', min: 0, max, ticks: { color: '#4aa8d8', font: { size: 9 }, maxTicksLimit: 4, callback: withUnit('LAR') }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } };
  }

  // ── dataset builders ─────────────────────────────────────────────────────────
  function ds1main() {
    const { larData, larP50, roundData, roundP50, lastActual } = arrRef.current;
    const clip = lastActual >= 0 ? lastActual : TODAY;
    const v = v1Ref.current; const ds = [];
    // Main chart always shows 730 days — use a wide window to smooth out daily noise
    if (v.tempLAR)   ds.push({ type: 'line', data: toXY(smooth(larData, 60).map((v, i) => i <= clip ? v : null)), borderColor: '#4aa8d8', borderWidth: 1.4, pointRadius: 0, tension: 0, yAxisID: 'yR' });
    if (v.tempLAR)   ds.push({ type: 'line', data: toXY(smooth(larP50, 30)),                                       borderColor: '#4aa8d8', borderWidth: 0.8, pointRadius: 0, borderDash: [8, 4], yAxisID: 'yR' });
    if (v.tempRound) ds.push({ type: 'line', data: toXY(smooth(roundData, 60).map((v, i) => i <= clip ? v : null)), borderColor: '#c47a12', borderWidth: 1.4, pointRadius: 0, tension: 0, yAxisID: 'yL' });
    if (v.tempRound) ds.push({ type: 'line', data: toXY(smooth(roundP50, 30)),                                      borderColor: '#c47a12', borderWidth: 0.8, pointRadius: 0, borderDash: [6, 3], yAxisID: 'yL' });
    return ds;
  }
  function buildPcBandDatasets({ isMain, win }) {
    const { larData, larP10, larP25, larP50, larP75, larP90, lastActual } = arrRef.current;
    const clip = lastActual >= 0 ? lastActual : TODAY;
    const v = vPcRef.current;
    let toData, toActual;
    if (isMain) {
      const sw = 60;
      toData   = arr => toXY(smooth(arr, sw));
      toActual = arr => toXY(smooth(arr, 90).map((x, i) => i <= clip ? x : null));
    } else {
      const span = win.end - win.start + 1;
      const sw = Math.min(60, Math.max(14, Math.round(span / 6)));
      toData   = arr => toXYWin(smooth(arr, sw), win.start, win.end);
      toActual = arr => toXYWin(smooth(arr, sw).map((x, i) => i <= clip ? x : null), win.start, win.end);
    }
    const ds = [];
    if (v.p1090) {
      const i0 = ds.length;
      ds.push({ type: 'line', data: toData(larP10), borderWidth: 0, pointRadius: 0, fill: false, yAxisID: 'yR' });
      ds.push({ type: 'line', data: toData(larP90), borderWidth: 0, pointRadius: 0, fill: { target: i0 }, backgroundColor: 'rgba(74,168,216,0.12)', yAxisID: 'yR' });
    }
    if (v.p2575) {
      const i0 = ds.length;
      ds.push({ type: 'line', data: toData(larP25), borderWidth: 0, pointRadius: 0, fill: false, yAxisID: 'yR' });
      ds.push({ type: 'line', data: toData(larP75), borderWidth: 0, pointRadius: 0, fill: { target: i0 }, backgroundColor: 'rgba(74,168,216,0.25)', yAxisID: 'yR' });
    }
    if (v.p50) {
      ds.push({ type: 'line', data: toData(larP50), borderColor: '#4aa8d8', borderWidth: 1.5, borderDash: [6, 3], pointRadius: 0, fill: false, yAxisID: 'yR' });
    }
    ds.push({ type: 'line', data: toActual(larData), borderColor: '#1a4a7a', borderWidth: 2, pointRadius: 0, fill: false, yAxisID: 'yR' });
    return ds;
  }
  function ds2main() {
    const { tMaxData, tMeanData, tMinData } = arrRef.current;
    const v = v2Ref.current; const ds = [];
    if (v.tMax)  ds.push({ type: 'line', data: toXY(tMaxData),  borderColor: '#c43a2a', borderWidth: 1.2, pointRadius: 0, tension: 0.2 });
    if (v.tMean) ds.push({ type: 'line', data: toXY(tMeanData), borderColor: '#c47a12', borderWidth: 1.5, pointRadius: 0, tension: 0.2 });
    if (v.tMin)  ds.push({ type: 'line', data: toXY(tMinData),  borderColor: '#2a6a9e', borderWidth: 1.2, pointRadius: 0, tension: 0.2 });
    return ds;
  }
  function ds1zoom(win, pw) {
    const { larData, larP50, roundData, roundP50, lastActual } = arrRef.current;
    const clip = lastActual >= 0 ? lastActual : TODAY;
    const span = win.end - win.start + 1; const bars = span < 60;
    const bt = Math.max(2, Math.floor((pw / span) * 0.82));
    // Scale smoothing window to the visible span so wider views stay smooth
    const sw = Math.min(60, Math.max(14, Math.round(span / 6)));
    const v = v1Ref.current; const ds = [];
    if (v.tempLAR) ds.push(bars
      ? { type: 'bar',  data: toXYWin(larData, win.start, win.end), backgroundColor: 'rgba(74,168,216,0.45)', borderWidth: 0, barThickness: bt, yAxisID: 'yR' }
      : { type: 'line', data: toXYWin(smooth(larData, sw).map((v, i) => i <= clip ? v : null), win.start, win.end), borderColor: '#4aa8d8', borderWidth: 2, pointRadius: 0, tension: 0, yAxisID: 'yR' });
    if (v.tempLAR) ds.push({ type: 'line', data: toXYWin(smooth(larP50, sw), win.start, win.end), borderColor: '#4aa8d8', borderWidth: 1, pointRadius: 0, borderDash: [10, 5], yAxisID: 'yR' });
    if (v.tempRound) ds.push({ type: 'line', data: toXYWin(smooth(roundData, sw).map((v, i) => i <= clip ? v : null), win.start, win.end), borderColor: '#c47a12', borderWidth: 2.5, pointRadius: 0, tension: 0, yAxisID: 'yL' });
    if (v.tempRound) ds.push({ type: 'line', data: toXYWin(smooth(roundP50, sw), win.start, win.end), borderColor: '#c47a12', borderWidth: 1, pointRadius: 0, borderDash: [6, 3], yAxisID: 'yL' });
    return ds;
  }
  function ds2zoom(win, pw) {
    const { tMaxData, tMeanData, tMinData } = arrRef.current;
    const span = win.end - win.start + 1; const bars = span < 60;
    const bt = Math.max(2, Math.floor((pw / span) * 0.82));
    const v = v2Ref.current; const ds = [];
    if (v.tMax)  ds.push(bars ? { type: 'bar', data: toXYWin(tMaxData,  win.start, win.end), backgroundColor: 'rgba(196,58,42,0.7)',   borderWidth: 0, barThickness: bt } : { type: 'line', data: toXYWin(tMaxData,  win.start, win.end), borderColor: '#c43a2a', borderWidth: 2,   pointRadius: 0, tension: 0.2 });
    if (v.tMean) ds.push(bars ? { type: 'bar', data: toXYWin(tMeanData, win.start, win.end), backgroundColor: 'rgba(196,122,18,0.85)', borderWidth: 0, barThickness: bt } : { type: 'line', data: toXYWin(tMeanData, win.start, win.end), borderColor: '#c47a12', borderWidth: 2.5, pointRadius: 0, tension: 0.2 });
    if (v.tMin)  ds.push(bars ? { type: 'bar', data: toXYWin(tMinData,  win.start, win.end), backgroundColor: 'rgba(42,106,158,0.7)',  borderWidth: 0, barThickness: bt } : { type: 'line', data: toXYWin(tMinData,  win.start, win.end), borderColor: '#2a6a9e', borderWidth: 2,   pointRadius: 0, tension: 0.2 });
    return ds;
  }

  // ── overlay positioning ───────────────────────────────────────────────────────
  function posOverlays() {
    const win  = clampWin(winRef.current.start, winRef.current.width);
    const cDay = Math.round((win.start + win.end) / 2);

    function applySpot(ch, sdlEl, sbEl, sdrEl, seLEl, seREl, scMEl) {
      if (!ch) return;
      const px1 = ch.scales.x.getPixelForValue(win.start);
      const px2 = ch.scales.x.getPixelForValue(win.end);
      if (sdlEl.current) { sdlEl.current.style.left = '0'; sdlEl.current.style.width = px1 + 'px'; }
      if (sbEl.current)  { sbEl.current.style.left = px1 + 'px'; sbEl.current.style.width = (px2 - px1) + 'px'; }
      if (sdrEl.current) { sdrEl.current.style.left = px2 + 'px'; sdrEl.current.style.right = '0'; }
      if (seLEl.current) seLEl.current.style.left = px1 + 'px';
      if (seREl.current) seREl.current.style.left = px2 + 'px';
      if (scMEl.current) scMEl.current.style.left = ch.scales.x.getPixelForValue(cDay) + 'px';
    }
    applySpot(mC1.current, sdl1, sb1, sdr1, seL1, seR1, scM1);
    applySpot(mC2.current, sdl2, sb2, sdr2, seL2, seR2, scM2);

    function applyToday(ch, tlEl, tpEl) {
      if (!ch) return;
      const px = ch.scales.x.getPixelForValue(TODAY);
      if (tlEl.current) tlEl.current.style.left = px + 'px';
      if (tpEl.current) tpEl.current.style.left = px + 'px';
    }
    applyToday(mC1.current, tL1, tP1);
    applyToday(mC2.current, tL2, tP2);

    if (zC1.current && scZ1.current) scZ1.current.style.left = zC1.current.scales.x.getPixelForValue(cDay) + 'px';
    if (zC2.current && scZ2.current) scZ2.current.style.left = zC2.current.scales.x.getPixelForValue(cDay) + 'px';
    if (zC1.current && tLZ1.current) tLZ1.current.style.left = zC1.current.scales.x.getPixelForValue(TODAY) + 'px';
    if (zC2.current && tLZ2.current) tLZ2.current.style.left = zC2.current.scales.x.getPixelForValue(TODAY) + 'px';

    if (showPctRef.current) {
      applySpot(pcMC1.current, pcSdl1, pcSb1, pcSdr1, pcSeL1, pcSeR1, pcScM1);
      if (pcMC1.current) {
        const pxT = pcMC1.current.scales.x.getPixelForValue(TODAY);
        if (pcTL1.current) pcTL1.current.style.left = pxT + 'px';
      }
      if (pcZC1.current && pcScZ1.current) pcScZ1.current.style.left = pcZC1.current.scales.x.getPixelForValue(cDay) + 'px';
      if (pcZC1.current && pcTLZ1.current) pcTLZ1.current.style.left = pcZC1.current.scales.x.getPixelForValue(TODAY) + 'px';
      const pcDay = cDay;
      const { larData: ld, larP10: lp10, larP25: lp25, larP50: lp50, larP75: lp75, larP90: lp90, dates: dts } = arrRef.current;
      const pds = dts[pcDay] || '';
      setCtrPc(pds ? {
        dl:  fmtDayFull(pds),
        lar: ld[pcDay]   != null ? ld[pcDay].toFixed(4)   : '—',
        p10: lp10[pcDay] != null ? lp10[pcDay].toFixed(4) : '—',
        p25: lp25[pcDay] != null ? lp25[pcDay].toFixed(4) : '—',
        p50: lp50[pcDay] != null ? lp50[pcDay].toFixed(4) : '—',
        p75: lp75[pcDay] != null ? lp75[pcDay].toFixed(4) : '—',
        p90: lp90[pcDay] != null ? lp90[pcDay].toFixed(4) : '—',
      } : null);
    }

    // update React state for readouts / window label
    const { dates, larData, larP50, roundData, roundP50, tMeanData } = arrRef.current;
    const ds = dates[cDay] || '';
    setCtr1(ds ? {
      dl:        fmtDayFull(ds),
      lar:       larData[cDay]   != null ? larData[cDay].toFixed(4)        : '—',
      larAvg:    larP50[cDay]    != null ? larP50[cDay].toFixed(4)         : '—',
      round:     roundData[cDay] != null ? roundData[cDay].toFixed(0) + ' days' : '—',
      roundAvg:  roundP50[cDay]  != null ? roundP50[cDay].toFixed(0) + ' days'  : '—',
    } : null);
    setCtr2(ds ? { dl: fmtDayFull(ds), tMean: tMeanData[cDay] != null ? tMeanData[cDay].toFixed(1) + '°C' : '—' } : null);
    setWinInfo({ start: win.start, end: win.end });
  }

  // ── create all four charts ────────────────────────────────────────────────────
  function createAll() {
    const win = clampWin(winRef.current.start, winRef.current.width);
    const ic = (cv, ct, h) => { if (!cv || !ct) return; cv.width = ct.clientWidth || 340; cv.height = h; };
    [mC1, zC1, mC2, zC2, pcMC1, pcZC1].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
    ic(mCv1.current, mCt1.current, 120);
    ic(zCv1.current, zCt1.current, 180);
    ic(mCv2.current, mCt2.current, 120);
    ic(zCv2.current, zCt2.current, 180);

    const base = { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
    const showYL1 = v1Ref.current.tempRound;
    const showYR1 = v1Ref.current.tempLAR;
    if (mCv1.current) mC1.current = new Chart(mCv1.current, { type: 'line', data: { datasets: ds1main() }, options: { ...base, scales: { x: xMain(), ...(showYL1 ? { yL: mkYL() } : {}), ...(showYR1 ? { yR: mkYR() } : {}) } } });
    if (mCv2.current) mC2.current = new Chart(mCv2.current, { type: 'line', data: { datasets: ds2main() }, options: { ...base, scales: { x: xMain(), y: mkYS() } } });

    const pw1 = zCt1.current?.clientWidth || 340;
    const pw2 = zCt2.current?.clientWidth || 340;
    if (zCv1.current) zC1.current = new Chart(zCv1.current, { type: 'line', data: { datasets: ds1zoom(win, pw1) }, options: { ...base, scales: { x: xZoom(win.start, win.end), ...(showYL1 ? { yL: mkYL() } : {}), ...(showYR1 ? { yR: mkYRZoom() } : {}) } } });
    if (zCv2.current) zC2.current = new Chart(zCv2.current, { type: 'line', data: { datasets: ds2zoom(win, pw2) }, options: { ...base, scales: { x: xZoom(win.start, win.end), y: mkYS() } } });

    if (showPctRef.current) {
      if (pcMCv1.current && pcMCt1.current) { ic(pcMCv1.current, pcMCt1.current, 120); pcMC1.current = new Chart(pcMCv1.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: true }) }, options: { ...base, scales: { x: xMain(), yR: mkYRpc() } } }); }
      if (pcZCv1.current && pcZCt1.current) { ic(pcZCv1.current, pcZCt1.current, 180); const pcpw = pcZCt1.current.clientWidth || 340; pcZC1.current = new Chart(pcZCv1.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: false, win }) }, options: { ...base, scales: { x: xZoom(win.start, win.end), yR: mkYRpc() } } }); }
    }

    posOverlays();
  }

  // ── rebuild zoom charts only (fast pan) ────────────────────────────────────
  function refreshZoom() {
    const win = clampWin(winRef.current.start, winRef.current.width);
    const base = { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } };

    const showYL1 = v1Ref.current.tempRound;
    const showYR1 = v1Ref.current.tempLAR;
    if (zC1.current) { zC1.current.destroy(); zC1.current = null; }
    if (zCv1.current && zCt1.current) {
      const pw = zCt1.current.clientWidth || 340;
      zCv1.current.width = pw; zCv1.current.height = 180;
      zC1.current = new Chart(zCv1.current, { type: 'line', data: { datasets: ds1zoom(win, pw) }, options: { ...base, scales: { x: xZoom(win.start, win.end), ...(showYL1 ? { yL: mkYL() } : {}), ...(showYR1 ? { yR: mkYRZoom() } : {}) } } });
    }
    if (zC2.current) { zC2.current.destroy(); zC2.current = null; }
    if (zCv2.current && zCt2.current) {
      const pw = zCt2.current.clientWidth || 340;
      zCv2.current.width = pw; zCv2.current.height = 180;
      zC2.current = new Chart(zCv2.current, { type: 'line', data: { datasets: ds2zoom(win, pw) }, options: { ...base, scales: { x: xZoom(win.start, win.end), y: mkYS() } } });
    }
    if (showPctRef.current) {
      if (pcZC1.current) { pcZC1.current.destroy(); pcZC1.current = null; }
      if (pcZCv1.current && pcZCt1.current) {
        const pw = pcZCt1.current.clientWidth || 340;
        pcZCv1.current.width = pw; pcZCv1.current.height = 180;
        pcZC1.current = new Chart(pcZCv1.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: false, win }) }, options: { ...base, scales: { x: xZoom(win.start, win.end), yR: mkYRpc() } } });
      }
    }
    posOverlays();
  }

  // ── effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || !chartData) return;
    const t = setTimeout(createAll, 50);
    return () => { clearTimeout(t); [mC1, zC1, mC2, zC2, pcMC1, pcZC1].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } }); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrays, tLabels]);

  useEffect(() => {
    if (!showPct) {
      [pcMC1, pcZC1].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
      return;
    }
    const t = setTimeout(() => {
      // Centre window on today (same as centerOnToday)
      winRef.current.start = Math.round(TODAY - winRef.current.width / 2);
      const base = { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
      const ic = (cv, ct, h) => { if (!cv || !ct) return; cv.width = ct.clientWidth || 340; cv.height = h; };
      [pcMC1, pcZC1].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
      if (pcMCv1.current && pcMCt1.current) { ic(pcMCv1.current, pcMCt1.current, 120); pcMC1.current = new Chart(pcMCv1.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: true }) }, options: { ...base, scales: { x: xMain(), yR: mkYRpc() } } }); }
      // pcZC1 is built by refreshZoom (which also syncs the main card zoom charts to the new window)
      refreshZoom();
    }, 50);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPct]);

  useEffect(() => {
    if (loading || !chartData) return;
    const t = setTimeout(createAll, 10);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visC1, visC2, visPcBands]);

  useEffect(() => {
    if (!mCt1.current) return;
    let rsT;
    const ro = new ResizeObserver(() => { clearTimeout(rsT); rsT = setTimeout(createAll, 120); });
    ro.observe(mCt1.current);
    return () => { ro.disconnect(); clearTimeout(rsT); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── pointer handlers ─────────────────────────────────────────────────────────
  function onMainDown(e) {
    if (e.target.dataset.edge) return;
    panM.current = { startX: e.clientX, snap: winRef.current.start };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onMainMove(e) {
    const p = panM.current; if (!p) return;
    winRef.current.start = Math.round(p.snap - (e.clientX - p.startX) / ((mCt1.current?.clientWidth || 340) / N));
    refreshZoom();
  }
  function onMainUp() { panM.current = null; }

  function onZoomDown(e) {
    panZ.current = { startX: e.clientX, snap: winRef.current.start };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onZoomMove(e) {
    const p = panZ.current; if (!p) return;
    winRef.current.start = Math.round(p.snap - (e.clientX - p.startX) / ((zCt1.current?.clientWidth || 340) / winRef.current.width));
    refreshZoom();
  }
  function onZoomUp() { panZ.current = null; }

  function onPcZoomDown(e) {
    panZ.current = { startX: e.clientX, snap: winRef.current.start };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPcZoomMove(e) {
    const p = panZ.current; if (!p) return;
    const newStart = Math.round(p.snap - (e.clientX - p.startX) / ((pcZCt1.current?.clientWidth || 340) / winRef.current.width));
    winRef.current.start = newStart;
    refreshZoom();
  }
  function onPcZoomUp() { panZ.current = null; }

  function onPcMainDown(e) {
    if (e.target.dataset.edge) return;
    panM.current = { startX: e.clientX, snap: winRef.current.start };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPcMainMove(e) {
    const p = panM.current; if (!p) return;
    const newStart = Math.round(p.snap - (e.clientX - p.startX) / ((pcMCt1.current?.clientWidth || 340) / TODAY));
    winRef.current.start = newStart;
    refreshZoom();
  }
  function onPcMainUp() { panM.current = null; }

  function onEdgeDown(e, side) {
    e.stopPropagation();
    edgeR.current = { side, startX: e.clientX, snapStart: winRef.current.start, snapWidth: winRef.current.width };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onEdgeMove(e) {
    const p = edgeR.current; if (!p) return;
    const dx = (e.clientX - p.startX) / ((mCt1.current?.clientWidth || 340) / N);
    if (p.side === 'l') {
      const right = p.snapStart + p.snapWidth - 1;
      const ns = Math.max(0, Math.min(right - 2, Math.round(p.snapStart + dx)));
      winRef.current.start = ns; winRef.current.width = right - ns + 1;
    } else {
      winRef.current.width = Math.max(3, Math.min(N - p.snapStart, Math.round(p.snapWidth + dx)));
    }
    refreshZoom();
  }
  function onEdgeUp() { edgeR.current = null; }

  function centerOnToday() {
    winRef.current.start = Math.round(TODAY - winRef.current.width / 2);
    refreshZoom();
  }

  function handlePill(w) {
    const win = clampWin(winRef.current.start, winRef.current.width);
    const ctr = Math.round((win.start + win.end) / 2);
    winRef.current.width = w; winRef.current.start = Math.round(ctr - w / 2);
    setPill(w);
    refreshZoom();
  }

  // ── reusable JSX fragments ────────────────────────────────────────────────
  const todayDateStr = arrays.dates[TODAY] || '';

  const pillRow = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
      {PILLS.map(({ label, w }) => (
        <button key={w} onClick={() => handlePill(w)} style={{
          flex: 1, padding: '5px 0', borderRadius: 13, fontSize: 10, fontWeight: 600, lineHeight: 1,
          cursor: 'pointer', border: '1.5px solid #3a6b1a',
          background: pill === w ? '#3a6b1a' : '#fff',
          color:      pill === w ? '#fff'     : '#3a6b1a',
        }}>{label}</button>
      ))}
    </div>
  );

  const winLabel = winInfo
    ? `${fmtDay(arrays.dates[winInfo.start])} → ${fmtDay(arrays.dates[winInfo.end])} (${winInfo.end - winInfo.start + 1} days)`
    : '—';

  const gestureCard = (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 10px', fontSize: 10, color: '#4a5a38', background: '#fff', border: '1px solid #e0d8cc', borderRadius: 8, padding: '8px 10px', marginTop: 10, lineHeight: 1.4 }}>
      <span style={{ color: '#3a6b1a', fontWeight: 600 }}>Tap pill</span><span>Change window width (2W / 2M / 4M)</span>
      <span style={{ color: '#3a6b1a', fontWeight: 600 }}>Drag main</span><span>Pan the window left/right</span>
      <span style={{ color: '#3a6b1a', fontWeight: 600 }}>Drag zoom</span><span>Pan with finer movement</span>
      <span style={{ color: '#3a6b1a', fontWeight: 600 }}>Drag edges</span><span>Resize the spotlight window</span>
    </div>
  );

  // inlined edge handle (avoids sub-component remount anti-pattern)
  function edgeDiv(ref, side) {
    return (
      <div ref={ref} data-edge={side}
        style={{ ...S.edge, transform: side === 'l' ? 'translateX(-50%)' : 'translateX(50%)' }}
        onPointerDown={e => onEdgeDown(e, side)}
        onPointerMove={onEdgeMove}
        onPointerUp={onEdgeUp}
        onPointerCancel={onEdgeUp}
      >
        <div style={S.ePill} />
      </div>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div style={styles.screen}>
      <div style={{ background: '#2d4a1e', position: 'sticky', top: 0, zIndex: 20 }}>
        <ScenarioBanner scenario={scenario} pasture={pasture} title="🌡️ Temperature" onBack={() => onNavigate('overview')} onGoToScenarios={onGoToScenarios} />
      </div>

      <div style={{ padding: '10px 10px 0' }}>

        {/* ── Card 1: Temp round length & Temp LAR ──────────────────────────── */}
        <div style={styles.card}>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ color: '#4aa8d8' }}>Temp LAR</span>
            <button onClick={() => { setInfoLAR(v => !v); setInfoRL(false); }} style={{ marginLeft: 4, marginRight: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#4aa8d8', fontSize: 13, opacity: 0.75, padding: 0, lineHeight: 1 }}>ⓘ</button>
            <span style={{ color: '#9aab85', fontWeight: 400 }}>&amp;</span>
            {' '}
            <span style={{ color: '#c47a12' }}>Temp round length</span>
            <button onClick={() => { setInfoRL(v => !v); setInfoLAR(false); }} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#c47a12', fontSize: 13, opacity: 0.75, padding: 0, lineHeight: 1 }}>ⓘ</button>
          </div>
          {infoRL && (
            <div style={{ background: '#fff8ed', border: '1px solid rgba(196,122,18,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#6b4a10', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: '#c47a12', marginBottom: 6 }}>Temp round length</div>
              <div style={{ marginBottom: 8 }}>How many days it would take to complete one grazing round based on temperature-driven leaf growth alone. Calculated by summing daily Temp LAR backward from today until the target leaf stage is reached.</div>
              <pre style={{ fontSize: 10, background: 'rgba(196,122,18,0.08)', borderRadius: 6, padding: '6px 8px', margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#7a4a08' }}>{`Temp round length = backward sum of daily Temp LAR\n  until sum ≥ target leaves (${scenario.target_leaves} leaves)`}</pre>
            </div>
          )}
          {infoLAR && (
            <div style={{ background: '#eef7fd', border: '1px solid rgba(74,168,216,0.3)', borderRadius: 8, padding: '10px 12px', marginBottom: 10, fontSize: 12, color: '#1a4a6b', lineHeight: 1.6 }}>
              <div style={{ fontWeight: 600, color: '#4aa8d8', marginBottom: 6 }}>Temp LAR — Leaf Appearance Rate</div>
              <div style={{ marginBottom: 8 }}>How many leaves the grass produces per day, driven by temperature alone. Rises from zero at the base temp, peaks at the optimum, then falls back to zero at the ceiling.</div>
              <pre style={{ fontSize: 10, background: 'rgba(74,168,216,0.08)', borderRadius: 6, padding: '6px 8px', margin: '0 0 8px', whiteSpace: 'pre-wrap', fontFamily: 'monospace', color: '#1a3a5a' }}>{`Rising  (${pasture?.baseTemp ?? 5}–${pasture?.optimumTemp ?? 22}°C): LAR = (T_mean − base) / phyllochron\nFalling (${pasture?.optimumTemp ?? 22}–${pasture?.ceilingTemp ?? 35}°C): LAR = maxLAR × (ceiling − T_mean) / (ceiling − optimum)\nOutside range: LAR = 0`}</pre>
              <div style={{ fontSize: 11, color: '#2a5a7a', fontStyle: 'italic', marginBottom: 4 }}>Values for {pasture?.name}</div>
              {[
                { label: 'Base temp',      value: `${pasture?.baseTemp ?? 5}°C`,                             desc: 'minimum for any growth' },
                { label: 'Optimum temp',   value: `${pasture?.optimumTemp ?? 22}°C`,                         desc: 'where LAR peaks' },
                { label: 'Ceiling temp',   value: `${pasture?.ceilingTemp ?? 35}°C`,                         desc: 'above this, LAR = 0' },
                { label: 'Phyllochron',    value: pasture ? `${pasture.phyllochron} dd/leaf` : '—',          desc: 'degree-days per leaf' },
                { label: 'T_mean today',   value: tMean != null ? `${tMean.toFixed(1)}°C` : '—',            desc: null },
                { label: 'Temp LAR today', value: tLAR  != null ? `${tLAR.toFixed(4)} leaves/day` : '—',   desc: null },
              ].map(({ label, value, desc }) => (
                <div key={label} style={{ fontSize: 11, color: '#1a4a6b', marginBottom: 2 }}>
                  {label} = <strong style={{ color: '#0a2a4b' }}>{value}</strong>
                  {desc && <span style={{ color: '#5a8aaa', fontStyle: 'italic' }}> — {desc}</span>}
                </div>
              ))}
            </div>
          )}
          {pillRow}

          {loading && <p style={{ color: C.muted, textAlign: 'center' }}>Loading…</p>}
          {!loading && (
            <>
              <div style={{ fontSize: 10, color: '#5a6f48', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Expanded view · selected period</span>
                <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to pan</span>
                <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
              </div>
              <div ref={zCt1}
                style={{ position: 'relative', height: 180, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden', borderRadius: 6, cursor: 'grab', border: '2px solid #3a6b1a' }}
                onPointerDown={onZoomDown} onPointerMove={onZoomMove} onPointerUp={onZoomUp} onPointerCancel={onZoomUp}
              >
                <canvas ref={zCv1} style={{ display: 'block' }} />
                <div ref={tLZ1} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                  <div style={{ position: 'absolute', top: 4, left: 3, fontSize: 8, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.88)', padding: '1px 4px', borderRadius: 3 }}>Today</div>
                </div>
                <div ref={scZ1} style={S.scrub}><div style={S.sDot} /></div>
              </div>

              <div style={{ fontSize: 10, color: '#5a6f48', textAlign: 'center', marginTop: 6, fontWeight: 500 }}>{winLabel}</div>

              <div style={{ fontSize: 11, color: '#2d4a1e', marginTop: 6, background: '#f5fae8', border: '1px solid #cfe2b3', borderRadius: 6, overflow: 'hidden' }}>
                {/* always-visible legend row + toggle */}
                <div
                  onClick={() => setExpandCtr1(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', cursor: 'pointer', gap: 8 }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px' }}>
                    {[
                      { color: '#4aa8d8', dashed: false, label: 'Temp LAR' },
                      { color: '#4aa8d8', dashed: true,  label: 'LAR avg' },
                      { color: '#c47a12', dashed: false, label: 'Round length' },
                      { color: '#c47a12', dashed: true,  label: 'RL avg' },
                    ].map(({ color, dashed, label }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="16" height="8" style={{ flexShrink: 0 }}>
                          <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '4 3' : 'none'} />
                        </svg>
                        <span style={{ color, whiteSpace: 'nowrap' }}>{label}</span>
                      </div>
                    ))}
                  </div>
                  <span style={{ fontSize: 10, color: '#9aab85', flexShrink: 0 }}>{expandCtr1 ? '▲' : '▼'}</span>
                </div>

                {/* collapsible detail */}
                {expandCtr1 && (
                  <div style={{ padding: '0 10px 8px', borderTop: '1px solid #e0eecb', lineHeight: 1.7 }}>
                    {ctr1 && <div style={{ fontWeight: 600, marginBottom: 2, textAlign: 'center', paddingTop: 6 }}>{ctr1.dl}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
                      {[
                        { color: '#4aa8d8', dashed: false, label: 'Temp LAR',    value: ctr1?.lar },
                        { color: '#4aa8d8', dashed: true,  label: 'LAR avg',     value: ctr1?.larAvg },
                        { color: '#c47a12', dashed: false, label: 'Round length', value: ctr1?.round },
                        { color: '#c47a12', dashed: true,  label: 'RL avg',      value: ctr1?.roundAvg },
                      ].map(({ color, dashed, label, value }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                          <svg width="16" height="8" style={{ flexShrink: 0 }}>
                            <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '4 3' : 'none'} />
                          </svg>
                          <span style={{ color, whiteSpace: 'nowrap' }}>{label}</span>
                          {' '}
                          <strong>{value ?? '—'}</strong>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic', marginTop: 4, textAlign: 'center' }}>
                      {ctr1 ? 'centre of window — pan to explore' : 'pan to explore values'}
                    </div>
                  </div>
                )}
              </div>

              <ToggleBar show={visC1} onToggle={k => setVisC1(p => ({ ...p, [k]: !p[k] }))} items={[
                { key: 'tempLAR',   label: 'Temp LAR',          color: '#4aa8d8' },
                { key: 'tempRound', label: 'Temp round length', color: '#c47a12' },
              ]} />

              <div style={{ fontSize: 10, color: '#5a6f48', marginTop: 10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Full season overview <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to move selection</span></span>
                <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
              </div>
              <div ref={mCt1}
                style={{ position: 'relative', height: 120, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden' }}
                onPointerDown={onMainDown} onPointerMove={onMainMove} onPointerUp={onMainUp} onPointerCancel={onMainUp}
              >
                <canvas ref={mCv1} style={{ display: 'block' }} />
                <div ref={sdl1} style={S.dim} />
                <div ref={sb1}  style={S.band} />
                <div ref={sdr1} style={S.dim} />
                {edgeDiv(seL1, 'l')}
                {edgeDiv(seR1, 'r')}
                <div ref={scM1} style={S.scrub}><div style={S.sDot} /></div>
                <div ref={tL1} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                  <div style={{ position: 'absolute', top: 2, left: 3, fontSize: 7, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.85)', padding: '1px 3px', borderRadius: 3 }}>Today</div>
                </div>
              </div>

              {gestureCard}

              {/* ── Percentile comparison (collapsible) ──────────────────── */}
              <div style={{ marginTop: 12, border: '1px solid #e0d8cc', borderRadius: 8, overflow: 'hidden' }}>
                <div onClick={() => setShowPct(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', background: '#f5f0e8' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#3a6b1a' }}>Percentiles comparison</span>
                  <span style={{ fontSize: 11, color: '#9aab85' }}>{showPct ? '▲' : '▼'}</span>
                </div>
                {showPct && (
                  <div style={{ padding: '0 12px' }}>
                    {pillRow}
                    <div style={{ fontSize: 10, color: '#5a6f48', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 }}>
                      <span>Expanded view · selected period</span>
                      <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to pan</span>
                      <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
                    </div>
                    <div ref={pcZCt1}
                      style={{ position: 'relative', height: 180, touchAction: 'none', userSelect: 'none', overflow: 'hidden', borderRadius: 6, cursor: 'grab', border: '2px solid #3a6b1a' }}
                      onPointerDown={onPcZoomDown} onPointerMove={onPcZoomMove} onPointerUp={onPcZoomUp} onPointerCancel={onPcZoomUp}
                    >
                      <canvas ref={pcZCv1} style={{ display: 'block' }} />
                      <div ref={pcTLZ1} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                        <div style={{ position: 'absolute', top: 4, left: 3, fontSize: 8, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.88)', padding: '1px 4px', borderRadius: 3 }}>Today</div>
                      </div>
                      <div ref={pcScZ1} style={S.scrub}><div style={S.sDot} /></div>
                    </div>

                    <div style={{ fontSize: 11, color: '#2d4a1e', marginTop: 6, background: '#f0f7fd', border: '1px solid #c0daf0', borderRadius: 6, overflow: 'hidden' }}>
                      <div onClick={() => setExpandCtrPc(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', cursor: 'pointer', gap: 8 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px' }}>
                          {[
                            { color: '#1a4a7a', dashed: false, fill: null,                       label: 'Actual LAR' },
                            { color: '#4aa8d8', dashed: true,  fill: null,                       label: 'P50' },
                            { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.25)',    label: 'P25–P75' },
                            { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.12)',    label: 'P10–P90' },
                          ].map(({ color, dashed, fill, label }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <svg width="16" height="8" style={{ flexShrink: 0 }}>
                                {fill
                                  ? <rect x="0" y="1" width="16" height="6" fill={fill} rx="1" />
                                  : <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '4 3' : 'none'} />}
                              </svg>
                              <span style={{ color, whiteSpace: 'nowrap' }}>{label}</span>
                            </div>
                          ))}
                        </div>
                        <span style={{ fontSize: 10, color: '#9aab85', flexShrink: 0 }}>{expandCtrPc ? '▲' : '▼'}</span>
                      </div>
                      {expandCtrPc && (
                        <div style={{ padding: '0 10px 8px', borderTop: '1px solid #c0daf0', lineHeight: 1.7 }}>
                          {ctrPc && <div style={{ fontWeight: 600, marginBottom: 2, textAlign: 'center', paddingTop: 6 }}>{ctrPc.dl}</div>}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
                            {[
                              { color: '#1a4a7a', dashed: false, fill: null,                    label: 'Actual LAR', value: ctrPc?.lar },
                              { color: '#4aa8d8', dashed: true,  fill: null,                    label: 'P50',        value: ctrPc?.p50 },
                              { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.25)', label: 'P25',        value: ctrPc?.p25 },
                              { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.25)', label: 'P75',        value: ctrPc?.p75 },
                              { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.12)', label: 'P10',        value: ctrPc?.p10 },
                              { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.12)', label: 'P90',        value: ctrPc?.p90 },
                            ].map(({ color, dashed, fill, label, value }) => (
                              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                                <svg width="16" height="8" style={{ flexShrink: 0 }}>
                                  {fill
                                    ? <rect x="0" y="1" width="16" height="6" fill={fill} rx="1" />
                                    : <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '4 3' : 'none'} />}
                                </svg>
                                <span style={{ color, whiteSpace: 'nowrap' }}>{label}</span>
                                {' '}<strong>{value ?? '—'}</strong>
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic', marginTop: 4, textAlign: 'center' }}>
                            {ctrPc ? 'centre of window — pan to explore' : 'pan to explore values'}
                          </div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                      {[
                        { key: 'p1090', label: 'P10–P90' },
                        { key: 'p2575', label: 'P25–P75' },
                        { key: 'p50',   label: 'P50 median' },
                      ].map(({ key, label }) => (
                        <button key={key} onClick={() => setVisPcBands(p => ({ ...p, [key]: !p[key] }))} style={{
                          padding: '5px 9px', borderRadius: 14, fontSize: 10, fontWeight: 500, lineHeight: 1,
                          cursor: 'pointer', border: '1.5px solid #4aa8d8',
                          background: visPcBands[key] ? '#4aa8d8' : '#fff',
                          color: visPcBands[key] ? '#fff' : '#4aa8d8',
                          whiteSpace: 'nowrap',
                        }}>{label}</button>
                      ))}
                    </div>

                    <div style={{ fontSize: 10, color: '#5a6f48', marginTop: 10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Full season overview <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to move selection</span></span>
                      <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
                    </div>
                    <div ref={pcMCt1}
                      style={{ position: 'relative', height: 120, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden' }}
                      onPointerDown={onPcMainDown} onPointerMove={onPcMainMove} onPointerUp={onPcMainUp} onPointerCancel={onPcMainUp}
                    >
                      <canvas ref={pcMCv1} style={{ display: 'block' }} />
                      <div ref={pcSdl1} style={S.dim} />
                      <div ref={pcSb1}  style={S.band} />
                      <div ref={pcSdr1} style={S.dim} />
                      {edgeDiv(pcSeL1, 'l')}
                      {edgeDiv(pcSeR1, 'r')}
                      <div ref={pcScM1} style={S.scrub}><div style={S.sDot} /></div>
                      <div ref={pcTL1} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                        <div style={{ position: 'absolute', top: 2, left: 3, fontSize: 7, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.85)', padding: '1px 3px', borderRadius: 3 }}>Today</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Card 2: Temperature °C ────────────────────────────────────────── */}
        <div style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e3a12' }}>Temperature (°C)</div>
            <FormulaBtn open={fTemp} onToggle={() => setFTemp(v => !v)} />
          </div>
          {fTemp && (
            <FormulaBox
              lines={`T_mean = (T_max + T_min) / 2`}
              vars={[
                { label: 'T_max today',  value: tMax  != null ? `${tMax.toFixed(1)}°C`  : '—' },
                { label: 'T_min today',  value: tMin  != null ? `${tMin.toFixed(1)}°C`  : '—' },
                { label: 'T_mean today', value: tMean != null ? `${tMean.toFixed(1)}°C` : tMax != null && tMin != null ? `${((tMax + tMin) / 2).toFixed(1)}°C` : '—' },
              ]}
            />
          )}
          {pillRow}

          {!loading && (
            <>
              <div style={{ fontSize: 10, color: '#5a6f48', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Expanded view · selected period</span>
                <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to pan</span>
                <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
              </div>
              <div ref={zCt2}
                style={{ position: 'relative', height: 180, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden', borderRadius: 6, cursor: 'grab', border: '2px solid #3a6b1a' }}
                onPointerDown={onZoomDown} onPointerMove={onZoomMove} onPointerUp={onZoomUp} onPointerCancel={onZoomUp}
              >
                <canvas ref={zCv2} style={{ display: 'block' }} />
                <div ref={tLZ2} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                  <div style={{ position: 'absolute', top: 4, left: 3, fontSize: 8, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.88)', padding: '1px 4px', borderRadius: 3 }}>Today</div>
                </div>
                <div ref={scZ2} style={S.scrub}><div style={S.sDot} /></div>
              </div>

              <div style={{ fontSize: 10, color: '#5a6f48', textAlign: 'center', marginTop: 6, fontWeight: 500 }}>{winLabel}</div>

              {ctr2 && (
                <div style={{ fontSize: 11, color: '#2d4a1e', textAlign: 'center', marginTop: 6, background: '#f5fae8', border: '1px solid #cfe2b3', borderRadius: 6, padding: '6px 9px', lineHeight: 1.5 }}>
                  <strong>{ctr2.dl}</strong> · T_mean <strong>{ctr2.tMean}</strong>
                  <div style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic', marginTop: 2 }}>centre of window — pan to explore</div>
                </div>
              )}

              <ToggleBar show={visC2} onToggle={k => setVisC2(p => ({ ...p, [k]: !p[k] }))} items={[
                { key: 'tMax',  label: 'T_max',  color: '#c43a2a' },
                { key: 'tMean', label: 'T_mean', color: '#c47a12' },
                { key: 'tMin',  label: 'T_min',  color: '#2a6a9e' },
              ]} />

              <div style={{ fontSize: 10, color: '#5a6f48', marginTop: 10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Full season overview <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to move selection</span></span>
                <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
              </div>
              <div ref={mCt2}
                style={{ position: 'relative', height: 120, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden' }}
                onPointerDown={onMainDown} onPointerMove={onMainMove} onPointerUp={onMainUp} onPointerCancel={onMainUp}
              >
                <canvas ref={mCv2} style={{ display: 'block' }} />
                <div ref={sdl2} style={S.dim} />
                <div ref={sb2}  style={S.band} />
                <div ref={sdr2} style={S.dim} />
                {edgeDiv(seL2, 'l')}
                {edgeDiv(seR2, 'r')}
                <div ref={scM2} style={S.scrub}><div style={S.sDot} /></div>
                <div ref={tL2} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                  <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                  <div style={{ position: 'absolute', top: 2, left: 3, fontSize: 7, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.85)', padding: '1px 3px', borderRadius: 3 }}>Today</div>
                </div>
              </div>

            </>
          )}
        </div>

        <NavLinks onNavigate={onNavigate} current="temp" />
      </div>
    </div>
  );
}
