// round-length/frontend/src/pages/SeasonOverview.jsx
import { useState } from 'react';
import { C, styles } from '../App';
import { PASTURE_PARAMS, dateToDayOfYear } from '../lib/formula';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  ScenarioBanner, FormulaBtn, FormulaBox, ToggleBar, PctBtn, TodayLabel, Legend,
  buildMonthTicks, xAxisTick, yAxisProps,
} from '../components/SeasonUI';

// ── Series builder ─────────────────────────────────────────────────────────────

function buildSeries(chartData, maxLAR) {
  if (!chartData) return [];
  const n = v => v != null ? Number(v) : null;

  const percByDoy = {};
  for (const p of (chartData.percentiles || [])) percByDoy[p.day_of_year] = p;

  const past = (chartData.actual || []).map(row => {
    const date = (row.date || '').slice(0, 10);
    const doy  = dateToDayOfYear(new Date(date + 'T00:00:00Z'));
    const perc = percByDoy[doy] || {};
    const tLAR = n(row.temp_lar);
    const sol  = n(row.solar_factor);
    const mois = n(row.moisture_factor);
    return {
      date,
      actualRound:    n(row.true_round),
      roundP50:       n(perc.round_p50),
      actualLAR:      n(row.actual_lar ?? row.temp_lar),
      larP50:         n(perc.lar_p50),
      tempLAR:        tLAR,
      tempPct:        tLAR != null ? Math.min(100, (tLAR / maxLAR) * 100) : null,
      solarFactor:    sol,
      solarP50:       n(perc.solar_p50),
      moistureFactor: mois,
      moistureP50:    n(perc.moisture_p50),
    };
  });

  const future = (chartData.projected?.series || []).slice(0, 90).map(row => ({
    date:        row.date,
    roundP50:    n(row.roundP50),
    larP50:      n(row.larP50),
    solarP50:    n(row.solarP50),
    moistureP50: n(row.moistureP50),
  }));

  return [...past, ...future];
}

// ── Progress bar ───────────────────────────────────────────────────────────────

function ProgressBar({ pct, color }) {
  const clamp = Math.max(0, Math.min(100, pct || 0));
  const col = color || (clamp >= 70 ? C.green2 : clamp >= 40 ? C.amber : C.red);
  return (
    <div style={{ background: C.green4, borderRadius: 20, height: 10, overflow: 'hidden', margin: '4px 0' }}>
      <div style={{ width: `${clamp}%`, height: '100%', background: col, borderRadius: 20 }} />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SeasonOverview({ scenario, chartData, loading, error, farmId, onBack, onNavigate }) {
  const [fRL, setFRL]           = useState(false);
  const [fFactors, setFFactors] = useState(false);
  const [showPctRL, setShowPctRL]           = useState(false);
  const [showPctFactors, setShowPctFactors] = useState(false);
  const [c1, setC1] = useState({ rl: true, lar: true, p50: true });
  const [c2, setC2] = useState({ actualLAR: true, tempLAR: true, solar: false, moisture: false, p50: false });

  const pasture = PASTURE_PARAMS[scenario.pasture_key];
  const maxLAR  = pasture ? (pasture.optimumTemp - pasture.baseTemp) / pasture.phyllochron : 0.17;
  const state   = scenario.todayState;
  const toggle1 = k => setC1(p => ({ ...p, [k]: !p[k] }));
  const toggle2 = k => setC2(p => ({ ...p, [k]: !p[k] }));

  const larPct      = state?.temp_lar      != null ? Math.min(100, (Number(state.temp_lar)       / maxLAR) * 100) : 0;
  const solarPct    = state?.solar_factor   != null ? Math.min(100, Number(state.solar_factor)   * 100) : null;
  const moisturePct = state?.moisture_factor != null ? Math.min(100, Number(state.moisture_factor) * 100) : null;
  const combinedPct = solarPct != null && moisturePct != null ? larPct * solarPct / 100 * moisturePct / 100
                    : solarPct != null ? larPct * solarPct / 100 : null;
  const rl        = state?.true_round;
  const rlDisplay = rl == null ? '—' : rl >= 365 ? '365+' : Math.round(rl);
  const rlColor   = rl == null ? C.muted : rl <= 20 ? C.green2 : rl <= 50 ? C.amber : C.red;

  const todayStr = new Date().toISOString().slice(0, 10);
  const series   = buildSeries(chartData, maxLAR);
  const ticks    = buildMonthTicks(series, todayStr);

  const chartProps = {
    data: series,
    margin: { top: 5, right: 38, left: -20, bottom: 0 },
  };

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={{ background: '#2d4a1e', color: '#f0ead8', position: 'sticky', top: 0, zIndex: 20 }}>
        <ScenarioBanner scenario={scenario} pasture={pasture} title="Season overview" onBack={onBack} />
      </div>

      <div style={{ padding: '10px 10px 0' }}>

        {/* Round length today */}
        <div style={{ ...styles.card, textAlign: 'center', paddingTop: 20, paddingBottom: 16 }}>
          <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>
            True round length today
          </div>
          <div style={{ fontFamily: "'Lora', Georgia, serif", fontSize: 72, fontWeight: 700, color: rlColor, lineHeight: 1, letterSpacing: -2 }}>
            {rlDisplay}
          </div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 8 }}>
            days to reach {scenario.target_leaves} leaves
          </div>
          {state?.t_mean != null && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
              T_mean {Number(state.t_mean).toFixed(1)}°C · LAR {Number(state.actual_lar ?? state.temp_lar).toFixed(4)} leaves/day
            </div>
          )}
        </div>

        {/* Growth factors — tappable */}
        <div style={{ ...styles.card, cursor: 'pointer' }} onClick={() => onNavigate('formula')}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 10 }}>Growth factors today</div>

          {[
            { label: '🌡️ Temperature', pct: larPct,       color: larPct >= 70 ? C.green2 : larPct >= 40 ? C.amber : C.red },
            { label: '☀️ Solar',        pct: solarPct,     color: C.green2 },
            { label: '💧 Moisture',     pct: moisturePct,  color: C.green2 },
          ].map(({ label, pct, color }) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 12, color: '#4a5a38' }}>{label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e' }}>{pct != null ? `${Math.round(pct)}%` : '—'}</span>
              </div>
              <ProgressBar pct={pct ?? 0} color={color} />
            </div>
          ))}

          <div style={{ background: '#f0f8e8', borderRadius: 8, padding: '10px 12px', margin: '4px 0 8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e' }}>Overall growth rate</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#2d4a1e' }}>
                {combinedPct != null ? `${Math.round(combinedPct)}%` : `${Math.round(larPct)}%`}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#6b9a5a', marginBottom: 4 }}>of maximum possible growth today</div>
            <ProgressBar pct={combinedPct ?? larPct} color={C.green2} />
          </div>
          <div style={{ fontSize: 11, color: '#5a8c2a', textAlign: 'right', fontWeight: 500 }}>
            Tap to see formula breakdown →
          </div>
        </div>

        {/* Chart 1: Actual round length + LAR */}
        <div style={styles.card}>
          <FormulaBtn open={fRL} onToggle={() => setFRL(v => !v)} />
          {fRL && (
            <FormulaBox
              lines={`Actual round length = Target leaves / Actual LAR\nActual LAR = Temp LAR × Solar × Moisture`}
              vars={[
                { label: 'Target leaves', value: `${scenario.target_leaves}` },
                { label: 'Actual LAR', value: state?.actual_lar ? `${Number(state.actual_lar).toFixed(4)} leaves/day` : '—' },
                { label: 'Round length', value: rl ? `${Math.round(rl)} days` : '—' },
              ]}
            />
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Actual round length (days) & Actual LAR</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Left: round length (days) · Right: LAR (leaves/day) · Dashed = P50 historical average</div>

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && series.length > 0 && (
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" ticks={ticks} interval={0} height={24} tick={xAxisTick(todayStr)} />
                <YAxis yAxisId="left"  orientation="left"  {...yAxisProps} domain={[0, 'auto']} />
                <YAxis yAxisId="right" orientation="right" {...yAxisProps} domain={[0, 'auto']} />
                <ReferenceLine yAxisId="left" x={todayStr} stroke="#2d5a1b" strokeWidth={2} strokeOpacity={0.7} />
                {c1.rl  && <Line yAxisId="left"  dataKey="actualRound" stroke="#3a6b1a" strokeWidth={2.5} dot={false} connectNulls />}
                {c1.p50 && <Line yAxisId="left"  dataKey="roundP50"    stroke="#3a6b1a" strokeWidth={1}   dot={false} strokeDasharray="6 3" connectNulls />}
                {c1.lar && <Line yAxisId="right" dataKey="actualLAR"   stroke="#c47a12" strokeWidth={2}   dot={false} connectNulls />}
                {c1.p50 && <Line yAxisId="right" dataKey="larP50"      stroke="#c47a12" strokeWidth={1}   dot={false} strokeDasharray="6 3" connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <TodayLabel />
          <Legend items={[
            { label: 'Actual round length', color: '#3a6b1a' },
            { label: 'Actual LAR', color: '#c47a12' },
            ...(c1.p50 ? [{ label: 'P50 average', color: '#88a870', dashed: true }] : []),
          ]} />
          <ToggleBar
            show={c1} onToggle={toggle1}
            items={[
              { key: 'rl',  label: 'Round length', color: '#3a6b1a' },
              { key: 'lar', label: 'Actual LAR',   color: '#c47a12' },
              { key: 'p50', label: 'P50 average',  color: '#88a870' },
            ]}
          />
          <div style={{ height: 1, background: '#f0ead8', margin: '10px 0' }} />
          <PctBtn open={showPctRL} onToggle={() => setShowPctRL(v => !v)} />
          {showPctRL && (
            <div style={{ background: '#f0f8e8', borderRadius: 10, padding: 12, marginTop: 10, border: '1px solid rgba(90,140,42,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3a6b1a', marginBottom: 8 }}>
                Historical percentiles <span style={{ background: '#e8f5d0', color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8, marginLeft: 6 }}>PERCENTILES</span>
              </div>
              {series.length > 0 && (
                <ResponsiveContainer width="100%" height={120}>
                  <ComposedChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="date" ticks={ticks} interval={0} height={20} tick={xAxisTick(todayStr)} />
                    <YAxis {...yAxisProps} domain={[0, 'auto']} />
                    <ReferenceLine x={todayStr} stroke="#2d5a1b" strokeWidth={1.5} strokeOpacity={0.6} />
                    <Line dataKey="roundP50"    stroke="#88a870" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />
                    <Line dataKey="actualRound" stroke="#3a6b1a" strokeWidth={2}   dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <TodayLabel />
            </div>
          )}
        </div>

        {/* Chart 2: Growth factors over time */}
        <div style={styles.card}>
          <FormulaBtn open={fFactors} onToggle={() => setFFactors(v => !v)} />
          {fFactors && (
            <FormulaBox
              lines={`Actual LAR = Temp LAR × Solar factor × Moisture factor`}
              vars={[
                { label: 'Temp LAR today',      value: state?.temp_lar      ? `${Number(state.temp_lar).toFixed(4)} leaves/day` : '—' },
                { label: 'Solar factor today',   value: state?.solar_factor   != null ? Number(state.solar_factor).toFixed(2)   : '—' },
                { label: 'Moisture factor today',value: state?.moisture_factor != null ? Number(state.moisture_factor).toFixed(2) : '—' },
              ]}
            />
          )}
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2d4a1e', marginBottom: 2 }}>Growth factors over time</div>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>Left: LAR (leaves/day) · Right: factors (0–1) · Dashed = P50</div>

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && series.length > 0 && (
            <ResponsiveContainer width="100%" height={160}>
              <ComposedChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="date" ticks={ticks} interval={0} height={24} tick={xAxisTick(todayStr)} />
                <YAxis yAxisId="left"  orientation="left"  {...yAxisProps} domain={[0, 'auto']} />
                <YAxis yAxisId="right" orientation="right" {...yAxisProps} domain={[0, 1]} />
                <ReferenceLine yAxisId="left" x={todayStr} stroke="#2d5a1b" strokeWidth={2} strokeOpacity={0.7} />
                {c2.actualLAR && <Line yAxisId="left"  dataKey="actualLAR"      stroke="#3a6b1a" strokeWidth={2.5} dot={false} connectNulls />}
                {c2.tempLAR   && <Line yAxisId="left"  dataKey="tempLAR"        stroke="#1a5a0a" strokeWidth={1.5} dot={false} strokeDasharray="3 2" connectNulls />}
                {c2.solar     && <Line yAxisId="right" dataKey="solarFactor"    stroke="#c47a12" strokeWidth={1.5} dot={false} connectNulls />}
                {c2.solar && c2.p50 && <Line yAxisId="right" dataKey="solarP50" stroke="#c47a12" strokeWidth={1} dot={false} strokeDasharray="5 3" connectNulls />}
                {c2.moisture  && <Line yAxisId="right" dataKey="moistureFactor" stroke="#2a6a9e" strokeWidth={1.5} dot={false} connectNulls />}
                {c2.moisture && c2.p50 && <Line yAxisId="right" dataKey="moistureP50" stroke="#2a6a9e" strokeWidth={1} dot={false} strokeDasharray="5 3" connectNulls />}
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <TodayLabel />
          <Legend items={[
            ...(c2.actualLAR ? [{ label: 'Actual LAR', color: '#3a6b1a' }] : []),
            ...(c2.tempLAR   ? [{ label: 'Temp LAR',   color: '#1a5a0a', dashed: true }] : []),
            ...(c2.solar     ? [{ label: 'Solar factor', color: '#c47a12' }] : []),
            ...(c2.moisture  ? [{ label: 'Moisture factor', color: '#2a6a9e' }] : []),
          ]} />
          <ToggleBar
            show={c2} onToggle={toggle2}
            items={[
              { key: 'actualLAR', label: 'Actual LAR',      color: '#3a6b1a' },
              { key: 'tempLAR',   label: 'Temp LAR',        color: '#1a5a0a' },
              { key: 'solar',     label: 'Solar factor',    color: '#c47a12' },
              { key: 'moisture',  label: 'Moisture factor', color: '#2a6a9e' },
              { key: 'p50',       label: 'P50 average',     color: '#88a870' },
            ]}
          />
          <div style={{ height: 1, background: '#f0ead8', margin: '10px 0' }} />
          <PctBtn open={showPctFactors} onToggle={() => setShowPctFactors(v => !v)} />
          {showPctFactors && (
            <div style={{ background: '#f0f8e8', borderRadius: 10, padding: 12, marginTop: 10, border: '1px solid rgba(90,140,42,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3a6b1a', marginBottom: 8 }}>
                Historical percentiles <span style={{ background: '#e8f5d0', color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8, marginLeft: 6 }}>PERCENTILES</span>
              </div>
              {series.length > 0 && (
                <ResponsiveContainer width="100%" height={120}>
                  <ComposedChart data={series} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="date" ticks={ticks} interval={0} height={20} tick={xAxisTick(todayStr)} />
                    <YAxis {...yAxisProps} domain={[0, 'auto']} />
                    <ReferenceLine x={todayStr} stroke="#2d5a1b" strokeWidth={1.5} strokeOpacity={0.6} />
                    <Line dataKey="larP50"    stroke="#88a870" strokeWidth={1.5} dot={false} strokeDasharray="5 3" connectNulls />
                    <Line dataKey="actualLAR" stroke="#3a6b1a" strokeWidth={2}   dot={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
              <TodayLabel />
            </div>
          )}
        </div>

        {/* Explore in detail */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px', color: C.muted, padding: '0 2px', marginBottom: 7 }}>
            Explore in detail
          </div>
          {[
            { id: 'temp',     icon: '🌡️', label: 'Temperature', sub: 'Temp round length, Temp LAR, T_min, T_max, T_mean' },
            { id: 'moisture', icon: '💧', label: 'Moisture',     sub: 'Moisture factor, soil water, rainfall, ET₀' },
            { id: 'solar',    icon: '☀️', label: 'Solar',        sub: 'Solar factor, actual solar, max solar for month' },
            { id: 'nitrogen', icon: '🌱', label: 'Nitrogen',     sub: 'Nitrogen factor over time' },
          ].map(({ id, icon, label, sub }) => (
            <div key={id} onClick={() => onNavigate(id)} style={{
              background: '#fff', borderRadius: 12, padding: '13px 14px', marginBottom: 7,
              border: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', cursor: 'pointer',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <div>
                  <div style={{ fontSize: 13, color: '#2d4a1e', fontWeight: 600, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 11, color: '#9aab85' }}>{sub}</div>
                </div>
              </div>
              <span style={{ color: '#a8c48a', fontSize: 18 }}>›</span>
            </div>
          ))}
        </div>

        {/* Delete */}
        <div style={{ padding: '0 0 100px' }}>
          <button
            onClick={async () => {
              if (!confirm(`Delete "${scenario.name}"? This cannot be undone.`)) return;
              const { api } = await import('../lib/api');
              await api.scenarios.delete(scenario.id);
              onBack();
            }}
            style={{ width: '100%', background: '#fff', border: `1.5px solid ${C.red}`, borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 500, color: C.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            🗑 Delete this scenario
          </button>
        </div>

      </div>
    </div>
  );
}
