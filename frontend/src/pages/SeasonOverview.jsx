// round-length/frontend/src/pages/SeasonOverview.jsx
import { useState, useMemo, useCallback } from 'react';
import { C, styles } from '../App';
import { PASTURE_PARAMS, dateToDayOfYear } from '../lib/formula';
import {
  ComposedChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import {
  ScenarioBanner, FormulaBtn, FormulaBox, ToggleBar, PctBtn, TodayLabel, Legend,
  buildMonthTicks, xAxisTick, yAxisProps,
} from '../components/SeasonUI';
import SeasonChartPane, {
  CHART_N, CHART_TODAY, getBinDays, makeBins,
} from '../components/SeasonChartPane';

// ── Data preparation ───────────────────────────────────────────────────────────

const toNum = (v) => { const n = Number(v); return (v != null && isFinite(n)) ? n : null; };

function prepareChartData(chartData, targetLeaves) {
  if (!chartData) return null;
  const now = new Date();
  const dates = [];
  for (let i = 0; i < CHART_N; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + (i - CHART_TODAY));
    dates.push(d.toISOString().slice(0, 10));
  }

  const actualByDate = {};
  const projByDate   = {};
  const percByDoy    = {};
  for (const row of (chartData.actual || []))             actualByDate[row.date.slice(0, 10)] = row;
  for (const row of (chartData.projected?.series || []))  projByDate[row.date] = row;
  for (const p   of (chartData.percentiles || []))        percByDoy[p.day_of_year] = p;

  const aRL    = new Array(CHART_N).fill(null);
  const rlP50  = new Array(CHART_N).fill(null);
  const aLAR   = new Array(CHART_N).fill(null);
  const larP50 = new Array(CHART_N).fill(null);
  const tLAR   = new Array(CHART_N).fill(null);
  const solF   = new Array(CHART_N).fill(null);
  const mf     = new Array(CHART_N).fill(null);
  const solP50 = new Array(CHART_N).fill(null);
  const mfP50  = new Array(CHART_N).fill(null);

  for (let i = 0; i < CHART_N; i++) {
    const dateStr = dates[i];
    const d = new Date(dateStr + 'T00:00:00Z');
    const doy = dateToDayOfYear(d);
    const perc = percByDoy[doy];
    if (perc) {
      rlP50[i]  = toNum(perc.round_p50);
      larP50[i] = toNum(perc.lar_p50);
      solP50[i] = toNum(perc.solar_p50);
      mfP50[i]  = toNum(perc.moisture_p50);
      // fall back: compute rl_p50 from lar_p50 when round_p50 is missing
      if (rlP50[i] == null && larP50[i] != null && larP50[i] > 0 && targetLeaves) {
        rlP50[i] = Math.min(365, targetLeaves / larP50[i]);
      }
    }
    if (i <= CHART_TODAY) {
      const row = actualByDate[dateStr];
      if (row) {
        aLAR[i] = toNum(row.actual_lar) ?? toNum(row.temp_lar);
        aRL[i]  = toNum(row.true_round) ?? (aLAR[i] > 0 && targetLeaves ? Math.min(365, targetLeaves / aLAR[i]) : null);
        tLAR[i] = toNum(row.temp_lar);
        solF[i] = toNum(row.solar_factor);
        mf[i]   = toNum(row.moisture_factor);
      }
    } else {
      const row = projByDate[dateStr];
      if (row) {
        if (row.roundP50 != null) rlP50[i]  = toNum(row.roundP50);
        if (row.larP50   != null) larP50[i] = toNum(row.larP50);
        if (row.solarP50 != null) solP50[i] = toNum(row.solarP50);
        if (row.moistureP50 != null) mfP50[i] = toNum(row.moistureP50);
      }
    }
  }
  return { dates, aRL, rlP50, aLAR, larP50, tLAR, solF, mf, solP50, mfP50 };
}

// ── Chart 1 builders (Round length + LAR) ─────────────────────────────────────

const RL_PILLS = {
  rl:       { label: 'Round length',    color: '#3a6b1a', defaultOn: true  },
  rlP50:    { label: 'RL median',       color: '#3a6b1a', dashed: true, defaultOn: true  },
  lar:      { label: 'Actual LAR',      color: '#c47a12', defaultOn: true  },
  larP50:   { label: 'LAR median',      color: '#c47a12', dashed: true, defaultOn: true  },
};

const toXY = (arr) => arr.map((v, i) => v != null ? {x: i, y: v} : null).filter(Boolean);

function buildRLDatasets(prepared, range, visible, containerW) {
  if (!prepared) return [];
  const { aRL, rlP50, aLAR, larP50 } = prepared;
  const binDays = getBinDays(range);
  const rangeW  = range === '1W' ? 14 : range === '1M' ? 60 : CHART_N;
  const bt = Math.max(2, Math.floor((containerW / rangeW) * binDays * 0.82));
  const useBar = range === '1W';

  const larBins = makeBins(aLAR, binDays);
  const larBinData = larBins.past.map((v, i) => v != null ? {x: i, y: v} : null).filter(Boolean);

  const ds = [];

  // LAR — past only, y2
  if (visible.lar) {
    ds.push(useBar ? {
      type: 'bar',
      label: 'Actual LAR',
      data: larBinData,
      backgroundColor: '#c47a1244',
      borderColor: '#c47a12',
      borderWidth: 1,
      barThickness: bt,
      yAxisID: 'y2',
      order: 10,
    } : {
      type: 'line',
      label: 'Actual LAR',
      data: larBinData,
      borderColor: '#c47a12',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.3,
      yAxisID: 'y2',
      order: 1,
    });
  }

  // LAR median line — all days, y2
  if (visible.larP50) {
    ds.push({
      type: 'line',
      label: 'LAR P50',
      data: toXY(larP50),
      borderColor: '#c47a1288',
      borderWidth: 1.5,
      borderDash: [6, 3],
      pointRadius: 0,
      yAxisID: 'y2',
      order: 2,
    });
  }

  // Round length solid — past only, y
  if (visible.rl) {
    ds.push({
      type: 'line',
      label: 'Round length',
      data: toXY(aRL),
      borderColor: '#3a6b1a',
      borderWidth: 2.5,
      pointRadius: 0,
      yAxisID: 'y',
      order: 8,
    });
  }

  // Round length median — all days, y
  if (visible.rlP50) {
    ds.push({
      type: 'line',
      label: 'RL P50',
      data: toXY(rlP50),
      borderColor: '#3a6b1a88',
      borderWidth: 1.5,
      borderDash: [6, 3],
      pointRadius: 0,
      yAxisID: 'y',
      order: 7,
    });
  }

  return ds;
}

function buildRLScales() {
  return {
    y: {
      type: 'linear',
      position: 'left',
      grace: '5%',
      ticks: { font: { size: 10 }, color: C.muted, maxTicksLimit: 6 },
      grid: { color: C.border },
    },
    y2: {
      type: 'linear',
      position: 'right',
      ticks: { font: { size: 10 }, color: '#c47a12', maxTicksLimit: 4 },
      grid: { display: false },
    },
  };
}

function buildRLReadout(dayIdx, visible, dates, prepared) {
  if (!prepared || !dates) return null;
  const { aRL, rlP50, aLAR, larP50 } = prepared;
  const lines = [];
  if (visible.rl   && aRL[dayIdx]   != null) lines.push({ label: 'Round length', value: `${Math.round(aRL[dayIdx])} days`, color: '#3a6b1a' });
  if (visible.rlP50 && rlP50[dayIdx] != null) lines.push({ label: 'RL median',    value: `${Math.round(rlP50[dayIdx])} days`, color: '#3a6b1a' });
  if (visible.lar  && aLAR[dayIdx]  != null) lines.push({ label: 'Actual LAR',   value: Number(aLAR[dayIdx]).toFixed(4), color: '#c47a12' });
  if (visible.larP50 && larP50[dayIdx] != null) lines.push({ label: 'LAR median', value: Number(larP50[dayIdx]).toFixed(4), color: '#c47a12' });
  return { dateLabel: dates[dayIdx] ? fmtDay(dates[dayIdx]) : '', lines };
}

// ── Chart 2 builders (Growth factors) ─────────────────────────────────────────

const GF_PILLS = {
  lar:      { label: 'Actual LAR',      color: '#3a6b1a', defaultOn: true  },
  tLAR:     { label: 'Temp LAR',        color: '#1a5a0a', dashed: true, defaultOn: true  },
  solar:    { label: 'Solar factor',    color: '#c47a12', defaultOn: false },
  moisture: { label: 'Moisture factor', color: '#2a6a9e', defaultOn: false },
  larP50:   { label: 'LAR median',      color: '#88a870', dashed: true, defaultOn: false },
};

function buildGFDatasets(prepared, range, visible, containerW) {
  if (!prepared) return [];
  const { aLAR, larP50, tLAR, solF, mf, solP50, mfP50 } = prepared;
  const binDays = getBinDays(range);
  const rangeW  = range === '1W' ? 14 : range === '1M' ? 60 : CHART_N;
  const bt = Math.max(2, Math.floor((containerW / rangeW) * binDays * 0.82));
  const useBar = range === '1W';

  const larBins  = makeBins(aLAR, binDays);
  const tLARBins = makeBins(tLAR, binDays);
  const larBinData  = larBins.past.map((v, i) => v != null ? {x: i, y: v} : null).filter(Boolean);
  const tLARBinData = tLARBins.past.map((v, i) => v != null ? {x: i, y: v} : null).filter(Boolean);

  const ds = [];

  if (visible.lar) {
    ds.push(useBar ? {
      type: 'bar', label: 'Actual LAR',
      data: larBinData,
      backgroundColor: '#3a6b1a44', borderColor: '#3a6b1a', borderWidth: 1,
      barThickness: bt, yAxisID: 'y', order: 10,
    } : {
      type: 'line', label: 'Actual LAR',
      data: larBinData,
      borderColor: '#3a6b1a', borderWidth: 2,
      pointRadius: 0, tension: 0.3, yAxisID: 'y', order: 10,
    });
  }
  if (visible.tLAR) {
    ds.push(useBar ? {
      type: 'bar', label: 'Temp LAR',
      data: tLARBinData,
      backgroundColor: '#1a5a0a22', borderColor: '#1a5a0a', borderWidth: 1,
      barThickness: bt, yAxisID: 'y', order: 11,
    } : {
      type: 'line', label: 'Temp LAR',
      data: tLARBinData,
      borderColor: '#1a5a0a', borderWidth: 1.5,
      borderDash: [3, 2], pointRadius: 0, tension: 0.3, yAxisID: 'y', order: 11,
    });
  }
  if (visible.larP50) {
    ds.push({
      type: 'line', label: 'LAR P50',
      data: toXY(larP50), borderColor: '#88a87088', borderWidth: 1.5,
      borderDash: [5, 3], pointRadius: 0, yAxisID: 'y', order: 7,
    });
  }
  if (visible.solar) {
    ds.push({
      type: 'line', label: 'Solar',
      data: toXY(solF), borderColor: '#c47a12', borderWidth: 1.5,
      pointRadius: 0, yAxisID: 'y2', order: 8,
    });
    ds.push({
      type: 'line', label: 'Solar P50',
      data: toXY(solP50), borderColor: '#c47a1266', borderWidth: 1,
      borderDash: [5, 3], pointRadius: 0, yAxisID: 'y2', order: 6,
    });
  }
  if (visible.moisture) {
    ds.push({
      type: 'line', label: 'Moisture',
      data: toXY(mf), borderColor: '#2a6a9e', borderWidth: 1.5,
      pointRadius: 0, yAxisID: 'y2', order: 8,
    });
    ds.push({
      type: 'line', label: 'Moisture P50',
      data: toXY(mfP50), borderColor: '#2a6a9e66', borderWidth: 1,
      borderDash: [5, 3], pointRadius: 0, yAxisID: 'y2', order: 6,
    });
  }

  return ds;
}

function buildGFScales(visible) {
  const hasRight = visible?.solar || visible?.moisture;
  return {
    y: {
      type: 'linear', position: 'left', grace: '5%',
      ticks: { font: { size: 10 }, color: C.muted, maxTicksLimit: 5 },
      grid: { color: C.border },
    },
    y2: {
      type: 'linear', position: 'right', beginAtZero: true,
      min: 0, max: 1,
      ticks: { font: { size: 10 }, color: C.muted, maxTicksLimit: 3 },
      grid: { display: false },
      display: !!hasRight,
    },
  };
}

function buildGFReadout(dayIdx, visible, dates, prepared) {
  if (!prepared || !dates) return null;
  const { aLAR, larP50, tLAR, solF, mf } = prepared;
  const lines = [];
  if (visible.lar     && aLAR[dayIdx]  != null) lines.push({ label: 'Actual LAR', value: Number(aLAR[dayIdx]).toFixed(4),  color: '#3a6b1a' });
  if (visible.tLAR    && tLAR[dayIdx]  != null) lines.push({ label: 'Temp LAR',   value: Number(tLAR[dayIdx]).toFixed(4),  color: '#1a5a0a' });
  if (visible.solar   && solF[dayIdx]  != null) lines.push({ label: 'Solar',       value: Number(solF[dayIdx]).toFixed(3),  color: '#c47a12' });
  if (visible.moisture && mf[dayIdx]   != null) lines.push({ label: 'Moisture',    value: Number(mf[dayIdx]).toFixed(3),    color: '#2a6a9e' });
  if (visible.larP50  && larP50[dayIdx] != null) lines.push({ label: 'LAR median', value: Number(larP50[dayIdx]).toFixed(4), color: '#88a870' });
  return { dateLabel: dates[dayIdx] ? fmtDay(dates[dayIdx]) : '', lines };
}

function fmtDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
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

// ── Recharts series for percentile sub-charts (unchanged) ─────────────────────

function buildLegacySeries(chartData, maxLAR) {
  if (!chartData) return [];
  const n = v => v != null ? Number(v) : null;
  const percByDoy = {};
  for (const p of (chartData.percentiles || [])) percByDoy[p.day_of_year] = p;

  const past = (chartData.actual || []).map(row => {
    const date = (row.date || '').slice(0, 10);
    const doy  = dateToDayOfYear(new Date(date + 'T00:00:00Z'));
    const perc = percByDoy[doy] || {};
    return {
      date,
      actualRound: n(row.true_round),
      roundP50:    n(perc.round_p50),
      actualLAR:   n(row.actual_lar ?? row.temp_lar),
      larP50:      n(perc.lar_p50),
    };
  });
  const future = (chartData.projected?.series || []).slice(0, 90).map(row => ({
    date:     row.date,
    roundP50: n(row.roundP50),
    larP50:   n(row.larP50),
  }));
  return [...past, ...future];
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SeasonOverview({ scenario, chartData, loading, error, farmId, onBack, onNavigate }) {
  const [fRL, setFRL]           = useState(false);
  const [fFactors, setFFactors] = useState(false);
  const [showPctRL, setShowPctRL]           = useState(false);
  const [showPctFactors, setShowPctFactors] = useState(false);

  const pasture = PASTURE_PARAMS[scenario.pasture_key];
  const maxLAR  = pasture ? (pasture.optimumTemp - pasture.baseTemp) / pasture.phyllochron : 0.17;
  const state   = scenario.todayState;

  const larPct      = state?.temp_lar       != null ? Math.min(100, (Number(state.temp_lar)        / maxLAR) * 100) : 0;
  const solarPct    = state?.solar_factor    != null ? Math.min(100, Number(state.solar_factor)    * 100) : null;
  const moisturePct = state?.moisture_factor != null ? Math.min(100, Number(state.moisture_factor) * 100) : null;
  const combinedPct = solarPct != null && moisturePct != null ? larPct * solarPct / 100 * moisturePct / 100
                    : solarPct != null ? larPct * solarPct / 100 : null;
  const rl        = state?.true_round;
  const rlDisplay = rl == null ? '—' : rl >= 365 ? '365+' : Math.round(rl);
  const rlColor   = rl == null ? C.muted : rl <= 20 ? C.green2 : rl <= 50 ? C.amber : C.red;

  // Prepared arrays for Chart.js panes
  const prepared = useMemo(() => prepareChartData(chartData, Number(scenario.target_leaves)), [chartData, scenario.target_leaves]);

  // Recharts legacy series for percentile sub-charts
  const todayStr   = new Date().toISOString().slice(0, 10);
  const legacySeries = useMemo(() => buildLegacySeries(chartData, maxLAR), [chartData, maxLAR]);
  const ticks        = buildMonthTicks(legacySeries, todayStr);

  // Stable callbacks for SeasonChartPane
  const rlDatasets = useCallback(
    (range, visible, containerW) => buildRLDatasets(prepared, range, visible, containerW),
    [prepared]
  );
  const rlScales = useCallback(() => buildRLScales(), []);
  const rlReadout = useCallback(
    (dayIdx, visible) => buildRLReadout(dayIdx, visible, prepared?.dates, prepared),
    [prepared]
  );

  const gfDatasets = useCallback(
    (range, visible, containerW) => buildGFDatasets(prepared, range, visible, containerW),
    [prepared]
  );
  const gfScales = useCallback(
    (range, visible) => buildGFScales(visible),
    []
  );
  const gfReadout = useCallback(
    (dayIdx, visible) => buildGFReadout(dayIdx, visible, prepared?.dates, prepared),
    [prepared]
  );

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={{ background: '#2d4a1e', color: '#f0ead8', position: 'sticky', top: 0, zIndex: 20 }}>
        <ScenarioBanner scenario={scenario} pasture={pasture} title="Season overview" onBack={onBack} onGoToScenarios={onBack} />
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

        {/* Growth factors today */}
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

        {/* Chart 1: Round length + LAR */}
        <div style={styles.card}>
          <FormulaBtn open={fRL} onToggle={() => setFRL(v => !v)} />
          {fRL && (
            <FormulaBox
              lines={`Actual round length = Target leaves / Actual LAR\nActual LAR = Temp LAR × Solar × Moisture`}
              vars={[
                { label: 'Target leaves', value: `${scenario.target_leaves}` },
                { label: 'Actual LAR',    value: state?.actual_lar ? `${Number(state.actual_lar).toFixed(4)} leaves/day` : '—' },
                { label: 'Round length',  value: rl ? `${Math.round(rl)} days` : '—' },
              ]}
            />
          )}

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && prepared && (
            <SeasonChartPane
              dates={prepared.dates}
              buildDatasets={rlDatasets}
              buildScales={rlScales}
              buildReadout={rlReadout}
              togglePills={RL_PILLS}
              chartHeight={200}
              label="Actual round length (days) & LAR"
              sublabel="Left: round length · Right: LAR (leaves/day) · Dashed = P50 median"
            />
          )}

          <div style={{ height: 1, background: '#f0ead8', margin: '10px 0' }} />
          <PctBtn open={showPctRL} onToggle={() => setShowPctRL(v => !v)} />
          {showPctRL && (
            <div style={{ background: '#f0f8e8', borderRadius: 10, padding: 12, marginTop: 10, border: '1px solid rgba(90,140,42,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3a6b1a', marginBottom: 8 }}>
                Historical percentiles <span style={{ background: '#e8f5d0', color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8, marginLeft: 6 }}>PERCENTILES</span>
              </div>
              {legacySeries.length > 0 && (
                <ResponsiveContainer width="100%" height={120}>
                  <ComposedChart data={legacySeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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

        {/* Chart 2: Growth factors */}
        <div style={styles.card}>
          <FormulaBtn open={fFactors} onToggle={() => setFFactors(v => !v)} />
          {fFactors && (
            <FormulaBox
              lines={`Actual LAR = Temp LAR × Solar factor × Moisture factor`}
              vars={[
                { label: 'Temp LAR today',       value: state?.temp_lar       ? `${Number(state.temp_lar).toFixed(4)} leaves/day` : '—' },
                { label: 'Solar factor today',    value: state?.solar_factor    != null ? Number(state.solar_factor).toFixed(2)    : '—' },
                { label: 'Moisture factor today', value: state?.moisture_factor != null ? Number(state.moisture_factor).toFixed(2) : '—' },
              ]}
            />
          )}

          {loading && <p style={{ ...styles.muted, textAlign: 'center' }}>Loading...</p>}
          {!loading && prepared && (
            <SeasonChartPane
              dates={prepared.dates}
              buildDatasets={gfDatasets}
              buildScales={gfScales}
              buildReadout={gfReadout}
              togglePills={GF_PILLS}
              chartHeight={200}
              label="Growth factors over time"
              sublabel="Left: LAR (leaves/day) · Right: factors (0–1) · Dashed = P50 median"
            />
          )}

          <div style={{ height: 1, background: '#f0ead8', margin: '10px 0' }} />
          <PctBtn open={showPctFactors} onToggle={() => setShowPctFactors(v => !v)} />
          {showPctFactors && (
            <div style={{ background: '#f0f8e8', borderRadius: 10, padding: 12, marginTop: 10, border: '1px solid rgba(90,140,42,0.15)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#3a6b1a', marginBottom: 8 }}>
                Historical percentiles <span style={{ background: '#e8f5d0', color: '#3a6b1a', fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 8, marginLeft: 6 }}>PERCENTILES</span>
              </div>
              {legacySeries.length > 0 && (
                <ResponsiveContainer width="100%" height={120}>
                  <ComposedChart data={legacySeries} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
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
