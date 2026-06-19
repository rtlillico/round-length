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
  // Round-length percentiles from the historical distribution (DB round_p*)
  const rndP10 = new Array(N).fill(null);
  const rndP25 = new Array(N).fill(null);
  const rndP50 = new Array(N).fill(null);
  const rndP75 = new Array(N).fill(null);
  const rndP90 = new Array(N).fill(null);
  const tMaxData  = new Array(N).fill(null);
  const tMeanData = new Array(N).fill(null);
  const tMinData  = new Array(N).fill(null);
  // Temperature percentile bands (°C) by day-of-year, for the temperature percentile comparison.
  const A = () => new Array(N).fill(null);
  const tempPc = {
    min:  { p10: A(), p25: A(), p50: A(), p75: A(), p90: A() },
    mean: { p10: A(), p25: A(), p50: A(), p75: A(), p90: A() },
    max:  { p10: A(), p25: A(), p50: A(), p75: A(), p90: A() },
  };
  // The "average" (median) lines reuse the p50 slots.
  const tMinAvg = tempPc.min.p50, tMeanAvg = tempPc.mean.p50, tMaxAvg = tempPc.max.p50;

  if (!chartData) return { dates, larData, larP10, larP25, larP50, larP75, larP90, roundData, roundP50, rndP10, rndP25, rndP50, rndP75, rndP90, tMaxData, tMeanData, tMinData, tMaxAvg, tMeanAvg, tMinAvg, tempPc, lastActual: -1 };

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
    const num = (v) => v != null ? Number(v) : null;
    tempPc.mean.p10[i] = num(perc.temp_p10); tempPc.mean.p25[i] = num(perc.temp_p25); tempPc.mean.p50[i] = num(perc.temp_p50); tempPc.mean.p75[i] = num(perc.temp_p75); tempPc.mean.p90[i] = num(perc.temp_p90);
    tempPc.min.p10[i]  = num(perc.tmin_p10); tempPc.min.p25[i]  = num(perc.tmin_p25); tempPc.min.p50[i]  = num(perc.tmin_p50); tempPc.min.p75[i]  = num(perc.tmin_p75); tempPc.min.p90[i]  = num(perc.tmin_p90);
    tempPc.max.p10[i]  = num(perc.tmax_p10); tempPc.max.p25[i]  = num(perc.tmax_p25); tempPc.max.p50[i]  = num(perc.tmax_p50); tempPc.max.p75[i]  = num(perc.tmax_p75); tempPc.max.p90[i]  = num(perc.tmax_p90);
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

  // Temp round-length percentiles, computed by backward-accumulating each temp-LAR
  // percentile (same method as roundData/roundP50). The stored round_p* are unusable
  // here — they're the full actualLAR true-round, which is currently degenerate (all
  // 365). Higher LAR → shorter round, so round-length percentiles invert vs LAR:
  // round P10 (short/fast) comes from larP90, round P90 (long/slow) from larP10.
  // The bands are climatological (periodic by day-of-year), so accumulate backward
  // up to a full year, wrapping "before the window start" to the same day-of-year a
  // year later (same value). This makes each calendar day's percentile identical in
  // any year, instead of being truncated near the start of the data window.
  const roundAccum = (larArr, i) => {
    let sum = 0, days = 0;
    for (let k = 0; k < 365; k++) {
      let j = i - k;
      if (j < 0) j += 365; // wrap to the same day-of-year (bands are periodic)
      const v = larArr[j];
      if (v != null) { sum += v; days++; }
      if (sum >= targetLeaves) return days;
    }
    return days || null;
  };
  for (let i = 0; i < N; i++) {
    rndP10[i] = roundAccum(larP90, i);
    rndP25[i] = roundAccum(larP75, i);
    rndP50[i] = roundAccum(larP50, i);
    rndP75[i] = roundAccum(larP25, i);
    rndP90[i] = roundAccum(larP10, i);
    roundP50[i] = rndP50[i];
  }

  return { dates, larData, larP10, larP25, larP50, larP75, larP90, roundData, roundP50, rndP10, rndP25, rndP50, rndP75, rndP90, tMaxData, tMeanData, tMinData, tMaxAvg, tMeanAvg, tMinAvg, tempPc, lastActual };
}

// Temperature percentile-comparison colours per metric (band/p50, actual line, band-fill rgb)
const TPC_COL = {
  min:  { key: 'tMin',  label: 'T_min',  band: '#4a90c4', actual: '#1a4a6b', rgb: '74,144,196' },
  mean: { key: 'tMean', label: 'T_ave',  band: '#c47a12', actual: '#7a4a08', rgb: '196,122,18' },
  max:  { key: 'tMax',  label: 'T_max',  band: '#d05a44', actual: '#8a2a1e', rgb: '208,90,68' },
};

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
  const half = Math.floor(width / 2);
  const minStart = -half;            // allow centre to reach index 0 (left end)
  const maxStart = (N - 1) - half;   // allow centre to reach index N-1 (right end)
  if (start < minStart) start = minStart;
  if (start > maxStart) start = maxStart;
  return { start, end: start + width - 1 };
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
export default function TemperatureScreen({ scenario, chartData, loading, onNavigate, onGoToScenarios, comparisonOnly = false }) {
  const [fTemp,   setFTemp]  = useState(false);
  const [infoRL,  setInfoRL]  = useState(false);
  const [infoLAR, setInfoLAR] = useState(false);
  const [visC1,   setVisC1]  = useState({ tempLAR: true, tempRound: true });
  const [rawC1,   setRawC1]  = useState({ lar: false, round: true }); // actual lines: false = smoothed, true = raw daily
  const [showRaw1, setShowRaw1] = useState(false); // expander for the raw/smoothed toggles
  const [visC2,   setVisC2]  = useState({ tMax: true, tMean: true, tMin: true });
  const [rawC2,   setRawC2]  = useState({ tMax: false, tMean: false, tMin: false }); // temp lines: false = smoothed, true = raw daily
  const [showRaw2, setShowRaw2] = useState(false); // expander for the temp raw/smoothed toggles
  const [pill,    setPill]   = useState(120);
  const [winInfo, setWinInfo] = useState(null);  // { start, end }
  const [ctr1,    setCtr1]   = useState(null);
  const [ctr2,    setCtr2]   = useState(null);
  const [expandCtr1, setExpandCtr1] = useState(false);
  const [ctrPc, setCtrPc] = useState(null);
  const [expandCtrPc, setExpandCtrPc] = useState(false);
  const [showPct, setShowPct] = useState(false);
  const [infoPc, setInfoPc] = useState(false);
  const showPctRef = useRef(false);
  const [visPcBands, setVisPcBands] = useState({ p50: true, p2575: true, p1090: true });
  const vPcRef = useRef({ p50: true, p2575: true, p1090: true });
  const [rawPc, setRawPc] = useState(false); // actual line in pc chart 1: false = smoothed, true = raw daily
  const rawPcRef = useRef(false);
  const [ctrPc2, setCtrPc2] = useState(null);
  const [expandCtrPc2, setExpandCtrPc2] = useState(false);
  const [visPcBands2, setVisPcBands2] = useState({ p50: true, p2575: true, p1090: true });
  const vPcRef2 = useRef({ p50: true, p2575: true, p1090: true });
  const [rawPc2, setRawPc2] = useState(true); // actual line in pc chart 2 (round length) — raw by default
  const rawPcRef2 = useRef(false);
  const [pcMetric, setPcMetric] = useState('lar'); // which percentile comparison is shown: 'lar' | 'round'
  const pcMetricRef = useRef('lar');

  // ── temperature percentile comparison (Card 2) ──
  const [showTpc, setShowTpc] = useState(false);
  const showTpcRef = useRef(false);
  const [infoTpc, setInfoTpc] = useState(false);
  const [tpcMetric, setTpcMetric] = useState('mean'); // 'min' | 'mean' | 'max'
  const tpcMetricRef = useRef('mean');
  const [rawTpc, setRawTpc] = useState(false); // actual temp line smoothed by default
  const rawTpcRef = useRef(false);
  const [visTpcBands, setVisTpcBands] = useState({ p50: true, p2575: true, p1090: true });
  const vTpcRef = useRef({ p50: true, p2575: true, p1090: true });
  const [ctrTpc, setCtrTpc] = useState(null);
  const [expandCtrTpc, setExpandCtrTpc] = useState(false);

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
  const rawRef  = useRef(rawC1);
  const raw2Ref = useRef(rawC2);
  useEffect(() => { arrRef.current = arrays;  }, [arrays]);
  useEffect(() => { tlRef.current  = tLabels; }, [tLabels]);
  useEffect(() => { v1Ref.current  = visC1;   }, [visC1]);
  useEffect(() => { rawRef.current = rawC1;   }, [rawC1]);
  useEffect(() => { raw2Ref.current = rawC2;  }, [rawC2]);
  useEffect(() => { v2Ref.current  = visC2;   }, [visC2]);
  useEffect(() => { showPctRef.current = showPct; }, [showPct]);
  useEffect(() => { vPcRef.current = visPcBands; }, [visPcBands]);
  useEffect(() => { vPcRef2.current = visPcBands2; }, [visPcBands2]);
  useEffect(() => { rawPcRef.current = rawPc; }, [rawPc]);
  useEffect(() => { rawPcRef2.current = rawPc2; }, [rawPc2]);
  useEffect(() => { pcMetricRef.current = pcMetric; }, [pcMetric]);
  useEffect(() => { showTpcRef.current = showTpc; }, [showTpc]);
  useEffect(() => { vTpcRef.current = visTpcBands; }, [visTpcBands]);
  useEffect(() => { rawTpcRef.current = rawTpc; }, [rawTpc]);
  useEffect(() => { tpcMetricRef.current = tpcMetric; }, [tpcMetric]);

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

  // percentile card refs — chart 1 (Temp LAR)
  const pcZC1 = useRef(null), pcMC1 = useRef(null);
  const pcZCv1 = useRef(null), pcMCv1 = useRef(null);
  const pcZCt1 = useRef(null), pcMCt1 = useRef(null);
  const pcSdl1 = useRef(null), pcSb1 = useRef(null), pcSdr1 = useRef(null);
  const pcSeL1 = useRef(null), pcSeR1 = useRef(null);
  const pcScM1 = useRef(null), pcScZ1 = useRef(null);
  const pcTL1  = useRef(null), pcTLZ1 = useRef(null);

  // percentile card refs — chart 2 (Temp Round Length)
  const pcZC2 = useRef(null), pcMC2 = useRef(null);
  const pcZCv2 = useRef(null), pcMCv2 = useRef(null);
  const pcZCt2 = useRef(null), pcMCt2 = useRef(null);
  const pcSdl2 = useRef(null), pcSb2 = useRef(null), pcSdr2 = useRef(null);
  const pcSeL2 = useRef(null), pcSeR2 = useRef(null);
  const pcScM2 = useRef(null), pcScZ2 = useRef(null);
  const pcTL2  = useRef(null), pcTLZ2 = useRef(null);

  // percentile card refs — temperature (T_min / T_mean / T_max)
  const tpcZC = useRef(null), tpcMC = useRef(null);
  const tpcZCv = useRef(null), tpcMCv = useRef(null);
  const tpcZCt = useRef(null), tpcMCt = useRef(null);
  const tpcSdl = useRef(null), tpcSb = useRef(null), tpcSdr = useRef(null);
  const tpcSeL = useRef(null), tpcSeR = useRef(null);
  const tpcScM = useRef(null), tpcScZ = useRef(null);
  const tpcTL  = useRef(null), tpcTLZ = useRef(null);

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
        callback(val, idx, ticks) {
          const i = Math.round(val);
          if (i < 0 || i >= tl.length || !tl[i]) return null;
          // Show the year on the first and last labels so the graph's span is anchored
          if (ticks && (idx === 0 || idx === ticks.length - 1)) {
            const ds = arrRef.current.dates?.[i];
            if (ds) { const d = new Date(ds + 'T00:00:00Z'); return `${MO[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(-2)}`; }
          }
          return tl[i];
        },
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
        // Combine year-boundary ticks (always shown) with the thinned ticks,
        // dropping any that sit too close to an already-accepted tick so adjacent
        // labels (e.g. Dec next to Jan '26) never overlap. ~span/12 ≈ one label width.
        const minGap = Math.max(1, Math.round(span / 12));
        const accepted = [...yearTicks];
        for (const i of chosen) {
          if (accepted.some(a => Math.abs(a - i) < minGap)) continue;
          accepted.push(i);
        }
        sc.ticks = accepted.sort((a, b) => a - b).map(v => ({ value: v }));
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
  function mkYpcRound(win) {
    const { roundData, rndP90 } = arrRef.current;
    // Round length spans a huge seasonal range, so scale the zoom axis to the
    // visible window (win) for readability; the navigator (no win) uses the full range.
    const slice = (arr) => { if (!win) return arr; const s = Math.max(0, win.start), e = Math.min(N - 1, win.end); return arr.slice(s, e + 1); };
    const vals = [...slice(roundData), ...slice(rndP90 || [])].filter(v => v != null && isFinite(v) && v > 0);
    const rawMax = vals.length ? Math.max(...vals) : 80;
    const step = rawMax > 100 ? 50 : rawMax > 50 ? 20 : 10;
    const max = Math.ceil(rawMax / step) * step;
    return { type: 'linear', position: 'right', min: 0, max, ticks: { color: '#4aa8d8', font: { size: 9 }, maxTicksLimit: 4, callback: withUnit('days') }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } };
  }
  function mkYpcTemp(win) {
    const a = arrRef.current;
    const metric = tpcMetricRef.current;
    const m = a.tempPc?.[metric] || {};
    const actual = metric === 'min' ? a.tMinData : metric === 'max' ? a.tMaxData : a.tMeanData;
    const slice = (arr) => { if (!arr) return []; if (!win) return arr; const s = Math.max(0, win.start), e = Math.min(N - 1, win.end); return arr.slice(s, e + 1); };
    const vals = [...slice(actual), ...slice(m.p10), ...slice(m.p90)].filter(v => v != null && isFinite(v));
    const base = { type: 'linear', position: 'right', ticks: { color: '#4aa8d8', font: { size: 9 }, maxTicksLimit: 4, callback: withUnit('°C') }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } };
    if (!vals.length) return base;
    let lo = Math.floor(Math.min(...vals) / 5) * 5;
    let hi = Math.ceil(Math.max(...vals) / 5) * 5;
    if (hi <= lo) hi = lo + 5;
    return { ...base, min: lo, max: hi };
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
  function buildPcBandDatasets({ isMain, win, vRef = vPcRef, rawRef = rawPcRef, metric = 'lar' }) {
    const a = arrRef.current;
    const clip = a.lastActual >= 0 ? a.lastActual : TODAY;
    const isRound = metric === 'round';
    // Same chart shape (actual line vs P50 / P25–P75 / P10–P90 bands), different series
    const actual = isRound ? a.roundData : a.larData;
    const p10 = isRound ? a.rndP10 : a.larP10;
    const p25 = isRound ? a.rndP25 : a.larP25;
    const p50 = isRound ? a.rndP50 : a.larP50;
    const p75 = isRound ? a.rndP75 : a.larP75;
    const p90 = isRound ? a.rndP90 : a.larP90;
    const v = vRef.current; const raw = rawRef.current;
    let toData, toActual;
    if (isMain) {
      const sw = 60;
      toData   = arr => toXY(smooth(arr, sw));
      toActual = arr => toXY((raw ? arr : smooth(arr, 90)).map((x, i) => i <= clip ? x : null));
    } else {
      const span = win.end - win.start + 1;
      const sw = Math.min(60, Math.max(14, Math.round(span / 6)));
      toData   = arr => toXYWin(smooth(arr, sw), win.start, win.end);
      toActual = arr => toXYWin((raw ? arr : smooth(arr, sw)).map((x, i) => i <= clip ? x : null), win.start, win.end);
    }
    const ds = [];
    if (v.p1090) {
      const i0 = ds.length;
      ds.push({ type: 'line', data: toData(p10), borderWidth: 0, pointRadius: 0, fill: false, yAxisID: 'yR' });
      ds.push({ type: 'line', data: toData(p90), borderWidth: 0, pointRadius: 0, fill: { target: i0 }, backgroundColor: 'rgba(74,168,216,0.12)', yAxisID: 'yR' });
    }
    if (v.p2575) {
      const i0 = ds.length;
      ds.push({ type: 'line', data: toData(p25), borderWidth: 0, pointRadius: 0, fill: false, yAxisID: 'yR' });
      ds.push({ type: 'line', data: toData(p75), borderWidth: 0, pointRadius: 0, fill: { target: i0 }, backgroundColor: 'rgba(74,168,216,0.25)', yAxisID: 'yR' });
    }
    if (v.p50) {
      ds.push({ type: 'line', data: toData(p50), borderColor: '#4aa8d8', borderWidth: 1.5, borderDash: [6, 3], pointRadius: 0, fill: false, yAxisID: 'yR' });
    }
    ds.push({ type: 'line', data: toActual(actual), borderColor: '#1a4a7a', borderWidth: 2, pointRadius: 0, fill: false, yAxisID: 'yR' });
    return ds;
  }
  function buildTempPcDatasets({ isMain, win }) {
    const a = arrRef.current;
    const clip = a.lastActual >= 0 ? a.lastActual : TODAY;
    const metric = tpcMetricRef.current;
    const m = a.tempPc?.[metric] || {};
    const actual = metric === 'min' ? a.tMinData : metric === 'max' ? a.tMaxData : a.tMeanData;
    const c = TPC_COL[metric] || TPC_COL.mean;
    const v = vTpcRef.current; const raw = rawTpcRef.current;
    let toData, toActual;
    if (isMain) {
      const sw = 30;
      toData   = arr => toXY(smooth(arr || [], sw));
      toActual = arr => toXY(smooth(arr || [], sw).map((x, i) => i <= clip ? x : null));
    } else {
      const span = win.end - win.start + 1;
      const sw = Math.min(60, Math.max(14, Math.round(span / 6)));
      toData   = arr => toXYWin(smooth(arr || [], sw), win.start, win.end);
      toActual = arr => toXYWin((raw ? (arr || []) : smooth(arr || [], sw)).map((x, i) => i <= clip ? x : null), win.start, win.end);
    }
    const ds = [];
    if (v.p1090) {
      const i0 = ds.length;
      ds.push({ type: 'line', data: toData(m.p10), borderWidth: 0, pointRadius: 0, fill: false, yAxisID: 'yR' });
      ds.push({ type: 'line', data: toData(m.p90), borderWidth: 0, pointRadius: 0, fill: { target: i0 }, backgroundColor: `rgba(${c.rgb},0.12)`, yAxisID: 'yR' });
    }
    if (v.p2575) {
      const i0 = ds.length;
      ds.push({ type: 'line', data: toData(m.p25), borderWidth: 0, pointRadius: 0, fill: false, yAxisID: 'yR' });
      ds.push({ type: 'line', data: toData(m.p75), borderWidth: 0, pointRadius: 0, fill: { target: i0 }, backgroundColor: `rgba(${c.rgb},0.28)`, yAxisID: 'yR' });
    }
    if (v.p50) {
      ds.push({ type: 'line', data: toData(m.p50), borderColor: c.band, borderWidth: 1.5, borderDash: [6, 3], pointRadius: 0, fill: false, yAxisID: 'yR' });
    }
    ds.push({ type: 'line', data: toActual(actual), borderColor: c.actual, borderWidth: 2, pointRadius: 0, fill: false, yAxisID: 'yR' });
    return ds;
  }
  function ds2main() {
    const { tMaxData, tMeanData, tMinData, tMaxAvg, tMeanAvg, tMinAvg, lastActual } = arrRef.current;
    const clip = lastActual >= 0 ? lastActual : TODAY;
    const v = v2Ref.current; const ds = [];
    // Always smoothed on the full-season navigator (30-day window) to calm daily noise;
    // clip actual to last actual day so the smoothing window doesn't draw a tail past Today
    const clipArr = (arr) => smooth(arr, 30).map((x, i) => i <= clip ? x : null);
    if (v.tMax)  ds.push({ type: 'line', data: toXY(clipArr(tMaxData)),  borderColor: '#c43a2a', borderWidth: 1.2, pointRadius: 0, tension: 0.2 });
    if (v.tMean) ds.push({ type: 'line', data: toXY(clipArr(tMeanData)), borderColor: '#c47a12', borderWidth: 1.5, pointRadius: 0, tension: 0.2 });
    if (v.tMin)  ds.push({ type: 'line', data: toXY(clipArr(tMinData)),  borderColor: '#2a6a9e', borderWidth: 1.2, pointRadius: 0, tension: 0.2 });
    // Historical average (dashed) across the full season incl. future
    if (v.tMax)  ds.push({ type: 'line', data: toXY(smooth(tMaxAvg, 30)),  borderColor: '#c43a2a', borderWidth: 0.8, pointRadius: 0, borderDash: [6, 3], tension: 0.2 });
    if (v.tMean) ds.push({ type: 'line', data: toXY(smooth(tMeanAvg, 30)), borderColor: '#c47a12', borderWidth: 0.8, pointRadius: 0, borderDash: [6, 3], tension: 0.2 });
    if (v.tMin)  ds.push({ type: 'line', data: toXY(smooth(tMinAvg, 30)),  borderColor: '#2a6a9e', borderWidth: 0.8, pointRadius: 0, borderDash: [6, 3], tension: 0.2 });
    return ds;
  }
  function ds1zoom(win, pw) {
    const { larData, larP50, roundData, roundP50, lastActual } = arrRef.current;
    const clip = lastActual >= 0 ? lastActual : TODAY;
    const span = win.end - win.start + 1; const bars = span < 60;
    const bt = Math.max(2, Math.floor((pw / span) * 0.82));
    // Scale smoothing window to the visible span so wider views stay smooth
    const sw = Math.min(60, Math.max(14, Math.round(span / 6)));
    const v = v1Ref.current; const raw = rawRef.current; const ds = [];
    const larActual   = (raw.lar   ? larData   : smooth(larData, sw)).map((x, i) => i <= clip ? x : null);
    const roundActual = (raw.round ? roundData : smooth(roundData, sw)).map((x, i) => i <= clip ? x : null);
    if (v.tempLAR) ds.push(bars
      ? { type: 'bar',  data: toXYWin(larData, win.start, win.end), backgroundColor: 'rgba(74,168,216,0.45)', borderWidth: 0, barThickness: bt, yAxisID: 'yR' }
      : { type: 'line', data: toXYWin(larActual, win.start, win.end), borderColor: '#4aa8d8', borderWidth: 2, pointRadius: 0, tension: 0, yAxisID: 'yR' });
    if (v.tempLAR) ds.push({ type: 'line', data: toXYWin(smooth(larP50, sw), win.start, win.end), borderColor: '#4aa8d8', borderWidth: 1, pointRadius: 0, borderDash: [10, 5], yAxisID: 'yR' });
    if (v.tempRound) ds.push({ type: 'line', data: toXYWin(roundActual, win.start, win.end), borderColor: '#c47a12', borderWidth: 2.5, pointRadius: 0, tension: 0, yAxisID: 'yL' });
    if (v.tempRound) ds.push({ type: 'line', data: toXYWin(smooth(roundP50, sw), win.start, win.end), borderColor: '#c47a12', borderWidth: 1, pointRadius: 0, borderDash: [6, 3], yAxisID: 'yL' });
    return ds;
  }
  function ds2zoom(win, pw) {
    const { tMaxData, tMeanData, tMinData, tMaxAvg, tMeanAvg, tMinAvg, lastActual } = arrRef.current;
    const clip = lastActual >= 0 ? lastActual : TODAY;
    const span = win.end - win.start + 1; const bars = span < 60;
    const bt = Math.max(2, Math.floor((pw / span) * 0.82));
    // Scale smoothing window to the visible span so wider views stay smooth (matches ds1zoom)
    const sw = Math.min(60, Math.max(14, Math.round(span / 6)));
    const v = v2Ref.current; const raw = raw2Ref.current; const ds = [];
    // Clip to the last actual day so the smoothing window doesn't draw a tail past Today
    const minLine  = (raw.tMin  ? tMinData  : smooth(tMinData, sw)).map((x, i) => i <= clip ? x : null);
    const meanLine = (raw.tMean ? tMeanData : smooth(tMeanData, sw)).map((x, i) => i <= clip ? x : null);
    const maxLine  = (raw.tMax  ? tMaxData  : smooth(tMaxData, sw)).map((x, i) => i <= clip ? x : null);
    // Historical average (dashed) — spans the whole window incl. future, not clipped
    const minAvg  = smooth(tMinAvg,  sw);
    const meanAvg = smooth(tMeanAvg, sw);
    const maxAvg  = smooth(tMaxAvg,  sw);
    // Bars overlap (linear x-axis). In this chart the FIRST dataset draws in front,
    // so push T_min first (front), T_mean middle, T_max last (back). Bars stay raw daily.
    if (v.tMin)  ds.push(bars ? { type: 'bar', data: toXYWin(tMinData,  win.start, win.end), backgroundColor: 'rgba(42,106,158,0.95)', borderWidth: 0, barThickness: bt } : { type: 'line', data: toXYWin(minLine,  win.start, win.end), borderColor: '#2a6a9e', borderWidth: 2,   pointRadius: 0, tension: 0.2 });
    if (v.tMean) ds.push(bars ? { type: 'bar', data: toXYWin(tMeanData, win.start, win.end), backgroundColor: 'rgba(196,122,18,0.9)',  borderWidth: 0, barThickness: bt } : { type: 'line', data: toXYWin(meanLine, win.start, win.end), borderColor: '#c47a12', borderWidth: 2.5, pointRadius: 0, tension: 0.2 });
    if (v.tMax)  ds.push(bars ? { type: 'bar', data: toXYWin(tMaxData,  win.start, win.end), backgroundColor: 'rgba(196,58,42,0.85)',  borderWidth: 0, barThickness: bt } : { type: 'line', data: toXYWin(maxLine,  win.start, win.end), borderColor: '#c43a2a', borderWidth: 2,   pointRadius: 0, tension: 0.2 });
    if (v.tMin)  ds.push({ type: 'line', data: toXYWin(minAvg,  win.start, win.end), borderColor: '#2a6a9e', borderWidth: 1, pointRadius: 0, borderDash: [6, 3], tension: 0.2 });
    if (v.tMean) ds.push({ type: 'line', data: toXYWin(meanAvg, win.start, win.end), borderColor: '#c47a12', borderWidth: 1, pointRadius: 0, borderDash: [6, 3], tension: 0.2 });
    if (v.tMax)  ds.push({ type: 'line', data: toXYWin(maxAvg,  win.start, win.end), borderColor: '#c43a2a', borderWidth: 1, pointRadius: 0, borderDash: [6, 3], tension: 0.2 });
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
      applySpot(pcMC2.current, pcSdl2, pcSb2, pcSdr2, pcSeL2, pcSeR2, pcScM2);
      if (pcMC2.current) {
        const pxT = pcMC2.current.scales.x.getPixelForValue(TODAY);
        if (pcTL2.current) pcTL2.current.style.left = pxT + 'px';
      }
      if (pcZC2.current && pcScZ2.current) pcScZ2.current.style.left = pcZC2.current.scales.x.getPixelForValue(cDay) + 'px';
      if (pcZC2.current && pcTLZ2.current) pcTLZ2.current.style.left = pcZC2.current.scales.x.getPixelForValue(TODAY) + 'px';
      const pcDay = cDay;
      const { larData: ld, larP10: lp10, larP25: lp25, larP50: lp50, larP75: lp75, larP90: lp90,
              roundData: rd, rndP10: rp10, rndP25: rp25, rndP50: rp50, rndP75: rp75, rndP90: rp90,
              dates: dts, lastActual: la } = arrRef.current;
      const pds = dts[pcDay] || '';
      // Read the SMOOTHED value at the centre so the readout matches the drawn
      // curve (same span-scaled window the zoom chart smooths with).
      const swPc = Math.min(60, Math.max(14, Math.round((win.end - win.start + 1) / 6)));
      const smAt = (arr) => {
        if (!arr) return null;
        const half = Math.floor(swPc / 2);
        let s = 0, n = 0;
        for (let j = Math.max(0, pcDay - half); j <= Math.min(arr.length - 1, pcDay + half); j++) {
          const x = arr[j]; if (x != null && isFinite(x)) { s += x; n++; }
        }
        return n ? s / n : null;
      };
      // Actual line is clipped to the last actual day and obeys the Raw toggle
      const actAt = (arr, rawRef) => (pcDay > la ? null : (rawRef.current ? arr[pcDay] : smAt(arr)));
      const f4 = (v) => v != null ? v.toFixed(4) : '—';
      const fd = (v) => v != null ? v.toFixed(0) + ' days' : '—';
      setCtrPc(pds ? {
        dl:  fmtDayFull(pds),
        lar: f4(actAt(ld, rawPcRef)), p10: f4(smAt(lp10)), p25: f4(smAt(lp25)),
        p50: f4(smAt(lp50)), p75: f4(smAt(lp75)), p90: f4(smAt(lp90)),
      } : null);
      setCtrPc2(pds ? {
        dl:  fmtDayFull(pds),
        lar: fd(actAt(rd, rawPcRef2)), p10: fd(smAt(rp10)), p25: fd(smAt(rp25)),
        p50: fd(smAt(rp50)), p75: fd(smAt(rp75)), p90: fd(smAt(rp90)),
      } : null);
    }

    if (showTpcRef.current) {
      applySpot(tpcMC.current, tpcSdl, tpcSb, tpcSdr, tpcSeL, tpcSeR, tpcScM);
      if (tpcMC.current) {
        const pxT = tpcMC.current.scales.x.getPixelForValue(TODAY);
        if (tpcTL.current) tpcTL.current.style.left = pxT + 'px';
      }
      if (tpcZC.current && tpcScZ.current) tpcScZ.current.style.left = tpcZC.current.scales.x.getPixelForValue(cDay) + 'px';
      if (tpcZC.current && tpcTLZ.current) tpcTLZ.current.style.left = tpcZC.current.scales.x.getPixelForValue(TODAY) + 'px';
      const a = arrRef.current;
      const metric = tpcMetricRef.current;
      const m = a.tempPc?.[metric] || {};
      const actual = metric === 'min' ? a.tMinData : metric === 'max' ? a.tMaxData : a.tMeanData;
      const pds = a.dates[cDay] || '';
      const swT = Math.min(60, Math.max(14, Math.round((win.end - win.start + 1) / 6)));
      const smAtT = (arr) => {
        if (!arr) return null;
        const half = Math.floor(swT / 2); let s = 0, n = 0;
        for (let j = Math.max(0, cDay - half); j <= Math.min(arr.length - 1, cDay + half); j++) {
          const x = arr[j]; if (x != null && isFinite(x)) { s += x; n++; }
        }
        return n ? s / n : null;
      };
      const actVal = cDay > a.lastActual ? null : (rawTpcRef.current ? actual[cDay] : smAtT(actual));
      const ft = (v) => v != null ? v.toFixed(1) + '°C' : '—';
      setCtrTpc(pds ? {
        dl: fmtDayFull(pds),
        val: ft(actVal), p10: ft(smAtT(m.p10)), p25: ft(smAtT(m.p25)),
        p50: ft(smAtT(m.p50)), p75: ft(smAtT(m.p75)), p90: ft(smAtT(m.p90)),
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
    [mC1, zC1, mC2, zC2, pcMC1, pcZC1, pcMC2, pcZC2, tpcMC, tpcZC].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
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
      if (pcMCv2.current && pcMCt2.current) { ic(pcMCv2.current, pcMCt2.current, 120); pcMC2.current = new Chart(pcMCv2.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: true, vRef: vPcRef2, rawRef: rawPcRef2, metric: 'round' }) }, options: { ...base, scales: { x: xMain(), yR: mkYpcRound() } } }); }
      if (pcZCv2.current && pcZCt2.current) { ic(pcZCv2.current, pcZCt2.current, 180); const pcpw2 = pcZCt2.current.clientWidth || 340; pcZC2.current = new Chart(pcZCv2.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: false, win, vRef: vPcRef2, rawRef: rawPcRef2, metric: 'round' }) }, options: { ...base, scales: { x: xZoom(win.start, win.end), yR: mkYpcRound(win) } } }); }
    }

    if (showTpcRef.current) {
      if (tpcMCv.current && tpcMCt.current) { ic(tpcMCv.current, tpcMCt.current, 120); tpcMC.current = new Chart(tpcMCv.current, { type: 'line', data: { datasets: buildTempPcDatasets({ isMain: true }) }, options: { ...base, scales: { x: xMain(), yR: mkYpcTemp() } } }); }
      if (tpcZCv.current && tpcZCt.current) { ic(tpcZCv.current, tpcZCt.current, 180); tpcZC.current = new Chart(tpcZCv.current, { type: 'line', data: { datasets: buildTempPcDatasets({ isMain: false, win }) }, options: { ...base, scales: { x: xZoom(win.start, win.end), yR: mkYpcTemp(win) } } }); }
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
      if (pcZC2.current) { pcZC2.current.destroy(); pcZC2.current = null; }
      if (pcZCv2.current && pcZCt2.current) {
        const pw = pcZCt2.current.clientWidth || 340;
        pcZCv2.current.width = pw; pcZCv2.current.height = 180;
        pcZC2.current = new Chart(pcZCv2.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: false, win, vRef: vPcRef2, rawRef: rawPcRef2, metric: 'round' }) }, options: { ...base, scales: { x: xZoom(win.start, win.end), yR: mkYpcRound(win) } } });
      }
    }
    if (showTpcRef.current) {
      if (tpcZC.current) { tpcZC.current.destroy(); tpcZC.current = null; }
      if (tpcZCv.current && tpcZCt.current) {
        const pw = tpcZCt.current.clientWidth || 340;
        tpcZCv.current.width = pw; tpcZCv.current.height = 180;
        tpcZC.current = new Chart(tpcZCv.current, { type: 'line', data: { datasets: buildTempPcDatasets({ isMain: false, win }) }, options: { ...base, scales: { x: xZoom(win.start, win.end), yR: mkYpcTemp(win) } } });
      }
    }
    posOverlays();
  }

  // ── effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || !chartData) return;
    const t = setTimeout(createAll, 50);
    return () => { clearTimeout(t); [mC1, zC1, mC2, zC2, pcMC1, pcZC1, pcMC2, pcZC2, tpcMC, tpcZC].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } }); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrays, tLabels]);

  // On first data load, centre the window on the latest actual day (a day or two
  // behind calendar today) so the centre readout lands on real values, not the
  // empty projection-only gap. The fixed "Today" marker stays at calendar today.
  const didCentre = useRef(false);
  useEffect(() => {
    if (loading || !chartData || didCentre.current) return;
    const la = arrays.lastActual;
    if (la >= 0) {
      winRef.current.start = Math.round(la - winRef.current.width / 2);
      didCentre.current = true;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrays, loading, chartData]);

  useEffect(() => {
    if (!showPct) {
      [pcMC1, pcZC1, pcMC2, pcZC2].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
      return;
    }
    const t = setTimeout(() => {
      // Centre window on today (same as centerOnToday)
      winRef.current.start = Math.round(TODAY - winRef.current.width / 2);
      const base = { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
      const ic = (cv, ct, h) => { if (!cv || !ct) return; cv.width = ct.clientWidth || 340; cv.height = h; };
      [pcMC1, pcZC1, pcMC2, pcZC2].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
      if (pcMCv1.current && pcMCt1.current) { ic(pcMCv1.current, pcMCt1.current, 120); pcMC1.current = new Chart(pcMCv1.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: true }) }, options: { ...base, scales: { x: xMain(), yR: mkYRpc() } } }); }
      if (pcMCv2.current && pcMCt2.current) { ic(pcMCv2.current, pcMCt2.current, 120); pcMC2.current = new Chart(pcMCv2.current, { type: 'line', data: { datasets: buildPcBandDatasets({ isMain: true, vRef: vPcRef2, rawRef: rawPcRef2, metric: 'round' }) }, options: { ...base, scales: { x: xMain(), yR: mkYpcRound() } } }); }
      // pcZC1/pcZC2 built by refreshZoom
      refreshZoom();
    }, 50);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPct]);

  useEffect(() => {
    if (!showTpc) {
      [tpcMC, tpcZC].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
      return;
    }
    const t = setTimeout(() => {
      const base = { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
      const ic = (cv, ct, h) => { if (!cv || !ct) return; cv.width = ct.clientWidth || 340; cv.height = h; };
      [tpcMC, tpcZC].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
      if (tpcMCv.current && tpcMCt.current) { ic(tpcMCv.current, tpcMCt.current, 120); tpcMC.current = new Chart(tpcMCv.current, { type: 'line', data: { datasets: buildTempPcDatasets({ isMain: true }) }, options: { ...base, scales: { x: xMain(), yR: mkYpcTemp() } } }); }
      // tpcZC built by refreshZoom
      refreshZoom();
    }, 50);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTpc]);

  useEffect(() => {
    if (loading || !chartData) return;
    const t = setTimeout(createAll, 10);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visC1, visC2, visPcBands, visPcBands2, rawC1, rawC2, rawPc, rawPc2, pcMetric, showTpc, tpcMetric, rawTpc, visTpcBands]);

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

  function onPcZoom2Down(e) {
    panZ.current = { startX: e.clientX, snap: winRef.current.start };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPcZoom2Move(e) {
    const p = panZ.current; if (!p) return;
    winRef.current.start = Math.round(p.snap - (e.clientX - p.startX) / ((pcZCt2.current?.clientWidth || 340) / winRef.current.width));
    refreshZoom();
  }
  function onPcZoom2Up() { panZ.current = null; }

  function onPcMain2Down(e) {
    if (e.target.dataset.edge) return;
    panM.current = { startX: e.clientX, snap: winRef.current.start };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPcMain2Move(e) {
    const p = panM.current; if (!p) return;
    winRef.current.start = Math.round(p.snap - (e.clientX - p.startX) / ((pcMCt2.current?.clientWidth || 340) / N));
    refreshZoom();
  }
  function onPcMain2Up() { panM.current = null; }

  function onTpcZoomDown(e) {
    panZ.current = { startX: e.clientX, snap: winRef.current.start };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onTpcZoomMove(e) {
    const p = panZ.current; if (!p) return;
    winRef.current.start = Math.round(p.snap - (e.clientX - p.startX) / ((tpcZCt.current?.clientWidth || 340) / winRef.current.width));
    refreshZoom();
  }
  function onTpcZoomUp() { panZ.current = null; }

  function onTpcMainDown(e) {
    if (e.target.dataset.edge) return;
    panM.current = { startX: e.clientX, snap: winRef.current.start };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onTpcMainMove(e) {
    const p = panM.current; if (!p) return;
    winRef.current.start = Math.round(p.snap - (e.clientX - p.startX) / ((tpcMCt.current?.clientWidth || 340) / N));
    refreshZoom();
  }
  function onTpcMainUp() { panM.current = null; }

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
        <ScenarioBanner scenario={scenario} pasture={pasture} title={comparisonOnly ? '📊 Comparison' : '🌡️ Temperature'} onBack={() => onNavigate('overview')} onGoToScenarios={onGoToScenarios} />
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
                <button
                  onClick={() => setShowRaw1(v => !v)}
                  style={{ background: 'transparent', border: '1.5px solid #9aab85', borderRadius: 10, color: '#5a6f48', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}
                >Raw {showRaw1 ? '▲' : '▾'}</button>
                <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
              </div>
              {showRaw1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                  <button
                    onClick={() => setRawC1(p => ({ ...p, lar: !p.lar }))}
                    style={{ background: rawC1.lar ? '#4aa8d8' : 'transparent', border: '1.5px solid #4aa8d8', borderRadius: 10, color: rawC1.lar ? '#fff' : '#4aa8d8', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}
                  >LAR: {rawC1.lar ? 'Raw' : 'Smoothed'}</button>
                  <button
                    onClick={() => setRawC1(p => ({ ...p, round: !p.round }))}
                    style={{ background: rawC1.round ? '#c47a12' : 'transparent', border: '1.5px solid #c47a12', borderRadius: 10, color: rawC1.round ? '#fff' : '#c47a12', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}
                  >Round: {rawC1.round ? 'Raw' : 'Smoothed'}</button>
                </div>
              )}
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

              {/* ── Percentile comparison (collapsible) — hidden in Comparison view ── */}
              {!comparisonOnly && (
              <div style={{ marginTop: 12, border: '1px solid #e0d8cc', borderRadius: 8, overflow: 'hidden' }}>
                <div onClick={() => setShowPct(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: showPct ? '12px 12px' : '8px 12px', cursor: 'pointer', background: showPct ? '#e9ecdf' : '#f5f0e8' }}>
                  <span style={{ fontSize: showPct ? 17 : 12, fontWeight: 700, color: '#3a6b1a' }}>Percentiles comparison</span>
                  <span style={{ fontSize: showPct ? 14 : 11, color: '#9aab85' }}>{showPct ? '▲' : '▼'}</span>
                </div>
                {showPct && (
                  <div style={{ padding: '0 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 10 }}>
                      {[
                        { key: 'lar',   label: 'Temp LAR',          color: '#4aa8d8' },
                        { key: 'round', label: 'Temp round length', color: '#c47a12' },
                      ].map(({ key, label, color }) => (
                        <button key={key} onClick={() => setPcMetric(key)} style={{
                          padding: '5px 11px', borderRadius: 14, fontSize: 12, fontWeight: 700,
                          cursor: 'pointer', border: `1.5px solid ${color}`,
                          background: pcMetric === key ? color : '#fff',
                          color: pcMetric === key ? '#fff' : color, whiteSpace: 'nowrap',
                        }}>{label}</button>
                      ))}
                      <button onClick={() => setInfoPc(v => !v)} style={{ marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#3a6b1a', fontSize: 14, opacity: 0.75, padding: 0, lineHeight: 1 }}>ⓘ</button>
                    </div>
                    {infoPc && (
                      <div style={{ background: '#eef7fd', border: '1px solid rgba(74,168,216,0.3)', borderRadius: 8, padding: '10px 12px', margin: '8px 0 4px', fontSize: 12, color: '#1a4a6b', lineHeight: 1.6 }}>
                        {pcMetric === 'lar' ? (
                          <>
                            <div style={{ fontWeight: 600, color: '#4aa8d8', marginBottom: 6 }}>Temp LAR — Leaf Appearance Rate</div>
                            <div style={{ marginBottom: 8 }}>How many leaves the grass produces per day, driven by temperature alone. Rises from zero at the base temp, peaks at the optimum, then falls back to zero at the ceiling.</div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600, color: '#4aa8d8', marginBottom: 6 }}>Temp round length</div>
                            <div style={{ marginBottom: 8 }}>How many days it takes to grow the target number of leaves, based on temperature-driven leaf growth. A short round means fast growth; a long round means slow growth.</div>
                          </>
                        )}
                        <div style={{ fontWeight: 600, color: '#4aa8d8', marginBottom: 6 }}>Percentiles comparison</div>
                        <div>This chart plots the current season's <strong style={{ color: '#0a2a4b' }}>{pcMetric === 'lar' ? 'Actual LAR' : 'Actual round length'}</strong> against the distribution of the same metric across past years for this time of year. The dashed line is the <strong style={{ color: '#0a2a4b' }}>P50 (median)</strong> — a typical year. The shaded bands show the spread of past years: <strong style={{ color: '#0a2a4b' }}>P25–P75</strong> (the middle half) and <strong style={{ color: '#0a2a4b' }}>P10–P90</strong> (all but the most extreme years).</div>
                      </div>
                    )}
                    {pillRow}
                    {pcMetric === 'lar' && (<>
                    <div style={{ fontSize: 10, color: '#5a6f48', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 }}>
                      <span>Expanded view · selected period</span>
                      <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to pan</span>
                      <button onClick={() => setRawPc(v => !v)} style={{ background: rawPc ? '#1a4a7a' : 'transparent', border: '1.5px solid #1a4a7a', borderRadius: 10, color: rawPc ? '#fff' : '#1a4a7a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>{rawPc ? 'Raw' : 'Smoothed'}</button>
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

                    </>)}
                    {pcMetric === 'round' && (
                    <div>
                      <div style={{ fontSize: 10, color: '#5a6f48', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 }}>
                        <span>Expanded view · selected period</span>
                        <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to pan</span>
                        <button onClick={() => setRawPc2(v => !v)} style={{ background: rawPc2 ? '#1a4a7a' : 'transparent', border: '1.5px solid #1a4a7a', borderRadius: 10, color: rawPc2 ? '#fff' : '#1a4a7a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>{rawPc2 ? 'Raw' : 'Smoothed'}</button>
                        <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
                      </div>
                      <div ref={pcZCt2}
                        style={{ position: 'relative', height: 180, touchAction: 'none', userSelect: 'none', overflow: 'hidden', borderRadius: 6, cursor: 'grab', border: '2px solid #3a6b1a' }}
                        onPointerDown={onPcZoom2Down} onPointerMove={onPcZoom2Move} onPointerUp={onPcZoom2Up} onPointerCancel={onPcZoom2Up}
                      >
                        <canvas ref={pcZCv2} style={{ display: 'block' }} />
                        <div ref={pcTLZ2} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                          <div style={{ position: 'absolute', top: 4, left: 3, fontSize: 8, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.88)', padding: '1px 4px', borderRadius: 3 }}>Today</div>
                        </div>
                        <div ref={pcScZ2} style={S.scrub}><div style={S.sDot} /></div>
                      </div>

                      <div style={{ fontSize: 11, color: '#2d4a1e', marginTop: 6, background: '#f0f7fd', border: '1px solid #c0daf0', borderRadius: 6, overflow: 'hidden' }}>
                        <div onClick={() => setExpandCtrPc2(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', cursor: 'pointer', gap: 8 }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px' }}>
                            {[
                              { color: '#1a4a7a', dashed: false, fill: null,                       label: 'Actual round length' },
                              { color: '#4aa8d8', dashed: true,  fill: null,                       label: 'P50' },
                              { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.25)',    label: 'P25–P75' },
                              { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.12)',    label: 'P10–P90' },
                            ].map(({ color, dashed, fill, label }) => (
                              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <svg width="16" height="8" style={{ flexShrink: 0 }}>
                                  {fill ? <rect x="0" y="1" width="16" height="6" fill={fill} rx="1" /> : <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '4 3' : 'none'} />}
                                </svg>
                                <span style={{ color, whiteSpace: 'nowrap' }}>{label}</span>
                              </div>
                            ))}
                          </div>
                          <span style={{ fontSize: 10, color: '#9aab85', flexShrink: 0 }}>{expandCtrPc2 ? '▲' : '▼'}</span>
                        </div>
                        {expandCtrPc2 && (
                          <div style={{ padding: '0 10px 8px', borderTop: '1px solid #c0daf0', lineHeight: 1.7 }}>
                            {ctrPc2 && <div style={{ fontWeight: 600, marginBottom: 2, textAlign: 'center', paddingTop: 6 }}>{ctrPc2.dl}</div>}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
                              {[
                                { color: '#1a4a7a', dashed: false, fill: null,                    label: 'Actual round length', value: ctrPc2?.lar },
                                { color: '#4aa8d8', dashed: true,  fill: null,                    label: 'P50',        value: ctrPc2?.p50 },
                                { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.25)', label: 'P25',        value: ctrPc2?.p25 },
                                { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.25)', label: 'P75',        value: ctrPc2?.p75 },
                                { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.12)', label: 'P10',        value: ctrPc2?.p10 },
                                { color: '#4aa8d8', dashed: false, fill: 'rgba(74,168,216,0.12)', label: 'P90',        value: ctrPc2?.p90 },
                              ].map(({ color, dashed, fill, label, value }) => (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                                  <svg width="16" height="8" style={{ flexShrink: 0 }}>
                                    {fill ? <rect x="0" y="1" width="16" height="6" fill={fill} rx="1" /> : <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '4 3' : 'none'} />}
                                  </svg>
                                  <span style={{ color, whiteSpace: 'nowrap' }}>{label}</span>
                                  {' '}<strong>{value ?? '—'}</strong>
                                </div>
                              ))}
                            </div>
                            <div style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic', marginTop: 4, textAlign: 'center' }}>
                              {ctrPc2 ? 'centre of window — pan to explore' : 'pan to explore values'}
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
                          <button key={key} onClick={() => setVisPcBands2(p => ({ ...p, [key]: !p[key] }))} style={{
                            padding: '5px 9px', borderRadius: 14, fontSize: 10, fontWeight: 500, lineHeight: 1,
                            cursor: 'pointer', border: '1.5px solid #4aa8d8',
                            background: visPcBands2[key] ? '#4aa8d8' : '#fff',
                            color: visPcBands2[key] ? '#fff' : '#4aa8d8',
                            whiteSpace: 'nowrap',
                          }}>{label}</button>
                        ))}
                      </div>

                      <div style={{ fontSize: 10, color: '#5a6f48', marginTop: 10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Full season overview <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to move selection</span></span>
                        <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
                      </div>
                      <div ref={pcMCt2}
                        style={{ position: 'relative', height: 120, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden' }}
                        onPointerDown={onPcMain2Down} onPointerMove={onPcMain2Move} onPointerUp={onPcMain2Up} onPointerCancel={onPcMain2Up}
                      >
                        <canvas ref={pcMCv2} style={{ display: 'block' }} />
                        <div ref={pcSdl2} style={S.dim} />
                        <div ref={pcSb2}  style={S.band} />
                        <div ref={pcSdr2} style={S.dim} />
                        {edgeDiv(pcSeL2, 'l')}
                        {edgeDiv(pcSeR2, 'r')}
                        <div ref={pcScM2} style={S.scrub}><div style={S.sDot} /></div>
                        <div ref={pcTL2} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                          <div style={{ position: 'absolute', top: 2, left: 3, fontSize: 7, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.85)', padding: '1px 3px', borderRadius: 3 }}>Today</div>
                        </div>
                      </div>
                    </div>
                    )}
                  </div>
                )}
              </div>
              )}
            </>
          )}
        </div>

        {/* ── Card 2: Temperature °C — hidden in Comparison view ── */}
        {!comparisonOnly && (
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
                <button
                  onClick={() => setShowRaw2(v => !v)}
                  style={{ background: 'transparent', border: '1.5px solid #9aab85', borderRadius: 10, color: '#5a6f48', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}
                >Raw {showRaw2 ? '▲' : '▾'}</button>
                <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
              </div>
              {showRaw2 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                  {[
                    { key: 'tMax',  label: 'T_max',  color: '#c43a2a' },
                    { key: 'tMean', label: 'T_mean', color: '#c47a12' },
                    { key: 'tMin',  label: 'T_min',  color: '#2a6a9e' },
                  ].map(({ key, label, color }) => (
                    <button key={key}
                      onClick={() => setRawC2(p => ({ ...p, [key]: !p[key] }))}
                      style={{ background: rawC2[key] ? color : 'transparent', border: `1.5px solid ${color}`, borderRadius: 10, color: rawC2[key] ? '#fff' : color, fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}
                    >{label}: {rawC2[key] ? 'Raw' : 'Smoothed'}</button>
                  ))}
                </div>
              )}
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

              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 6, fontSize: 9, color: '#5a6f48' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="#5a6f48" strokeWidth="2" /></svg>
                  actual
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <svg width="18" height="6"><line x1="0" y1="3" x2="18" y2="3" stroke="#5a6f48" strokeWidth="1" strokeDasharray="4 3" /></svg>
                  historical average
                </span>
              </div>

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

              {/* ── Temperature percentile comparison (collapsible) ──────────────── */}
              <div style={{ marginTop: 12, border: '1px solid #e0d8cc', borderRadius: 8, overflow: 'hidden' }}>
                <div onClick={() => setShowTpc(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: showTpc ? '12px 12px' : '8px 12px', cursor: 'pointer', background: showTpc ? '#e9ecdf' : '#f5f0e8' }}>
                  <span style={{ fontSize: showTpc ? 17 : 12, fontWeight: 700, color: '#3a6b1a' }}>Percentiles comparison</span>
                  <span style={{ fontSize: showTpc ? 14 : 11, color: '#9aab85' }}>{showTpc ? '▲' : '▼'}</span>
                </div>
                {showTpc && (() => { const c = TPC_COL[tpcMetric]; return (
                  <div style={{ padding: '0 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 10, flexWrap: 'wrap' }}>
                      {['min', 'mean', 'max'].map(mk => { const cc = TPC_COL[mk]; return (
                        <button key={mk} onClick={() => setTpcMetric(mk)} style={{ padding: '5px 11px', borderRadius: 14, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1.5px solid ${cc.band}`, background: tpcMetric === mk ? cc.band : '#fff', color: tpcMetric === mk ? '#fff' : cc.band, whiteSpace: 'nowrap' }}>{cc.label}</button>
                      ); })}
                      <button onClick={() => setInfoTpc(v => !v)} style={{ marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', color: '#9aab85', fontSize: 13, padding: 0, lineHeight: 1 }}>ⓘ</button>
                    </div>
                    {infoTpc && (
                      <div style={{ background: '#f0f7fd', border: '1px solid #c0daf0', borderRadius: 8, padding: '10px 12px', margin: '8px 0 4px', fontSize: 12, color: '#2d4a1e', lineHeight: 1.6 }}>
                        This chart plots the current season's actual <strong>{c.label}</strong> against the distribution of historical {c.label} for the same time of year. The dashed line is the <strong>P50 (median)</strong> — a typical year. The shaded bands show the spread of past years: <strong>P25–P75</strong> (the middle half) and <strong>P10–P90</strong> (all but the most extreme). Above the median = warmer than usual for the date; below = cooler.
                      </div>
                    )}
                    {pillRow}
                    <div style={{ fontSize: 10, color: '#5a6f48', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 4 }}>
                      <span>Expanded view · selected period</span>
                      <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to pan</span>
                      <button onClick={() => setRawTpc(v => !v)} style={{ background: rawTpc ? c.actual : 'transparent', border: `1.5px solid ${c.actual}`, borderRadius: 10, color: rawTpc ? '#fff' : c.actual, fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>{rawTpc ? 'Raw' : 'Smoothed'}</button>
                      <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
                    </div>
                    <div ref={tpcZCt}
                      style={{ position: 'relative', height: 180, touchAction: 'none', userSelect: 'none', overflow: 'hidden', borderRadius: 6, cursor: 'grab', border: '2px solid #3a6b1a' }}
                      onPointerDown={onTpcZoomDown} onPointerMove={onTpcZoomMove} onPointerUp={onTpcZoomUp} onPointerCancel={onTpcZoomUp}
                    >
                      <canvas ref={tpcZCv} style={{ display: 'block' }} />
                      <div ref={tpcTLZ} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                        <div style={{ position: 'absolute', top: 4, left: 3, fontSize: 8, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.88)', padding: '1px 4px', borderRadius: 3 }}>Today</div>
                      </div>
                      <div ref={tpcScZ} style={S.scrub}><div style={S.sDot} /></div>
                    </div>

                    <div style={{ fontSize: 11, color: '#2d4a1e', marginTop: 6, background: '#f0f7fd', border: '1px solid #c0daf0', borderRadius: 6, overflow: 'hidden' }}>
                      <div onClick={() => setExpandCtrTpc(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', cursor: 'pointer', gap: 8 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 12px' }}>
                          {[
                            { color: c.actual, dashed: false, fill: null,                  label: `Actual ${c.label}` },
                            { color: c.band,   dashed: true,  fill: null,                  label: 'P50' },
                            { color: c.band,   dashed: false, fill: `rgba(${c.rgb},0.28)`, label: 'P25–P75' },
                            { color: c.band,   dashed: false, fill: `rgba(${c.rgb},0.12)`, label: 'P10–P90' },
                          ].map(({ color, dashed, fill, label }) => (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <svg width="16" height="8" style={{ flexShrink: 0 }}>{fill ? <rect x="0" y="1" width="16" height="6" fill={fill} rx="1" /> : <line x1="0" y1="4" x2="16" y2="4" stroke={color} strokeWidth={dashed ? 1.5 : 2} strokeDasharray={dashed ? '4 3' : 'none'} />}</svg>
                              <span style={{ color, whiteSpace: 'nowrap' }}>{label}</span>
                            </div>
                          ))}
                        </div>
                        <span style={{ fontSize: 10, color: '#9aab85', flexShrink: 0 }}>{expandCtrTpc ? '▲' : '▼'}</span>
                      </div>
                      {expandCtrTpc && (
                        <div style={{ padding: '0 10px 8px', borderTop: '1px solid #c0daf0', lineHeight: 1.7 }}>
                          {ctrTpc && <div style={{ fontWeight: 600, marginBottom: 2, textAlign: 'center', paddingTop: 6 }}>{ctrTpc.dl}</div>}
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 10px' }}>
                            {[
                              { label: `Actual ${c.label}`, value: ctrTpc?.val },
                              { label: 'P50', value: ctrTpc?.p50 },
                              { label: 'P25', value: ctrTpc?.p25 },
                              { label: 'P75', value: ctrTpc?.p75 },
                              { label: 'P10', value: ctrTpc?.p10 },
                              { label: 'P90', value: ctrTpc?.p90 },
                            ].map(({ label, value }) => (
                              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
                                <span style={{ color: c.band, whiteSpace: 'nowrap' }}>{label}</span>{' '}<strong>{value ?? '—'}</strong>
                              </div>
                            ))}
                          </div>
                          <div style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic', marginTop: 4, textAlign: 'center' }}>{ctrTpc ? 'centre of window — pan to explore' : 'pan to explore values'}</div>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                      {[{ key: 'p1090', label: 'P10–P90' }, { key: 'p2575', label: 'P25–P75' }, { key: 'p50', label: 'P50 median' }].map(({ key, label }) => (
                        <button key={key} onClick={() => setVisTpcBands(p => ({ ...p, [key]: !p[key] }))} style={{ padding: '5px 9px', borderRadius: 14, fontSize: 10, fontWeight: 500, lineHeight: 1, cursor: 'pointer', border: `1.5px solid ${c.band}`, background: visTpcBands[key] ? c.band : '#fff', color: visTpcBands[key] ? '#fff' : c.band, whiteSpace: 'nowrap' }}>{label}</button>
                      ))}
                    </div>

                    <div style={{ fontSize: 10, color: '#5a6f48', marginTop: 10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Full season overview <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to move selection</span></span>
                      <button onClick={centerOnToday} style={{ background: 'transparent', border: '1.5px solid #3a6b1a', borderRadius: 10, color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 8px', cursor: 'pointer' }}>↩ Today</button>
                    </div>
                    <div ref={tpcMCt}
                      style={{ position: 'relative', height: 120, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden' }}
                      onPointerDown={onTpcMainDown} onPointerMove={onTpcMainMove} onPointerUp={onTpcMainUp} onPointerCancel={onTpcMainUp}
                    >
                      <canvas ref={tpcMCv} style={{ display: 'block' }} />
                      <div ref={tpcSdl} style={S.dim} />
                      <div ref={tpcSb}  style={S.band} />
                      <div ref={tpcSdr} style={S.dim} />
                      {edgeDiv(tpcSeL, 'l')}
                      {edgeDiv(tpcSeR, 'r')}
                      <div ref={tpcScM} style={S.scrub}><div style={S.sDot} /></div>
                      <div ref={tpcTL} style={{ position: 'absolute', top: 0, bottom: 0, pointerEvents: 'none', zIndex: 4 }}>
                        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: '#3a6b1a', opacity: 0.7 }} />
                        <div style={{ position: 'absolute', top: 2, left: 3, fontSize: 7, color: '#3a6b1a', fontWeight: 700, whiteSpace: 'nowrap', background: 'rgba(240,248,232,0.85)', padding: '1px 3px', borderRadius: 3 }}>Today</div>
                      </div>
                    </div>
                  </div>
                ); })()}
              </div>

            </>
          )}
        </div>
        )}

        <NavLinks onNavigate={onNavigate} current={comparisonOnly ? 'comparison' : 'temp'} />
      </div>
    </div>
  );
}
