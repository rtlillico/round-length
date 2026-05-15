// round-length/frontend/src/pages/MoistureScreen.jsx
import { useState, useMemo } from 'react';
import { C, styles } from '../App';
import { PASTURE_PARAMS, SOIL_PARAMS, dateToDayOfYear } from '../lib/formula';
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
  const actualLARs = actual.map(r => Number(r.actual_lar ?? 0));

  // Backward cumulative sum of actual_lar (temp × solar × moisture) per historical day
  const actualRounds = actual.map((_, i) => {
    let sum = 0, days = 0;
    for (let j = i; j >= 0; j--) {
      sum += actualLARs[j];
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
      actualRound:    actualRounds[idx],
      roundP50:       n(perc.round_p50),
      moistureFactor: n(row.moisture_factor),
      moistureP50:    n(perc.moisture_p50),
      soilWater:      n(row.soil_water),
    };
  });

  const future = (chartData.projected?.series || []).slice(0, 90).map(row => ({
    date:        row.date,
    roundP50:    n(row.roundP50),
    moistureP50: n(row.moistureP50),
  }));

  return [...past, ...future];
}

export default function MoistureScreen({ scenario, chartData, loading, onNavigate }) {
  const [fMoisture, setFMoisture] = useState(false);
  const [fSoil, setFSoil]         = useState(false);
  const [pctRL, setPctRL]         = useState(false);
  const [c1, setC1] = useState({ actualRound: true, moistureFactor: true, p50: true });
  const [c2, setC2] = useState({ soilWater: true });

  const pasture    = PASTURE_PARAMS[scenario.pasture_key];
  const soilParams = SOIL_PARAMS[scenario.soil_type] || SOIL_PARAMS.sandyLoam;
  const state      = scenario.todayState;
  const target     = Number(scenario.target_leaves);

  const toggle1 = k => setC1(p => ({ ...p, [k]: !p[k] }));
  const toggle2 = k => setC2(p => ({ ...p, [k]: !p[k] }));

  const todayStr    = new Date().toISOString().slice(0, 10);
  const series      = useMemo(() => buildSeries(chartData, target), [chartData, target]);
  const ticks       = buildMonthTicks(series, todayStr);

  const moistureF   = state?.moisture_factor != null ? Number(state.moisture_factor) : null;
  const soilWater   = state?.soil_water      != null ? Number(state.soil_water)      : null;
  const swMax       = soilParams.SWmax;

  const chartProps = { data: series, margin: { top: 5, right: 38, left: -20, bottom: 0 } };

  return (
    <div style={styles.screen}>
      <div style={{ background: '#2d4a1e', position: 'sticky', top: 0, zIndex: 20 }}>
        <ScenarioBanner scenario={scenario} pasture={pasture} title="💧 Moisture" onBack={() => onNavigate('overview')} />
      </div>

      <div style={{ padding: '10px 10px 0' }}>

        {/* Chart 1: Actual round length + Moisture factor */}
        <div style={styles.card}>
          <FormulaBtn open={fMoisture} onToggle={() => setFMoisture(v => !v)} />
          {fMoisture && (
            <FormulaBox
              lines={`Moisture factor = min(1, SW / (SWmax × 0.5)) × waterlogging_factor\nActual LAR = Temp LAR × Solar factor × Moisture factor\nActual round length = cumulative backward sum of daily Actual LAR`}
              vars={[
                { label: 'Soil type',             value: soilParams.name },
                { label: 'Field capacity (SWmax)', value: `${swMax} mm` },
                { label: 'Soil water today',      value: soilWater != null ? `${soilWater.toFixed(1)} mm` : '—' },
                { label: 'SW / SWmax today',      value: soilWater != null ? `${(soilWater / swMax * 100).toFixed(0)}%` : '—' },
                { label: 'Moisture factor today', value: moistureF != null ? moistureF.toFixed(3) : '—' },
              ]}
            />
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Actual round length & Moisture factor</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Left: round length (days) · Right: Moisture factor (0–1) · Dashed = P50</div>

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && series.length > 0 && (
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" ticks={ticks} interval={0} height={24} tick={xAxisTick(todayStr)} />
                <YAxis yAxisId="left"  orientation="left"  {...yAxisProps} domain={[0, 'auto']} />
                <YAxis yAxisId="right" orientation="right" {...yAxisProps} domain={[0, 1]} />
                <ReferenceLine yAxisId="left" x={todayStr} stroke="#2d5a1b" strokeWidth={2} strokeOpacity={0.7} />
                {c1.actualRound    && <Line yAxisId="left"  dataKey="actualRound"    stroke="#2a6a9e" strokeWidth={2.5} dot={false} connectNulls />}
                {c1.p50            && <Line yAxisId="left"  dataKey="roundP50"       stroke="#2a6a9e" strokeWidth={1}   dot={false} strokeDasharray="6 3" connectNulls />}
                {c1.moistureFactor && <Line yAxisId="right" dataKey="moistureFactor" stroke="#3a6b1a" strokeWidth={2}   dot={false} connectNulls />}
                {c1.p50            && <Line yAxisId="right" dataKey="moistureP50"    stroke="#3a6b1a" strokeWidth={1}   dot={false} strokeDasharray="6 3" connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <TodayLabel />
          <Legend items={[
            { label: 'Actual round length', color: '#2a6a9e' },
            { label: 'Moisture factor',     color: '#3a6b1a' },
            ...(c1.p50 ? [{ label: 'P50', color: '#88a870', dashed: true }] : []),
          ]} />
          <ToggleBar show={c1} onToggle={toggle1} items={[
            { key: 'actualRound',    label: 'Actual round length', color: '#2a6a9e' },
            { key: 'moistureFactor', label: 'Moisture factor',     color: '#3a6b1a' },
            { key: 'p50',            label: 'P50 average',         color: '#88a870' },
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
                  <Line dataKey="roundP50"    stroke="#88a870" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />
                  <Line dataKey="actualRound" stroke="#2a6a9e" strokeWidth={2}   dot={false} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
              <TodayLabel />
            </div>
          )}
        </div>

        {/* Chart 2: Soil water (mm) */}
        <div style={styles.card}>
          <FormulaBtn open={fSoil} onToggle={() => setFSoil(v => !v)} />
          {fSoil && (
            <FormulaBox
              lines={`SW_today = SW_yesterday + Rainfall − ET₀ − Drainage\nET₀ = Morton wet-environment ET (from SILO)\nDrainage = max(0, SW − SWmax) × drainageRate`}
              vars={[
                { label: 'Soil type',        value: soilParams.name },
                { label: 'Field capacity',   value: `${swMax} mm` },
                { label: 'Drainage rate',    value: `${(soilParams.drainageRate * 100).toFixed(0)}%/day` },
                { label: 'Soil water today', value: soilWater != null ? `${soilWater.toFixed(1)} mm` : '—' },
              ]}
            />
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Soil water (mm)</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Modelled soil water balance · Actual data only (no forecast)</div>

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && series.length > 0 && (
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" ticks={ticks} interval={0} height={24} tick={xAxisTick(todayStr)} />
                <YAxis {...yAxisProps} domain={[0, swMax * 1.1]} />
                <ReferenceLine x={todayStr} stroke="#2d5a1b" strokeWidth={2} strokeOpacity={0.7} />
                <ReferenceLine y={swMax} stroke="#5a9ecf" strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.7} />
                {c2.soilWater && <Line dataKey="soilWater" stroke="#2a6a9e" strokeWidth={2} dot={false} connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <TodayLabel />
          <Legend items={[
            ...(c2.soilWater ? [{ label: 'Soil water', color: '#2a6a9e' }] : []),
            { label: `Field capacity (${swMax} mm)`, color: '#5a9ecf', dashed: true },
          ]} />
          <ToggleBar show={c2} onToggle={toggle2} items={[
            { key: 'soilWater', label: 'Soil water', color: '#2a6a9e' },
          ]} />
        </div>

        <NavLinks onNavigate={onNavigate} current="moisture" />
      </div>
    </div>
  );
}
