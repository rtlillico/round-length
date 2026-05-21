// round-length/frontend/src/pages/TemperatureScreen.jsx
import { useState, useMemo, useRef, useCallback } from 'react';
import { C, styles } from '../App';
import { PASTURE_PARAMS, dateToDayOfYear, calcTempLAR } from '../lib/formula';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  ScenarioBanner, NavLinks, FormulaBtn, FormulaBox, ToggleBar, PctBtn, TodayLabel, Legend,
  buildMonthTicks, buildWeeklyTicks, nearestToToday, xAxisTick, dayMonthTick, yAxisProps,
} from '../components/SeasonUI';

const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

function binSeries(arr, binDays) {
  if (binDays <= 1) return arr;
  const avg = (chunk, key) => {
    const vals = chunk.map(r => r[key]).filter(v => v != null);
    return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(5) : null;
  };
  const result = [];
  for (let i = 0; i < arr.length; i += binDays) {
    const chunk = arr.slice(i, i + binDays);
    if (!chunk.length) continue;
    const center = chunk[Math.floor(chunk.length / 2)];
    result.push({
      date:         center.date,
      tempRound:    avg(chunk, 'tempRound'),
      tempRoundP50: avg(chunk, 'tempRoundP50'),
      tempLAR:      avg(chunk, 'tempLAR'),
      larP50:       avg(chunk, 'larP50'),
      tMean:        avg(chunk, 'tMean'),
      tMin:         avg(chunk, 'tMin'),
      tMax:         avg(chunk, 'tMax'),
    });
  }
  return result;
}

function buildSeries(chartData, targetLeaves, maxLAR, pastureKey) {
  if (!chartData) return [];
  const n = v => v != null ? Number(v) : null;

  const percByDoy = {};
  for (const p of (chartData.percentiles || [])) percByDoy[p.day_of_year] = p;

  const allActual = chartData.actual || [];
  const tempLARs  = allActual.map(r => Number(r.temp_lar ?? 0));

  const tempRounds = allActual.map((_, i) => {
    let sum = 0, days = 0;
    for (let j = i; j >= 0; j--) {
      sum += tempLARs[j];
      days++;
      if (sum >= targetLeaves) return days;
    }
    return days;
  });

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const past = allActual.map((row, idx) => {
    const date = (row.date || '').slice(0, 10);
    const doy  = dateToDayOfYear(new Date(date + 'T00:00:00Z'));
    const perc = percByDoy[doy] || {};
    return {
      date,
      tempRound:    tempRounds[idx],
      tempRoundP50: n(perc.round_p50),
      tempLAR:      n(row.temp_lar),
      larP50:       perc.temp_p50 != null ? calcTempLAR(Number(perc.temp_p50), pastureKey) : null,
      tMean:        n(row.t_mean),
      tMin:         n(row.t_min),
      tMax:         n(row.t_max),
    };
  }).filter(row => row.date >= cutoffStr);

  const future = (chartData.projected?.series || []).slice(0, 365).map(row => {
    const doy  = dateToDayOfYear(new Date(row.date + 'T00:00:00Z'));
    const perc = percByDoy[doy] || {};
    return {
      date:         row.date,
      tempRoundP50: n(row.roundP50),
      larP50:       perc.temp_p50 != null ? calcTempLAR(Number(perc.temp_p50), pastureKey) : null,
    };
  });

  return [...past, ...future];
}

// ── PanChart ──────────────────────────────────────────────────────────────────
// Wraps a chart div with pointer-based pan gesture support.
function PanChart({ canPan, onPanDelta, onTap, children, containerRef }) {
  const panRef = useRef(null);

  function handlePointerDown(e) {
    if (!canPan) return;
    panRef.current = { startX: e.clientX, lastDelta: 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    const p = panRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    if (Math.abs(dx) > 5) p.moved = true;
    const w = containerRef?.current?.offsetWidth || 300;
    onPanDelta(dx, w);
  }

  function handlePointerUp(e) {
    const p = panRef.current;
    panRef.current = null;
    if (!p) return;
    if (!p.moved) onTap?.();
  }

  return (
    <div
      ref={containerRef}
      style={{ touchAction: canPan ? 'none' : 'auto', userSelect: 'none', cursor: canPan ? 'grab' : 'default' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { panRef.current = null; }}
    >
      {children}
    </div>
  );
}

function RangeBar({ range, setRange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
      {['1W', '1M', 'Full'].map(r => (
        <button key={r} onClick={() => setRange(r)} style={{
          fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
          border: 'none', cursor: 'pointer',
          background: range === r ? '#3a6b1a' : '#e8f0e0',
          color:      range === r ? '#fff'     : '#3a6b1a',
        }}>{r}</button>
      ))}
    </div>
  );
}

export default function TemperatureScreen({ scenario, chartData, loading, onNavigate }) {
  const [fRL, setFRL]         = useState(false);
  const [fTemp, setFTemp]     = useState(false);
  const [pctRL, setPctRL]     = useState(false);
  const [c1, setC1] = useState({ tempRound: true, tempLAR: true, p50: true });
  const [c2, setC2] = useState({ tMax: true, tMean: true, tMin: true });
  const [range, setRange]     = useState('Full');
  const [offset, setOffset]   = useState(0);   // days offset from today
  const panStartRef = useRef(null); // { startOffset }

  const pasture = PASTURE_PARAMS[scenario.pasture_key];
  const maxLAR  = pasture ? (pasture.optimumTemp - pasture.baseTemp) / pasture.phyllochron : 0.17;
  const state   = scenario.todayState;
  const target  = Number(scenario.target_leaves);

  const toggle1 = k => setC1(p => ({ ...p, [k]: !p[k] }));
  const toggle2 = k => setC2(p => ({ ...p, [k]: !p[k] }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const series   = useMemo(() => buildSeries(chartData, target, maxLAR, scenario.pasture_key), [chartData, target, maxLAR, scenario.pasture_key]);

  const halfWindow = range === '1W' ? 7 : range === '1M' ? 30 : null;
  const canPan     = halfWindow != null;
  const windowDays = halfWindow != null ? halfWindow * 2 : null;

  const displaySeries = useMemo(() => {
    const binDays = range === '1W' ? 1 : range === '1M' ? 4 : 7;
    let filtered = series;
    if (halfWindow != null) {
      const center = new Date(todayStr + 'T00:00:00Z');
      center.setUTCDate(center.getUTCDate() + offset);
      const p = new Date(center); p.setUTCDate(p.getUTCDate() - halfWindow);
      const f = new Date(center); f.setUTCDate(f.getUTCDate() + halfWindow);
      filtered = series.filter(r => r.date >= p.toISOString().slice(0, 10) && r.date <= f.toISOString().slice(0, 10));
    }
    return binSeries(filtered, binDays);
  }, [series, range, offset, halfWindow, todayStr]);

  const handleRangeChange = useCallback((r) => {
    setRange(r);
    setOffset(0);
  }, []);

  const containerRef = useRef(null);

  const handlePanDelta = useCallback((dx, containerW) => {
    if (!canPan || !windowDays) return;
    if (!panStartRef.current) panStartRef.current = { startOffset: offset };
    const pxPerDay = containerW / windowDays;
    const dayDelta = Math.round(-dx / pxPerDay);
    const maxOff = 365 - halfWindow;
    const minOff = -(365 - halfWindow);
    setOffset(Math.max(minOff, Math.min(maxOff, panStartRef.current.startOffset + dayDelta)));
  }, [canPan, windowDays, offset, halfWindow]);

  // Reset panStartRef on pointer up
  const handleTap = useCallback(() => {
    panStartRef.current = null;
    setOffset(0);
  }, []);

  // Also reset panStartRef when pan ends (pointer up)
  const handlePanEnd = useCallback(() => {
    panStartRef.current = null;
  }, []);

  const todayNearest = nearestToToday(displaySeries, todayStr);
  const ticks  = range === 'Full' ? buildMonthTicks(displaySeries, todayStr) : buildWeeklyTicks(displaySeries, todayStr);
  const tickFn = range === 'Full' ? xAxisTick(todayStr, todayNearest) : dayMonthTick(todayStr);
  const useBar = range === '1W';

  const tMean = state?.t_mean   != null ? Number(state.t_mean)   : null;
  const tMin  = state?.t_min    != null ? Number(state.t_min)    : null;
  const tMax  = state?.t_max    != null ? Number(state.t_max)    : null;
  const tLAR  = state?.temp_lar != null ? Number(state.temp_lar) : null;

  // Show center date when panned away from today
  const centerDate = useMemo(() => {
    if (!canPan || offset === 0) return null;
    const d = new Date(todayStr + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + offset);
    return fmtDay(d.toISOString().slice(0, 10));
  }, [canPan, offset, todayStr]);

  const chartMargin = { top: 5, right: 38, left: -20, bottom: 0 };

  return (
    <div style={styles.screen}>
      <div style={{ background: '#2d4a1e', position: 'sticky', top: 0, zIndex: 20 }}>
        <ScenarioBanner scenario={scenario} pasture={pasture} title="🌡️ Temperature" onBack={() => onNavigate('overview')} />
      </div>

      <div style={{ padding: '10px 10px 0' }}>

        {/* Chart 1: Temp round length + Temp LAR */}
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
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Left: round length (days) · Right: Temp LAR (leaves/day) · Dashed = P50</div>
          <RangeBar range={range} setRange={handleRangeChange} />

          {centerDate && (
            <div
              onClick={() => { panStartRef.current = null; setOffset(0); }}
              style={{ fontSize: 10, color: C.muted, marginBottom: 6, cursor: 'pointer' }}
            >
              Centred on {centerDate} · Tap to return to today
            </div>
          )}

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && displaySeries.length > 0 && (
            <PanChart canPan={canPan} onPanDelta={handlePanDelta} onTap={handleTap} containerRef={containerRef}>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={displaySeries} margin={chartMargin}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" ticks={ticks} interval={0} height={24} tick={tickFn} />
                  <YAxis yAxisId="left"  orientation="left"  {...yAxisProps} domain={[0, 'auto']} />
                  <YAxis yAxisId="right" orientation="right" {...yAxisProps} domain={[0, 'auto']} />
                  <ReferenceLine yAxisId="left" x={todayNearest} stroke="#2d5a1b" strokeWidth={2} strokeOpacity={0.7} />
                  {c1.tempRound && useBar  && <Bar  yAxisId="left"  dataKey="tempRound" fill="#c47a12" opacity={0.8} isAnimationActive={false} />}
                  {c1.tempRound && !useBar && <Line yAxisId="left"  dataKey="tempRound" stroke="#c47a12" strokeWidth={2.5} dot={false} connectNulls />}
                  {c1.p50                  && <Line yAxisId="left"  dataKey="tempRoundP50" stroke="#c47a12" strokeWidth={1} dot={false} strokeDasharray="6 3" connectNulls />}
                  {c1.tempLAR  && useBar  && <Bar  yAxisId="right" dataKey="tempLAR" fill="#3a6b1a" opacity={0.8} isAnimationActive={false} />}
                  {c1.tempLAR  && !useBar && <Line yAxisId="right" dataKey="tempLAR" stroke="#3a6b1a" strokeWidth={2} dot={false} connectNulls />}
                  {c1.p50                  && <Line yAxisId="right" dataKey="larP50" stroke="#3a6b1a" strokeWidth={1} dot={false} strokeDasharray="6 3" connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </PanChart>
          )}
          <TodayLabel />
          <Legend items={[
            { label: 'Temp round length', color: '#c47a12' },
            { label: 'Temp LAR',          color: '#3a6b1a' },
            ...(c1.p50 ? [{ label: 'P50', color: '#88a870', dashed: true }] : []),
          ]} />
          <ToggleBar show={c1} onToggle={toggle1} items={[
            { key: 'tempRound', label: 'Temp round length', color: '#c47a12' },
            { key: 'tempLAR',   label: 'Temp LAR',          color: '#3a6b1a' },
            { key: 'p50',       label: 'P50 average',       color: '#88a870' },
          ]} />
          <div style={{ height: 1, background: '#f0ead8', margin: '10px 0' }} />
          <PctBtn open={pctRL} onToggle={() => setPctRL(v => !v)} />
          {pctRL && (
            <div style={{ background: '#f0f8e8', borderRadius: 10, padding: 12, marginTop: 10, border: '1px solid rgba(90,140,42,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3a6b1a', marginBottom: 8 }}>Historical percentiles</div>
              <ResponsiveContainer width="100%" height={120}>
                <ComposedChart data={displaySeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" ticks={ticks} interval={0} height={20} tick={tickFn} />
                  <YAxis {...yAxisProps} domain={[0, 'auto']} />
                  <ReferenceLine x={todayNearest} stroke="#2d5a1b" strokeWidth={1.5} strokeOpacity={0.6} />
                  <Line dataKey="tempRoundP50" stroke="#88a870" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />
                  <Line dataKey="tempRound"    stroke="#c47a12" strokeWidth={2}   dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              <TodayLabel />
            </div>
          )}
        </div>

        {/* Chart 2: T_max, T_mean, T_min */}
        <div style={styles.card}>
          <FormulaBtn open={fTemp} onToggle={() => setFTemp(v => !v)} />
          {fTemp && (
            <FormulaBox
              lines={`T_mean = (T_max + T_min) / 2`}
              vars={[
                { label: 'T_max today',  value: tMax  != null ? `${tMax.toFixed(1)}°C`  : '—' },
                { label: 'T_min today',  value: tMin  != null ? `${tMin.toFixed(1)}°C`  : '—' },
                { label: 'T_mean today', value: tMean != null ? `${tMean.toFixed(1)}°C` : tMax != null && tMin != null ? `(${tMax.toFixed(1)} + ${tMin.toFixed(1)}) / 2 = ${((tMax + tMin) / 2).toFixed(1)}°C` : '—' },
              ]}
            />
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Temperature (°C)</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Daily T_max, T_mean, T_min · Actual data only (no forecast)</div>
          <RangeBar range={range} setRange={handleRangeChange} />

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && displaySeries.length > 0 && (
            <PanChart canPan={canPan} onPanDelta={handlePanDelta} onTap={handleTap} containerRef={containerRef}>
              <ResponsiveContainer width="100%" height={160}>
                <ComposedChart data={displaySeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" ticks={ticks} interval={0} height={24} tick={tickFn} />
                  <YAxis {...yAxisProps} domain={['auto', 'auto']} />
                  <ReferenceLine x={todayNearest} stroke="#2d5a1b" strokeWidth={2} strokeOpacity={0.7} />
                  {c2.tMax  && <Line dataKey="tMax"  stroke="#c43a2a" strokeWidth={1.5} dot={false} connectNulls />}
                  {c2.tMean && <Line dataKey="tMean" stroke="#c47a12" strokeWidth={2}   dot={false} connectNulls />}
                  {c2.tMin  && <Line dataKey="tMin"  stroke="#2a6a9e" strokeWidth={1.5} dot={false} connectNulls />}
                </ComposedChart>
              </ResponsiveContainer>
            </PanChart>
          )}
          <TodayLabel />
          <Legend items={[
            ...(c2.tMax  ? [{ label: 'T_max',  color: '#c43a2a' }] : []),
            ...(c2.tMean ? [{ label: 'T_mean', color: '#c47a12' }] : []),
            ...(c2.tMin  ? [{ label: 'T_min',  color: '#2a6a9e' }] : []),
          ]} />
          <ToggleBar show={c2} onToggle={toggle2} items={[
            { key: 'tMax',  label: 'T_max',  color: '#c43a2a' },
            { key: 'tMean', label: 'T_mean', color: '#c47a12' },
            { key: 'tMin',  label: 'T_min',  color: '#2a6a9e' },
          ]} />
        </div>

        <NavLinks onNavigate={onNavigate} current="temp" />
      </div>
    </div>
  );
}
