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
const PILLS = [{ label: '2W', w: 14 }, { label: '2M', w: 60 }, { label: '4M', w: 120 }];

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
  const larP50    = new Array(N).fill(null);
  const roundData = new Array(N).fill(null);
  const roundP50  = new Array(N).fill(null);
  const tMaxData  = new Array(N).fill(null);
  const tMeanData = new Array(N).fill(null);
  const tMinData  = new Array(N).fill(null);

  if (!chartData) return { dates, larData, larP50, roundData, roundP50, tMaxData, tMeanData, tMinData };

  const percByDoy = {};
  for (const p of (chartData.percentiles || [])) percByDoy[p.day_of_year] = p;

  const projByDate = {};
  for (const r of (chartData.projected?.series || [])) projByDate[r.date] = r;

  const allActual      = [...(chartData.actual || [])].sort((a, b) => a.date < b.date ? -1 : 1);
  const actualTempLARs = allActual.map(r => Number(r.temp_lar ?? 0));
  const actualIdx      = {};
  for (let i = 0; i < allActual.length; i++) actualIdx[allActual[i].date?.slice(0, 10)] = i;

  for (let i = 0; i <= TODAY; i++) {
    const ds  = dates[i];
    const ai  = actualIdx[ds];
    if (ai == null) continue;
    const row = allActual[ai];

    larData[i]   = row.temp_lar != null ? Number(row.temp_lar) : null;
    tMaxData[i]  = row.t_max   != null ? Number(row.t_max)    : null;
    tMeanData[i] = row.t_mean  != null ? Number(row.t_mean)   : null;
    tMinData[i]  = row.t_min   != null ? Number(row.t_min)    : null;

    let sum = 0, days = 0;
    for (let j = ai; j >= 0; j--) { sum += actualTempLARs[j]; days++; if (sum >= targetLeaves) { roundData[i] = days; break; } }
    if (roundData[i] == null) roundData[i] = days;

    const doy  = dateToDayOfYear(new Date(ds + 'T00:00:00Z'));
    const perc = percByDoy[doy] || {};
    larP50[i]   = perc.temp_p50  != null ? calcTempLAR(Number(perc.temp_p50), pastureKey) : null;
    roundP50[i] = perc.round_p50 != null ? Number(perc.round_p50) : null;
  }

  for (let i = TODAY + 1; i < N; i++) {
    const ds   = dates[i];
    const doy  = dateToDayOfYear(new Date(ds + 'T00:00:00Z'));
    const perc = percByDoy[doy] || {};
    const proj = projByDate[ds];
    larP50[i]   = perc.temp_p50 != null ? calcTempLAR(Number(perc.temp_p50), pastureKey) : null;
    roundP50[i] = proj?.roundP50 != null ? Number(proj.roundP50) : null;
  }

  return { dates, larData, larP50, roundData, roundP50, tMaxData, tMeanData, tMinData };
}

const toXY = (arr) => arr.map((v, i) => v != null ? { x: i, y: v } : null).filter(Boolean);
const toXYWin = (arr, s, e) => { const r = []; for (let i = s; i <= e; i++) { if (arr[i] != null) r.push({ x: i, y: arr[i] }); } return r; };

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
export default function TemperatureScreen({ scenario, chartData, loading, onNavigate }) {
  const [fRL,     setFRL]    = useState(false);
  const [fTemp,   setFTemp]  = useState(false);
  const [visC1,   setVisC1]  = useState({ tempRound: true, tempLAR: true, p50: true });
  const [visC2,   setVisC2]  = useState({ tMax: true, tMean: true, tMin: true });
  const [pill,    setPill]   = useState(60);
  const [winInfo, setWinInfo] = useState(null);  // { start, end }
  const [ctr1,    setCtr1]   = useState(null);
  const [ctr2,    setCtr2]   = useState(null);
  const [stats,   setStats]  = useState(null);

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
  const winRef  = useRef({ width: 60, start: TODAY - 30 });
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

  // ── x-scale configs ───────────────────────────────────────────────────────────
  function xMain() {
    const tl = tlRef.current;
    return {
      type: 'linear', min: 0, max: N - 1,
      ticks: {
        autoSkip: false, maxRotation: 0, padding: 2, color: '#9aab85', font: { size: 7 },
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

  function xZoom(xMin, xMax) {
    const tl = tlRef.current;
    return {
      type: 'linear', min: xMin, max: xMax, offset: false,
      ticks: {
        autoSkip: false, maxRotation: 0, padding: 2, color: '#9aab85', font: { size: 8 },
        callback(val) { const i = Math.round(val); return (i >= 0 && i < tl.length && tl[i]) ? tl[i] : null; },
      },
      afterBuildTicks(sc) {
        const span = sc.max - sc.min; const gap = Math.max(2, Math.ceil(span / 5)); let last = -Infinity;
        sc.ticks = sc.ticks.filter(t => { if (!tl[Math.round(t.value)]) return false; if (t.value - last < gap) return false; last = t.value; return true; });
      },
      grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false },
    };
  }

  // Factory functions — Chart.js mutates scale objects internally, so never reuse across charts
  const mkYL = () => ({ type: 'linear', position: 'left',  ticks: { color: '#9aab85', font: { size: 7 }, maxTicksLimit: 3 }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } });
  const mkYR = () => ({ type: 'linear', position: 'right', ticks: { color: '#9aab85', font: { size: 7 }, maxTicksLimit: 3 }, grid: { display: false }, border: { display: false } });
  const mkYS = () => ({ ticks: { color: '#9aab85', font: { size: 7 }, maxTicksLimit: 4 }, grid: { color: 'rgba(0,0,0,0.04)' }, border: { display: false } });
  // Fixed yR for zoom chart — max from full dataset so axis doesn't rescale while panning
  function mkYRZoom() {
    const { larData, larP50 } = arrRef.current;
    const vals = [...larData, ...larP50].filter(v => v != null && isFinite(v) && v > 0);
    const rawMax = vals.length ? Math.max(...vals) : 0.15;
    const max = Math.ceil(rawMax * 20) / 20; // round up to nearest 0.05
    return { type: 'linear', position: 'right', min: 0, max, ticks: { color: '#9aab85', font: { size: 7 }, maxTicksLimit: 3 }, grid: { display: false }, border: { display: false } };
  }

  // ── dataset builders ─────────────────────────────────────────────────────────
  function ds1main() {
    const { larData, larP50, roundData, roundP50 } = arrRef.current;
    const v = v1Ref.current; const ds = [];
    if (v.tempRound) ds.push({ type: 'line', data: toXY(roundData), borderColor: '#c47a12', borderWidth: 1.4, pointRadius: 0, tension: 0.2, yAxisID: 'yL' });
    if (v.p50)       ds.push({ type: 'line', data: toXY(roundP50),  borderColor: '#c47a12', borderWidth: 0.8, pointRadius: 0, borderDash: [6, 3], yAxisID: 'yL' });
    if (v.tempLAR)   ds.push({ type: 'line', data: toXY(larData),   borderColor: '#3a6b1a', borderWidth: 1.4, pointRadius: 0, tension: 0.2, yAxisID: 'yR' });
    if (v.p50)       ds.push({ type: 'line', data: toXY(larP50),    borderColor: '#3a6b1a', borderWidth: 0.8, pointRadius: 0, borderDash: [6, 3], yAxisID: 'yR' });
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
    const { larData, larP50, roundData, roundP50 } = arrRef.current;
    const span = win.end - win.start + 1; const bars = span < 60;
    const bt = Math.max(2, Math.floor((pw / span) * 0.82));
    const v = v1Ref.current; const ds = [];
    if (v.tempRound) ds.push({ type: 'line', data: toXYWin(roundData, win.start, win.end), borderColor: '#c47a12', borderWidth: bars ? 2.5 : 2.5, pointRadius: 0, tension: 0.2, yAxisID: 'yL' });
    if (v.p50) ds.push({ type: 'line', data: toXYWin(roundP50, win.start, win.end), borderColor: '#c47a12', borderWidth: 1, pointRadius: 0, borderDash: [6, 3], yAxisID: 'yL' });
    if (v.tempLAR) ds.push(bars
      ? { type: 'bar',  data: toXYWin(larData, win.start, win.end), backgroundColor: 'rgba(58,107,26,0.85)', borderWidth: 0, barThickness: bt, yAxisID: 'yR' }
      : { type: 'line', data: toXYWin(larData, win.start, win.end), borderColor: '#3a6b1a', borderWidth: 2, pointRadius: 0, tension: 0.2, yAxisID: 'yR' });
    if (v.p50) ds.push({ type: 'line', data: toXYWin(larP50, win.start, win.end), borderColor: '#3a6b1a', borderWidth: 1, pointRadius: 0, borderDash: [6, 3], yAxisID: 'yR' });
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

    // update React state for readouts / window label
    const { dates, larData, roundData, tMeanData } = arrRef.current;
    const ds = dates[cDay] || '';
    setCtr1(ds ? { dl: fmtDayFull(ds), round: roundData[cDay] != null ? roundData[cDay].toFixed(0) + ' days' : '—', lar: larData[cDay] != null ? larData[cDay].toFixed(4) : '—' } : null);
    setCtr2(ds ? { dl: fmtDayFull(ds), tMean: tMeanData[cDay] != null ? tMeanData[cDay].toFixed(1) + '°C' : '—' } : null);
    const slice = larData.slice(win.start, win.end + 1).filter(v => v != null);
    if (slice.length) {
      const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
      setStats({ avg: avg.toFixed(4), min: Math.min(...slice).toFixed(4), max: Math.max(...slice).toFixed(4), total: slice.reduce((a, b) => a + b, 0).toFixed(2) });
    } else setStats(null);
    setWinInfo({ start: win.start, end: win.end });
  }

  // ── create all four charts ────────────────────────────────────────────────────
  function createAll() {
    const win = clampWin(winRef.current.start, winRef.current.width);
    const ic = (cv, ct, h) => { if (!cv || !ct) return; cv.width = ct.clientWidth || 340; cv.height = h; };
    [mC1, zC1, mC2, zC2].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } });
    ic(mCv1.current, mCt1.current, 120);
    ic(zCv1.current, zCt1.current, 180);
    ic(mCv2.current, mCt2.current, 120);
    ic(zCv2.current, zCt2.current, 180);

    const base = { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
    if (mCv1.current) mC1.current = new Chart(mCv1.current, { type: 'line', data: { datasets: ds1main() }, options: { ...base, scales: { x: xMain(), yL: mkYL(), yR: mkYR() } } });
    if (mCv2.current) mC2.current = new Chart(mCv2.current, { type: 'line', data: { datasets: ds2main() }, options: { ...base, scales: { x: xMain(), y: mkYS() } } });

    const pw1 = zCt1.current?.clientWidth || 340;
    const pw2 = zCt2.current?.clientWidth || 340;
    if (zCv1.current) zC1.current = new Chart(zCv1.current, { type: 'line', data: { datasets: ds1zoom(win, pw1) }, options: { ...base, scales: { x: xZoom(win.start, win.end), yL: mkYL(), yR: mkYRZoom() } } });
    if (zCv2.current) zC2.current = new Chart(zCv2.current, { type: 'line', data: { datasets: ds2zoom(win, pw2) }, options: { ...base, scales: { x: xZoom(win.start, win.end), y: mkYS() } } });

    posOverlays();
  }

  // ── rebuild zoom charts only (fast pan) ────────────────────────────────────
  function refreshZoom() {
    const win = clampWin(winRef.current.start, winRef.current.width);
    const base = { responsive: false, animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } };

    if (zC1.current) { zC1.current.destroy(); zC1.current = null; }
    if (zCv1.current && zCt1.current) {
      const pw = zCt1.current.clientWidth || 340;
      zCv1.current.width = pw; zCv1.current.height = 180;
      zC1.current = new Chart(zCv1.current, { type: 'line', data: { datasets: ds1zoom(win, pw) }, options: { ...base, scales: { x: xZoom(win.start, win.end), yL: mkYL(), yR: mkYRZoom() } } });
    }
    if (zC2.current) { zC2.current.destroy(); zC2.current = null; }
    if (zCv2.current && zCt2.current) {
      const pw = zCt2.current.clientWidth || 340;
      zCv2.current.width = pw; zCv2.current.height = 180;
      zC2.current = new Chart(zCv2.current, { type: 'line', data: { datasets: ds2zoom(win, pw) }, options: { ...base, scales: { x: xZoom(win.start, win.end), y: mkYS() } } });
    }
    posOverlays();
  }

  // ── effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || !chartData) return;
    const t = setTimeout(createAll, 50);
    return () => { clearTimeout(t); [mC1, zC1, mC2, zC2].forEach(r => { if (r.current) { r.current.destroy(); r.current = null; } }); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrays, tLabels]);

  useEffect(() => {
    if (loading || !chartData) return;
    const t = setTimeout(createAll, 10);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visC1, visC2]);

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
          flex: 1, padding: '5px 0', borderRadius: 13, fontSize: 10, fontWeight: 600,
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
        <ScenarioBanner scenario={scenario} pasture={pasture} title="🌡️ Temperature" onBack={() => onNavigate('overview')} />
      </div>

      <div style={{ padding: '10px 10px 0' }}>

        {/* ── Card 1: Temp round length & Temp LAR ──────────────────────────── */}
        <div style={styles.card}>
          <FormulaBtn open={fRL} onToggle={() => setFRL(v => !v)} />
          {fRL && (
            <FormulaBox
              lines={`Rising (${pasture?.baseTemp ?? 5}–${pasture?.optimumTemp ?? 22}°C):  Temp LAR = (T_mean − base) / phyllochron\nFalling (${pasture?.optimumTemp ?? 22}–${pasture?.ceilingTemp ?? 35}°C): Temp LAR = maxLAR × (ceiling − T_mean) / (ceiling − optimum)\nOutside range: Temp LAR = 0\nTemp round length = cumulative backward sum of daily Temp LAR`}
              vars={[
                { label: 'Base temp',      value: `${pasture?.baseTemp ?? 5}°C` },
                { label: 'Optimum temp',   value: `${pasture?.optimumTemp ?? 22}°C` },
                { label: 'Ceiling temp',   value: `${pasture?.ceilingTemp ?? 35}°C` },
                { label: 'Phyllochron',    value: pasture ? `${pasture.phyllochron} degree-days/leaf` : '—' },
                { label: 'T_mean today',   value: tMean != null ? `${tMean.toFixed(1)}°C` : '—' },
                { label: 'Temp LAR today', value: tLAR  != null ? `${tLAR.toFixed(4)} leaves/day` : '—' },
              ]}
            />
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Temp round length & Temp LAR</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Left axis: round length (days) · Right axis: Temp LAR (leaves/day) · Dashed = P50</div>
          {pillRow}

          {loading && <p style={{ color: C.muted, textAlign: 'center' }}>Loading…</p>}
          {!loading && (
            <>
              <div style={{ fontSize: 10, color: '#5a6f48', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                Zoomed detail of window <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to pan</span>
              </div>
              <div ref={zCt1}
                style={{ position: 'relative', height: 180, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden', borderRadius: 6, cursor: 'grab' }}
                onPointerDown={onZoomDown} onPointerMove={onZoomMove} onPointerUp={onZoomUp} onPointerCancel={onZoomUp}
              >
                <canvas ref={zCv1} style={{ display: 'block' }} />
                <div ref={tLZ1} style={S.todayL} />
                <div ref={scZ1} style={S.scrub}><div style={S.sDot} /></div>
              </div>

              <div style={{ fontSize: 10, color: '#5a6f48', textAlign: 'center', marginTop: 6, fontWeight: 500 }}>{winLabel}</div>

              {ctr1 && (
                <div style={{ fontSize: 11, color: '#2d4a1e', textAlign: 'center', marginTop: 6, background: '#f5fae8', border: '1px solid #cfe2b3', borderRadius: 6, padding: '6px 9px', lineHeight: 1.5 }}>
                  <strong>{ctr1.dl}</strong> · RL <strong>{ctr1.round}</strong> · LAR <strong>{ctr1.lar}</strong>
                  <div style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic', marginTop: 2 }}>centre of window — pan to explore</div>
                </div>
              )}

              {stats && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginTop: 8, background: '#f5fae8', border: '1px solid #cfe2b3', borderRadius: 8, padding: 8 }}>
                  {[['Avg LAR', stats.avg], ['Min', stats.min], ['Max', stats.max], ['Total leaves', stats.total]].map(([lbl, val]) => (
                    <div key={lbl} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#9aab85', marginBottom: 2 }}>{lbl}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#2d4a1e', lineHeight: 1.1 }}>{val}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ fontSize: 10, color: '#5a6f48', marginTop: 10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Full range <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to move window</span></span>
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
                <div ref={tL1}  style={S.todayL} />
              </div>

              <div style={{ marginTop: 8 }}>
                <Legend items={[
                  { label: 'Temp round length', color: '#c47a12' },
                  { label: 'Temp LAR', color: '#3a6b1a' },
                  ...(visC1.p50 ? [{ label: 'P50', color: '#88a870', dashed: true }] : []),
                ]} />
              </div>
              <ToggleBar show={visC1} onToggle={k => setVisC1(p => ({ ...p, [k]: !p[k] }))} items={[
                { key: 'tempRound', label: 'Temp round length', color: '#c47a12' },
                { key: 'tempLAR',   label: 'Temp LAR',          color: '#3a6b1a' },
                { key: 'p50',       label: 'P50 average',       color: '#88a870' },
              ]} />
              {gestureCard}
            </>
          )}
        </div>

        {/* ── Card 2: Temperature °C ────────────────────────────────────────── */}
        <div style={styles.card}>
          <FormulaBtn open={fTemp} onToggle={() => setFTemp(v => !v)} />
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
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Temperature (°C)</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Daily T_max, T_mean, T_min · Actual data only</div>
          {pillRow}

          {!loading && (
            <>
              <div style={{ fontSize: 10, color: '#5a6f48', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                Zoomed detail of window <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to pan</span>
              </div>
              <div ref={zCt2}
                style={{ position: 'relative', height: 180, marginTop: 5, touchAction: 'none', userSelect: 'none', overflow: 'hidden', borderRadius: 6, cursor: 'grab' }}
                onPointerDown={onZoomDown} onPointerMove={onZoomMove} onPointerUp={onZoomUp} onPointerCancel={onZoomUp}
              >
                <canvas ref={zCv2} style={{ display: 'block' }} />
                <div ref={tLZ2} style={S.todayL} />
                <div ref={scZ2} style={S.scrub}><div style={S.sDot} /></div>
              </div>

              <div style={{ fontSize: 10, color: '#5a6f48', textAlign: 'center', marginTop: 6, fontWeight: 500 }}>{winLabel}</div>

              {ctr2 && (
                <div style={{ fontSize: 11, color: '#2d4a1e', textAlign: 'center', marginTop: 6, background: '#f5fae8', border: '1px solid #cfe2b3', borderRadius: 6, padding: '6px 9px', lineHeight: 1.5 }}>
                  <strong>{ctr2.dl}</strong> · T_mean <strong>{ctr2.tMean}</strong>
                  <div style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic', marginTop: 2 }}>centre of window — pan to explore</div>
                </div>
              )}

              <div style={{ fontSize: 10, color: '#5a6f48', marginTop: 10, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Full range <span style={{ fontSize: 9, color: '#9aab85', fontStyle: 'italic' }}>↔ drag to move window</span></span>
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
                <div ref={tL2}  style={S.todayL} />
              </div>

              <div style={{ marginTop: 8 }}>
                <Legend items={[
                  ...(visC2.tMax  ? [{ label: 'T_max',  color: '#c43a2a' }] : []),
                  ...(visC2.tMean ? [{ label: 'T_mean', color: '#c47a12' }] : []),
                  ...(visC2.tMin  ? [{ label: 'T_min',  color: '#2a6a9e' }] : []),
                ]} />
              </div>
              <ToggleBar show={visC2} onToggle={k => setVisC2(p => ({ ...p, [k]: !p[k] }))} items={[
                { key: 'tMax',  label: 'T_max',  color: '#c43a2a' },
                { key: 'tMean', label: 'T_mean', color: '#c47a12' },
                { key: 'tMin',  label: 'T_min',  color: '#2a6a9e' },
              ]} />
            </>
          )}
        </div>

        <NavLinks onNavigate={onNavigate} current="temp" />
      </div>
    </div>
  );
}
