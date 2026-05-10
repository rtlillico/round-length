// round-length/frontend/src/pages/SolarScreen.jsx
import { useState, useMemo } from 'react';
import { C, styles } from '../App';
import { PASTURE_PARAMS, MAX_SOLAR_BY_MONTH, dateToDayOfYear } from '../lib/formula';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  ScenarioBanner, NavLinks, FormulaBtn, FormulaBox, ToggleBar, PctBtn, TodayLabel, Legend,
  buildMonthTicks, xAxisTick, yAxisProps,
} from '../components/SeasonUI';

function buildSeries(chartData, targetLeaves) {
  if (!chartData) return [];
  const n = v => v != null ? Number(v) : null;

  const percByDoy = {};
  for (const p of (chartData.percentiles || [])) percByDoy[p.day_of_year] = p;

  const actual = chartData.actual || [];

  // Solar round length = backward cumsum of temp_lar × solar_factor
  const solarLARs = actual.map(r => {
    const tLAR    = Number(r.temp_lar ?? 0);
    const solarF  = r.solar_factor != null ? Number(r.solar_factor) : 1;
    return tLAR * solarF;
  });

  const solarRounds = actual.map((_, i) => {
    let sum = 0, days = 0;
    for (let j = i; j >= 0; j--) {
      sum += solarLARs[j];
      days++;
      if (sum >= targetLeaves) return days;
    }
    return null;
  });

  const past = actual.map((row, idx) => {
    const date = (row.date || '').slice(0, 10);
    const doy  = dateToDayOfYear(new Date(date + 'T00:00:00Z'));
    const perc = percByDoy[doy] || {};
    return {
      date,
      solarRound:  solarRounds[idx],
      roundP50:    n(perc.round_p50),
      solarFactor: n(row.solar_factor),
      solarP50:    n(perc.solar_p50),
      radiation:   n(row.radiation),
    };
  });

  const future = (chartData.projected?.series || []).slice(0, 90).map(row => ({
    date:      row.date,
    roundP50:  n(row.roundP50),
    solarP50:  n(row.solarP50),
  }));

  return [...past, ...future];
}

export default function SolarScreen({ scenario, chartData, loading, onNavigate }) {
  const [fSolar, setFSolar]   = useState(false);
  const [fRad, setFRad]       = useState(false);
  const [pctRL, setPctRL]     = useState(false);
  const [c1, setC1] = useState({ solarRound: true, solarFactor: true, p50: true });
  const [c2, setC2] = useState({ radiation: true });

  const pasture = PASTURE_PARAMS[scenario.pasture_key];
  const state   = scenario.todayState;
  const target  = Number(scenario.target_leaves);

  const toggle1 = k => setC1(p => ({ ...p, [k]: !p[k] }));
  const toggle2 = k => setC2(p => ({ ...p, [k]: !p[k] }));

  const todayStr  = new Date().toISOString().slice(0, 10);
  const series    = useMemo(() => buildSeries(chartData, target), [chartData, target]);
  const ticks     = buildMonthTicks(series, todayStr);

  const solarF    = state?.solar_factor != null ? Number(state.solar_factor) : null;
  const radiation = state?.radiation    != null ? Number(state.radiation)    : null;
  const todayMonth = new Date().getMonth(); // 0-based
  const maxSolar  = MAX_SOLAR_BY_MONTH[todayMonth];

  const chartProps = { data: series, margin: { top: 5, right: 38, left: -20, bottom: 0 } };

  return (
    <div style={styles.screen}>
      <div style={{ background: '#2d4a1e', position: 'sticky', top: 0, zIndex: 20 }}>
        <ScenarioBanner scenario={scenario} pasture={pasture} title="☀️ Solar" onBack={() => onNavigate('overview')} />
      </div>

      <div style={{ padding: '10px 10px 0' }}>

        {/* Chart 1: Solar round length + Solar factor */}
        <div style={styles.card}>
          <FormulaBtn open={fSolar} onToggle={() => setFSolar(v => !v)} />
          {fSolar && (
            <FormulaBox
              lines={`Solar factor = min(1, radiation / max_solar_for_month)\nSolar LAR = Temp LAR × Solar factor\nSolar round length = cumulative backward sum of daily Solar LAR`}
              vars={[
                { label: 'Max solar this month', value: `${maxSolar} MJ/m²/day` },
                { label: 'Radiation today',      value: radiation != null ? `${radiation.toFixed(1)} MJ/m²/day` : '—' },
                { label: 'Solar factor today',   value: solarF    != null ? solarF.toFixed(3) : '—' },
              ]}
            />
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Solar round length & Solar factor</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Left: round length (days) · Right: Solar factor (0–1) · Dashed = P50</div>

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && series.length > 0 && (
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" ticks={ticks} interval={0} height={24} tick={xAxisTick(todayStr)} />
                <YAxis yAxisId="left"  orientation="left"  {...yAxisProps} domain={[0, 'auto']} />
                <YAxis yAxisId="right" orientation="right" {...yAxisProps} domain={[0, 1]} />
                <ReferenceLine yAxisId="left" x={todayStr} stroke="#2d5a1b" strokeWidth={2} strokeOpacity={0.7} />
                {c1.solarRound  && <Line yAxisId="left"  dataKey="solarRound"  stroke="#c47a12" strokeWidth={2.5} dot={false} connectNulls />}
                {c1.p50         && <Line yAxisId="left"  dataKey="roundP50"    stroke="#c47a12" strokeWidth={1}   dot={false} strokeDasharray="6 3" connectNulls />}
                {c1.solarFactor && <Line yAxisId="right" dataKey="solarFactor" stroke="#d4a020" strokeWidth={2}   dot={false} connectNulls />}
                {c1.p50         && <Line yAxisId="right" dataKey="solarP50"    stroke="#d4a020" strokeWidth={1}   dot={false} strokeDasharray="6 3" connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <TodayLabel />
          <Legend items={[
            { label: 'Solar round length', color: '#c47a12' },
            { label: 'Solar factor',       color: '#d4a020' },
            ...(c1.p50 ? [{ label: 'P50', color: '#88a870', dashed: true }] : []),
          ]} />
          <ToggleBar show={c1} onToggle={toggle1} items={[
            { key: 'solarRound',  label: 'Solar round length', color: '#c47a12' },
            { key: 'solarFactor', label: 'Solar factor',       color: '#d4a020' },
            { key: 'p50',         label: 'P50 average',        color: '#88a870' },
          ]} />
          <div style={{ height: 1, background: '#f0ead8', margin: '10px 0' }} />
          <PctBtn open={pctRL} onToggle={() => setPctRL(v => !v)} />
          {pctRL && (
            <div style={{ background: '#f0f8e8', borderRadius: 10, padding: 12, marginTop: 10, border: '1px solid rgba(90,140,42,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3a6b1a', marginBottom: 8 }}>Historical percentiles</div>
              <ResponsiveContainer width="100%" height={120}>
                <ComposedChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="date" ticks={ticks} interval={0} height={20} tick={xAxisTick(todayStr)} />
                  <YAxis {...yAxisProps} domain={[0, 'auto']} />
                  <ReferenceLine x={todayStr} stroke="#2d5a1b" strokeWidth={1.5} strokeOpacity={0.6} />
                  <Line dataKey="roundP50"   stroke="#88a870" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />
                  <Line dataKey="solarRound" stroke="#c47a12" strokeWidth={2}   dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              <TodayLabel />
            </div>
          )}
        </div>

        {/* Chart 2: Radiation (MJ/m²/day) */}
        <div style={styles.card}>
          <FormulaBtn open={fRad} onToggle={() => setFRad(v => !v)} />
          {fRad && (
            <FormulaBox
              lines={`Solar factor = min(1, radiation / max_monthly_radiation)\nmax_monthly_radiation varies by month (from SILO station climate data)`}
              vars={[
                { label: 'Radiation today',      value: radiation != null ? `${radiation.toFixed(1)} MJ/m²/day` : '—' },
                { label: 'Max solar this month', value: `${maxSolar} MJ/m²/day` },
                { label: 'Solar factor today',   value: solarF    != null ? solarF.toFixed(3) : '—' },
              ]}
            />
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Solar radiation (MJ/m²/day)</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Daily radiation from SILO · Actual data only (no forecast)</div>

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && series.length > 0 && (
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" ticks={ticks} interval={0} height={24} tick={xAxisTick(todayStr)} />
                <YAxis {...yAxisProps} domain={[0, 'auto']} />
                <ReferenceLine x={todayStr} stroke="#2d5a1b" strokeWidth={2} strokeOpacity={0.7} />
                {c2.radiation && <Line dataKey="radiation" stroke="#d4a020" strokeWidth={2} dot={false} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <TodayLabel />
          <Legend items={[
            ...(c2.radiation ? [{ label: 'Radiation', color: '#d4a020' }] : []),
          ]} />
          <ToggleBar show={c2} onToggle={toggle2} items={[
            { key: 'radiation', label: 'Radiation', color: '#d4a020' },
          ]} />
        </div>

        <NavLinks onNavigate={onNavigate} current="solar" />
      </div>
    </div>
  );
}
