// round-length/frontend/src/pages/ScenarioDetail.jsx
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { PASTURE_PARAMS } from '../lib/formula';
import { C, styles } from '../App';
import FormulaBreakdown from './FormulaBreakdown';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  ReferenceLine, ReferenceDot, ResponsiveContainer, Brush
} from 'recharts';

function ProgressBar({ pct, color }) {
  const clamp = Math.max(0, Math.min(100, pct || 0));
  const col = color || (clamp >= 70 ? C.green2 : clamp >= 40 ? C.amber : C.red);
  return (
    <div style={{ background: C.green4, borderRadius: 20, height: 12, overflow: 'hidden', margin: '6px 0' }}>
      <div style={{ width: `${clamp}%`, height: '100%', background: col, borderRadius: 20 }} />
    </div>
  );
}

// Format date for chart X axis
function fmtDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}


export default function ScenarioDetail({ scenario, farmId, onBack }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [chartData, setChartData]   = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [chartView, setChartView]         = useState('round'); // 'round' | 'lar'
  const [showAverage, setShowAverage]     = useState(true);
  const [showNormalRange, setShowNormalRange] = useState(true);
  const [showFullRange, setShowFullRange] = useState(false);
  const [activePoint, setActivePoint]     = useState(null);
  const [cursorX, setCursorX]             = useState(null);
  const brushRangeRef                     = useRef(null); // tracks brush position during drag (no re-renders)
  const [brushRange, setBrushRange]       = useState(null); // committed position after drag ends
  const chartContainerRef                 = useRef(null);

  const state   = scenario.todayState;
  const pasture = PASTURE_PARAMS[scenario.pasture_key];
  const maxLAR  = pasture ? (pasture.optimumTemp - pasture.baseTemp) / pasture.phyllochron : 0.17;
  const larPct      = state?.temp_lar ? Math.min(100, (Number(state.temp_lar) / maxLAR) * 100) : 0;
  const solarPct    = state?.solar_factor   != null ? Math.min(100, Number(state.solar_factor)   * 100) : null;
  const moisturePct = state?.moisture_factor != null ? Math.min(100, Number(state.moisture_factor) * 100) : null;
  const combinedPct = solarPct != null && moisturePct != null ? larPct * solarPct / 100 * moisturePct / 100
                    : solarPct != null                        ? larPct * solarPct / 100
                    : null;
  const rl      = state?.true_round;
  const rlDisplay = rl == null ? '—' : rl >= 365 ? '365+' : Math.round(rl);
  const rlColor = rl == null ? C.muted : rl <= 20 ? C.green2 : rl <= 50 ? C.amber : C.red;

  useEffect(() => {
    api.scenarios.chart(scenario.id)
      .then(data => { setChartData(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [scenario.id]);

  // Commit brush position to state on drag end — one re-render after release,
  // not on every pixel, so the brush moves freely during drag.
  useEffect(() => {
    const onDragEnd = () => {
      if (brushRangeRef.current) setBrushRange({ ...brushRangeRef.current });
    };
    document.addEventListener('mouseup', onDragEnd);
    document.addEventListener('touchend', onDragEnd);
    return () => {
      document.removeEventListener('mouseup', onDragEnd);
      document.removeEventListener('touchend', onDragEnd);
    };
  }, []);

  if (showBreakdown) {
    return <FormulaBreakdown scenario={scenario} actualSeries={chartData?.actual} onBack={() => setShowBreakdown(false)} />;
  }

  function dateToDayOfYear(dateStr) {
    const d = new Date(dateStr);
    const start = new Date(d.getFullYear(), 0, 0);
    let doy = Math.floor((d - start) / 86400000);
    const isLeap = d.getFullYear() % 4 === 0 && (d.getFullYear() % 100 !== 0 || d.getFullYear() % 400 === 0);
    if (isLeap && doy > 59) doy--;
    return Math.min(doy, 365);
  }

  // Build chart series: actual past + percentile band spanning both past and future
  function buildChartSeries() {
    if (!chartData) return [];

    const n = v => v != null ? Number(v) : null;

    // Build day-of-year → percentile lookup for past dates
    const percByDoy = {};
    for (const p of (chartData.percentiles || [])) percByDoy[p.day_of_year] = p;

    // Past: actual values + historical percentile band for that day-of-year
    const past = (chartData.actual || []).map(row => {
      const date = (row.date || '').slice(0, 10); // normalize to YYYY-MM-DD regardless of pg driver format
      const perc = percByDoy[dateToDayOfYear(date)] || {};
      const rP10 = n(perc.round_p10), rP25 = n(perc.round_p25), rP75 = n(perc.round_p75), rP90 = n(perc.round_p90);
      const lP10 = n(perc.lar_p10),   lP25 = n(perc.lar_p25),   lP75 = n(perc.lar_p75),   lP90 = n(perc.lar_p90);
      // Solar stored as 0–1; multiply by 100 for % display on chart
      const s = v => n(v) != null ? n(v) * 100 : null;
      const sP10 = s(perc.solar_p10), sP25 = s(perc.solar_p25), sP75 = s(perc.solar_p75), sP90 = s(perc.solar_p90);
      return {
        date,
        actualRound:  n(row.true_round),
        actualLAR:    n(row.actual_lar ?? row.temp_lar),
        actualSolar:  n(row.solar_factor) != null ? n(row.solar_factor) * 100 : null,
        bandRoundP10: rP10,
        bandRoundP25: rP25,
        bandRoundP50: n(perc.round_p50),
        bandRoundP75: rP75,
        bandRoundP90: rP90,
        bandRoundNormalHeight: rP25 != null && rP75 != null ? Math.max(0, rP75 - rP25) : null,
        bandRoundFullHeight:   rP10 != null && rP90 != null ? Math.max(0, rP90 - rP10) : null,
        bandLARP10:   lP10,
        bandLARP25:   lP25,
        bandLARP50:   n(perc.lar_p50),
        bandLARP75:   lP75,
        bandLARP90:   lP90,
        bandLARNormalHeight: lP25 != null && lP75 != null ? Math.max(0, lP75 - lP25) : null,
        bandLARFullHeight:   lP10 != null && lP90 != null ? Math.max(0, lP90 - lP10) : null,
        bandSolarP10: sP10,
        bandSolarP25: sP25,
        bandSolarP50: s(perc.solar_p50),
        bandSolarP75: sP75,
        bandSolarP90: sP90,
        bandSolarNormalHeight: sP25 != null && sP75 != null ? Math.max(0, sP75 - sP25) : null,
        bandSolarFullHeight:   sP10 != null && sP90 != null ? Math.max(0, sP90 - sP10) : null,
      };
    });

    // Future: projected percentile band (same field names → seamless continuation)
    const future = (chartData.projected?.series || []).map(row => {
      const rP10 = n(row.roundP10), rP25 = n(row.roundP25), rP75 = n(row.roundP75), rP90 = n(row.roundP90);
      const lP10 = n(row.larP10),   lP25 = n(row.larP25),   lP75 = n(row.larP75),   lP90 = n(row.larP90);
      const s = v => n(v) != null ? n(v) * 100 : null;
      const sP10 = s(row.solarP10), sP25 = s(row.solarP25), sP75 = s(row.solarP75), sP90 = s(row.solarP90);
      return {
        date:         row.date,
        bandRoundP10: rP10,
        bandRoundP25: rP25,
        bandRoundP50: n(row.roundP50),
        bandRoundP75: rP75,
        bandRoundP90: rP90,
        bandRoundNormalHeight: rP25 != null && rP75 != null ? Math.max(0, rP75 - rP25) : null,
        bandRoundFullHeight:   rP10 != null && rP90 != null ? Math.max(0, rP90 - rP10) : null,
        bandLARP10:   lP10,
        bandLARP25:   lP25,
        bandLARP50:   n(row.larP50),
        bandLARP75:   lP75,
        bandLARP90:   lP90,
        bandLARNormalHeight: lP25 != null && lP75 != null ? Math.max(0, lP75 - lP25) : null,
        bandLARFullHeight:   lP10 != null && lP90 != null ? Math.max(0, lP90 - lP10) : null,
        bandSolarP10: sP10,
        bandSolarP25: sP25,
        bandSolarP50: s(row.solarP50),
        bandSolarP75: sP75,
        bandSolarP90: sP90,
        bandSolarNormalHeight: sP25 != null && sP75 != null ? Math.max(0, sP75 - sP25) : null,
        bandSolarFullHeight:   sP10 != null && sP90 != null ? Math.max(0, sP90 - sP10) : null,
      };
    });

    return [...past, ...future];
  }

  const series = buildChartSeries();
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0 }}>←</button>
          )}
          <div>
            <div style={styles.headerTitle}>{scenario.name}</div>
            <div style={styles.headerSub}>{pasture?.name || scenario.pasture_key} · {scenario.target_leaves} leaf target</div>
          </div>
        </div>
      </div>

      {/* Big round length */}
      <div style={{ ...styles.card, textAlign: 'center', paddingTop: 24, paddingBottom: 20 }}>
        <div style={{ fontSize: 13, color: C.muted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
          True round length today
        </div>
        <div style={{ fontSize: 88, fontWeight: 'bold', color: rlColor, lineHeight: 1, letterSpacing: -4 }}>
          {rlDisplay}
        </div>
        <div style={styles.bigLabel}>days to reach {scenario.target_leaves} leaves</div>
        {state?.t_mean != null && (
          <div style={{ fontSize: 14, color: C.muted, marginTop: 8 }}>
            T_mean {Number(state.t_mean).toFixed(1)}°C ·
            LAR {Number(state.actual_lar ?? state.temp_lar).toFixed(4)} leaves/day
          </div>
        )}
      </div>

      {/* Growth factors card — tappable to open formula breakdown */}
      <div style={{ ...styles.card, cursor: 'pointer' }} onClick={() => setShowBreakdown(true)}>
        <p style={{ ...styles.h3, marginTop: 0, marginBottom: 10 }}>Growth factors today</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: 13, color: C.muted }}>🌡️ Temperature</span>
          <span style={{ fontSize: 14, fontWeight: 'bold', color: C.green1 }}>{Math.round(larPct)}%</span>
        </div>
        <ProgressBar pct={larPct} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, color: C.muted }}>☀️ Sunlight</span>
          <span style={{ fontSize: 14, fontWeight: 'bold', color: C.green1 }}>
            {solarPct != null ? `${Math.round(solarPct)}%` : '—'}
          </span>
        </div>
        <ProgressBar pct={solarPct ?? 0} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 13, color: C.muted }}>💧 Moisture</span>
          <span style={{ fontSize: 14, fontWeight: 'bold', color: C.green1 }}>
            {moisturePct != null ? `${Math.round(moisturePct)}%` : '—'}
          </span>
        </div>
        <ProgressBar pct={moisturePct ?? 0} />
        <div style={{ borderTop: `1px solid ${C.border}`, margin: '10px 0 6px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 'bold', color: C.green1 }}>Combined growth</span>
          <span style={{ fontSize: 16, fontWeight: 'bold', color: C.green1 }}>
            {combinedPct != null ? `${Math.round(combinedPct)}%` : `${Math.round(larPct)}%`}
          </span>
        </div>
        <ProgressBar pct={combinedPct ?? larPct} color={C.green2} />
        <p style={{ ...styles.muted, fontSize: 12, marginTop: 8 }}>
          Temperature: below {pasture?.baseTemp ?? 5}°C grass stops growing, best at {pasture?.optimumTemp ?? 22}°C.
          {solarPct == null && ' Sunlight data not yet available — recompute after running nightly update.'}
        </p>
        <p style={{ fontSize: 12, color: C.green2, textAlign: 'right', margin: '6px 0 0', fontWeight: 500 }}>
          Tap to see formula breakdown →
        </p>
      </div>

      {/* Chart */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ ...styles.h3, margin: 0 }}>Growth history & forecast</p>
          <div style={{ display: 'flex', gap: 6 }}>
            {['round', 'lar', 'solar'].map(v => (
              <button key={v} onClick={() => setChartView(v)} style={{
                padding: '4px 10px', borderRadius: 8, border: `1.5px solid ${C.green2}`,
                background: chartView === v ? C.green2 : 'transparent',
                color: chartView === v ? '#fff' : C.green2,
                cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
              }}>
                {v === 'round' ? 'Round length' : v === 'lar' ? 'LAR' : 'Solar'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          {[
            { key: 'avg',    label: 'Average',      active: showAverage,     toggle: () => setShowAverage(v => !v) },
            { key: 'normal', label: 'Normal range',  active: showNormalRange, toggle: () => setShowNormalRange(v => !v) },
            { key: 'full',   label: 'Full range',    active: showFullRange,   toggle: () => setShowFullRange(v => !v) },
          ].map(({ key, label, active, toggle }) => (
            <button key={key} onClick={toggle} style={{
              padding: '3px 10px', borderRadius: 20, border: `1.5px solid #e07b20`,
              background: active ? '#e07b20' : 'transparent',
              color: active ? '#fff' : '#e07b20',
              cursor: 'pointer', fontSize: 12, fontWeight: 'bold',
            }}>
              {label}
            </button>
          ))}
        </div>

        {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading chart data...</p>}
        {error   && <p style={{ color: C.red, fontSize: 13 }}>Chart error: {error}</p>}

        {!loading && !error && series.length > 0 && (() => {
          const todayIdx = series.findIndex(r => r.date >= todayStr);

          // Build one tick per month-start that exists in the series, plus today.
          // Use UTC throughout — dates from PostgreSQL are "YYYY-MM-DD" strings parsed as UTC.
          const chartTicks = (() => {
            const dateSet = new Set(series.map(r => r.date));
            const ticks = [];
            const end = new Date(series[series.length - 1].date); // UTC midnight
            let d = new Date(series[0].date);
            d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); // first of month, UTC
            while (d <= end) {
              const s = d.toISOString().slice(0, 10); // "YYYY-MM-01"
              if (dateSet.has(s)) ticks.push(s);
              d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
            }
            return [...new Set([...ticks, todayStr])].sort();
          })();

          const fmt = (v, decimals) => v != null ? Number(v).toFixed(decimals) : '—';
          const isLAR   = chartView === 'lar';
          const isSolar = chartView === 'solar';

          const defaultBrushStart = Math.max(0, todayIdx - 180);
          const defaultBrushEnd   = Math.min(series.length - 1, todayIdx + 180);
          // Read brush range from ref (no re-renders on drag)
          const brushStart = brushRangeRef.current?.startIndex ?? defaultBrushStart;
          const brushEnd   = brushRangeRef.current?.endIndex   ?? defaultBrushEnd;

          const todayPoint  = todayIdx >= 0 ? series[todayIdx] : null;
          const todayActual = isSolar ? todayPoint?.actualSolar
                            : isLAR  ? todayPoint?.actualLAR
                            :          todayPoint?.actualRound;

          const handleTouch = (e) => {
            const touch = e.touches[0];
            if (!chartContainerRef.current || !touch) return;
            const rect = chartContainerRef.current.getBoundingClientRect();
            const leftPad   = 35;
            const rightPad  = 5;
            const plotWidth = rect.width - leftPad - rightPad;
            const relX      = touch.clientX - rect.left - leftPad;
            const frac      = Math.max(0, Math.min(1, relX / plotWidth));
            // Read current brush range fresh from ref — closure values go stale after brush drag
            const curStart  = brushRangeRef.current?.startIndex ?? defaultBrushStart;
            const curEnd    = brushRangeRef.current?.endIndex   ?? defaultBrushEnd;
            const visCount  = curEnd - curStart + 1;
            const idx       = Math.max(curStart, Math.min(curEnd, curStart + Math.round(frac * (visCount - 1))));
            setActivePoint(series[idx]);
            setCursorX(touch.clientX - rect.left);
          };

          return (
            <>
              {/* Info bar */}
              {activePoint ? (
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: '#fff8f0', border: `1px solid #e07b20`, borderRadius: 8,
                  padding: '8px 12px', marginBottom: 8, fontSize: 13,
                }}>
                  <span style={{ fontWeight: 'bold', color: C.green1 }}>{fmtDate(activePoint.date)}</span>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {isSolar ? (
                      <>
                        <span style={{ color: C.green1 }}>Actual: {fmt(activePoint.actualSolar, 1)}%</span>
                        <span style={{ color: '#e07b20' }}>Average: {fmt(activePoint.bandSolarP50, 1)}%</span>
                        <span style={{ color: C.muted }}>Range: {fmt(activePoint.bandSolarP10, 1)}–{fmt(activePoint.bandSolarP90, 1)}%</span>
                      </>
                    ) : isLAR ? (
                      <>
                        <span style={{ color: C.green1 }}>Actual: {fmt(activePoint.actualLAR, 4)}</span>
                        <span style={{ color: '#e07b20' }}>Average: {fmt(activePoint.bandLARP50, 4)}</span>
                        <span style={{ color: C.muted }}>Range: {fmt(activePoint.bandLARP10, 4)}–{fmt(activePoint.bandLARP90, 4)}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ color: C.green1 }}>Actual: {fmt(activePoint.actualRound, 0)} days</span>
                        <span style={{ color: '#e07b20' }}>Average: {fmt(activePoint.bandRoundP50, 0)} days</span>
                        <span style={{ color: C.muted }}>Range: {fmt(activePoint.bandRoundP10, 0)}–{fmt(activePoint.bandRoundP90, 0)} days</span>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ height: 37, marginBottom: 8 }} />
              )}

              <div
                ref={chartContainerRef}
                style={{ position: 'relative' }}
                onTouchStart={handleTouch}
                onTouchMove={handleTouch}
                onTouchEnd={() => { setActivePoint(null); setCursorX(null); }}
              >
                {/* Crosshair overlay — drawn as an SVG over the chart so it works at any brush position */}
                {cursorX != null && (
                  <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 10 }}>
                    <line x1={cursorX} y1={5} x2={cursorX} y2={255}
                      stroke="#2d5a1b" strokeWidth={1.5} strokeDasharray="4 2" />
                  </svg>
                )}
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart
                    data={series}
                    margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                    onMouseMove={state => {
                      if (state?.activePayload?.length) {
                        setActivePoint(state.activePayload[0].payload);
                        setCursorX(state.activeCoordinate?.x ?? null);
                      }
                    }}
                    onMouseLeave={() => { setActivePoint(null); setCursorX(null); }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis
                      dataKey="date"
                      ticks={chartTicks}
                      interval={0}
                      height={36}
                      tick={({ x, y, payload }) => {
                        const isToday = payload.value === todayStr;
                        if (isToday) {
                          return (
                            <text textAnchor="middle" fontSize={10} fontWeight="bold" fill="#2d5a1b">
                              <tspan x={x} y={y + 12}>TODAY</tspan>
                            </text>
                          );
                        }
                        const d = new Date(payload.value); // UTC midnight
                        const mon = d.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });
                        const isJan = d.getUTCMonth() === 0;
                        return (
                          <text textAnchor="middle" fontSize={10} fill={C.muted}>
                            <tspan x={x} y={y + 12}>{mon}</tspan>
                            {isJan && <tspan x={x} y={y + 22} fontSize={9}>{d.getUTCFullYear()}</tspan>}
                          </text>
                        );
                      }}
                    />
                    <YAxis tick={{ fontSize: 10, fill: C.muted }} />

                    {chartView === 'round' && <>
                      {showFullRange && <>
                        <Area dataKey="bandRoundP10"          fillOpacity={0}   stroke="none" stackId="rFull" connectNulls />
                        <Area dataKey="bandRoundFullHeight"   fill="#fff3e0" fillOpacity={0.8} stroke="none" stackId="rFull" connectNulls />
                      </>}
                      {showNormalRange && <>
                        <Area dataKey="bandRoundP25"          fillOpacity={0}   stroke="none" stackId="rNorm" connectNulls />
                        <Area dataKey="bandRoundNormalHeight" fill="#ffe0b2" fillOpacity={0.9} stroke="none" stackId="rNorm" connectNulls />
                      </>}
                      {showAverage && <Line dataKey="bandRoundP50" stroke="#e07b20" strokeWidth={2} dot={false} strokeDasharray="6 3" connectNulls />}
                      <Line dataKey="actualRound" stroke={C.green1} strokeWidth={3} dot={false} connectNulls />
                    </>}

                    {chartView === 'lar' && <>
                      {showFullRange && <>
                        <Area dataKey="bandLARP10"          fillOpacity={0}   stroke="none" stackId="lFull" connectNulls />
                        <Area dataKey="bandLARFullHeight"   fill="#fff3e0" fillOpacity={0.8} stroke="none" stackId="lFull" connectNulls />
                      </>}
                      {showNormalRange && <>
                        <Area dataKey="bandLARP25"          fillOpacity={0}   stroke="none" stackId="lNorm" connectNulls />
                        <Area dataKey="bandLARNormalHeight" fill="#ffe0b2" fillOpacity={0.9} stroke="none" stackId="lNorm" connectNulls />
                      </>}
                      {showAverage && <Line dataKey="bandLARP50" stroke="#e07b20" strokeWidth={2} dot={false} strokeDasharray="6 3" connectNulls />}
                      <Line dataKey="actualLAR" stroke={C.green1} strokeWidth={3} dot={false} connectNulls />
                    </>}

                    {chartView === 'solar' && <>
                      {showFullRange && <>
                        <Area dataKey="bandSolarP10"          fillOpacity={0}   stroke="none" stackId="sFull" connectNulls />
                        <Area dataKey="bandSolarFullHeight"   fill="#fff3e0" fillOpacity={0.8} stroke="none" stackId="sFull" connectNulls />
                      </>}
                      {showNormalRange && <>
                        <Area dataKey="bandSolarP25"          fillOpacity={0}   stroke="none" stackId="sNorm" connectNulls />
                        <Area dataKey="bandSolarNormalHeight" fill="#ffe0b2" fillOpacity={0.9} stroke="none" stackId="sNorm" connectNulls />
                      </>}
                      {showAverage && <Line dataKey="bandSolarP50" stroke="#e07b20" strokeWidth={2} dot={false} strokeDasharray="6 3" connectNulls />}
                      <Line dataKey="actualSolar" stroke={C.green1} strokeWidth={3} dot={false} connectNulls />
                    </>}

                    <Brush
                      dataKey="date"
                      height={20}
                      stroke={C.green3}
                      tickFormatter={fmtDate}
                      startIndex={brushRange?.startIndex ?? defaultBrushStart}
                      endIndex={brushRange?.endIndex   ?? defaultBrushEnd}
                      onChange={({ startIndex, endIndex }) => {
                        brushRangeRef.current = { startIndex, endIndex };
                      }}
                    />
                    {/* Today glow layer */}
                    <ReferenceLine x={todayStr} stroke="#2d5a1b" strokeWidth={10} strokeOpacity={0.12} />
                    {/* Today solid line */}
                    <ReferenceLine x={todayStr} stroke="#2d5a1b" strokeWidth={3} />
                    {/* Today dot on actual line — rendered last so it sits on top */}
                    {todayActual != null && (
                      <ReferenceDot x={todayStr} y={todayActual} r={6} fill="#2d5a1b" stroke="#fff" strokeWidth={2} />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </>
          );
        })()}

        {/* Manual colour key */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
            <div style={{ width: 24, height: 3, background: C.green1, borderRadius: 2, flexShrink: 0 }} />
            Actual {chartView === 'round' ? 'round length' : chartView === 'lar' ? 'LAR' : 'solar factor (%)'}
          </div>
          {showAverage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
              <div style={{ width: 24, height: 0, borderTop: '2px dashed #e07b20', flexShrink: 0 }} />
              Average (typical year)
            </div>
          )}
          {showNormalRange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
              <div style={{ width: 24, height: 10, background: '#ffe0b2', border: '1px solid #e07b20', borderRadius: 2, flexShrink: 0 }} />
              Normal range (25th–75th pct)
            </div>
          )}
          {showFullRange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted }}>
              <div style={{ width: 24, height: 10, background: '#fff3e0', border: '1px solid #e07b20', borderRadius: 2, flexShrink: 0 }} />
              Full range (10th–90th pct)
            </div>
          )}
        </div>
      </div>

      {/* Projected round */}
      {chartData?.projected?.roundLength && (
        <div style={styles.card}>
          <p style={styles.h3}>📅 Projected next round</p>
          <div style={{ fontSize: 40, fontWeight: 'bold', color: C.green1, textAlign: 'center' }}>
            {Math.round(chartData.projected.roundLength)} days
          </div>
          <p style={{ ...styles.muted, fontSize: 13, textAlign: 'center', marginTop: 4 }}>
            Based on average conditions from today forward
          </p>
        </div>
      )}

      {/* Delete button */}
      <div style={{ padding: '8px 16px 20px' }}>
        <button
          onClick={async () => {
            if (!confirm(`Delete "${scenario.name}"? This cannot be undone.`)) return;
            await api.scenarios.delete(scenario.id);
            onBack();
          }}
          style={{ ...styles.btnOutline, color: C.red, borderColor: C.red, fontSize: 14 }}
        >
          🗑 Delete this scenario
        </button>
      </div>
    </div>
  );
}
