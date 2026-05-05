// round-length/frontend/src/components/ComparisonTable.jsx
import { useState } from 'react';
import { C, styles } from '../App';
import { PASTURE_PARAMS } from '../lib/formula';

const LS_INFO  = 'rl_seen_table_info';
const LS_SWIPE = 'rl_seen_swipe_banner';

// Compute display metrics from a scenario's todayState
function computeMetrics(scenario) {
  const state   = scenario.todayState;
  const pasture = PASTURE_PARAMS[scenario.pasture_key];
  const maxLAR  = pasture
    ? (pasture.optimumTemp - pasture.baseTemp) / pasture.phyllochron
    : 0.17;

  const tempPct = state?.temp_lar != null
    ? Math.min(100, (Number(state.temp_lar) / maxLAR) * 100)
    : null;
  const solPct = state?.solar_factor != null
    ? Math.min(100, Number(state.solar_factor) * 100)
    : null;
  const combPct = tempPct != null && solPct != null
    ? tempPct * solPct / 100
    : tempPct; // fall back to temp-only if no solar
  const roundLen = state?.true_round != null ? Number(state.true_round) : null;
  const larRaw   = state?.actual_lar ?? state?.temp_lar;
  const larVal   = larRaw != null ? Number(larRaw) : null;

  return { tempPct, solPct, combPct, roundLen, larVal };
}

// Return the index of the best value (null values are excluded)
function bestIdx(values, lowerIsBetter) {
  let best = null;
  let idx  = -1;
  values.forEach((v, i) => {
    if (v == null) return;
    if (best == null || (lowerIsBetter ? v < best : v > best)) {
      best = v;
      idx  = i;
    }
  });
  return idx;
}

function fmtRound(v) {
  if (v == null) return '—';
  if (v >= 365)  return '365+';
  return String(Math.round(v));
}
function fmtPct(v) { return v != null ? `${Math.round(v)}%` : '—'; }
function fmtLAR(v) { return v != null ? Number(v).toFixed(4) : '—'; }

const LABEL_W  = 96;
const COL_W    = 112;

export default function ComparisonTable({ scenarios, onSelectScenario }) {
  const [showInfo,  setShowInfo]  = useState(() => !localStorage.getItem(LS_INFO));
  const [showSwipe, setShowSwipe] = useState(
    () => !localStorage.getItem(LS_SWIPE) && scenarios.length >= 4
  );

  function dismissInfo() {
    localStorage.setItem(LS_INFO, '1');
    setShowInfo(false);
  }
  function dismissSwipe() {
    localStorage.setItem(LS_SWIPE, '1');
    setShowSwipe(false);
  }

  const metrics = scenarios.map(computeMetrics);

  const bRound = bestIdx(metrics.map(m => m.roundLen), true);
  const bComb  = bestIdx(metrics.map(m => m.combPct),  false);
  const bTemp  = bestIdx(metrics.map(m => m.tempPct),  false);
  const bSolar = bestIdx(metrics.map(m => m.solPct),   false);
  const bLAR   = bestIdx(metrics.map(m => m.larVal),   false);

  const ROWS = [
    { label: 'Round length', unit: 'days', bestIdx: bRound, getValue: m => m.roundLen, fmt: fmtRound },
    { label: 'Overall %',    unit: '',     bestIdx: bComb,  getValue: m => m.combPct,  fmt: fmtPct   },
    { label: 'Temperature',  unit: '',     bestIdx: bTemp,  getValue: m => m.tempPct,  fmt: fmtPct   },
    { label: 'Solar',        unit: '',     bestIdx: bSolar, getValue: m => m.solPct,   fmt: fmtPct   },
    { label: 'LAR',          unit: 'l/d',  bestIdx: bLAR,   getValue: m => m.larVal,   fmt: fmtLAR   },
  ];

  return (
    <div>
      {/* One-time tip */}
      {showInfo && (
        <div style={{ ...styles.tip, margin: '14px 16px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <span style={{ flex: 1, marginRight: 8 }}>Tap any column to see its full chart and history.</span>
          <button
            onClick={dismissInfo}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: C.muted, padding: 0, lineHeight: 1 }}
          >✕</button>
        </div>
      )}

      {/* One-time swipe banner for 4+ scenarios */}
      {showSwipe && (
        <div style={{ margin: '8px 16px 0', padding: '8px 12px', background: C.green4, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: C.green1 }}>
          <span>← Swipe to see all scenarios →</span>
          <button
            onClick={dismissSwipe}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: C.muted, padding: 0 }}
          >✕</button>
        </div>
      )}

      {/* Scrollable table */}
      <div style={{ overflowX: 'auto', margin: '12px 16px 0', borderRadius: 12, border: `1px solid ${C.border}`, background: C.card }}>
        <div style={{ minWidth: LABEL_W + scenarios.length * COL_W }}>

          {/* Header row */}
          <div style={{ display: 'flex', borderBottom: `2px solid ${C.border}` }}>
            <div style={{ width: LABEL_W, flexShrink: 0 }} />
            {scenarios.map((s, i) => (
              <div
                key={s.id}
                style={{ width: COL_W, flexShrink: 0, textAlign: 'center', padding: '12px 6px 10px', cursor: 'pointer', borderLeft: `1px solid ${C.border}` }}
                onClick={() => onSelectScenario(s)}
              >
                <div style={{
                  fontSize: 22,
                  fontWeight: 700,
                  fontFamily: "'Lora', Georgia, serif",
                  color: C.green1,
                  lineHeight: 1,
                }}>
                  {s.short_code || `S${i + 1}`}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 4, lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {s.name.length > 14 ? s.name.slice(0, 13) + '…' : s.name}
                </div>
              </div>
            ))}
          </div>

          {/* Data rows */}
          {ROWS.map((row, ri) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                borderBottom: ri < ROWS.length - 1 ? `1px solid ${C.border}` : 'none',
              }}
            >
              {/* Row label */}
              <div style={{
                width: LABEL_W,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                padding: '10px 10px',
                fontSize: 12,
                fontWeight: 500,
                color: C.muted,
                lineHeight: 1.3,
              }}>
                {row.label}
              </div>

              {/* Cells */}
              {metrics.map((m, ci) => {
                const val    = row.getValue(m);
                const isBest = ci === row.bestIdx && val != null;
                return (
                  <div
                    key={ci}
                    style={{
                      width: COL_W,
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '10px 4px',
                      cursor: 'pointer',
                      borderLeft: `1px solid ${C.border}`,
                      background: isBest ? '#e6f4d8' : 'transparent',
                    }}
                    onClick={() => onSelectScenario(scenarios[ci])}
                  >
                    <span style={{
                      fontSize: 20,
                      fontWeight: 700,
                      fontFamily: "'Lora', Georgia, serif",
                      color: isBest ? C.green2 : C.text,
                      lineHeight: 1,
                    }}>
                      {row.fmt(val)}
                    </span>
                    {row.unit && (
                      <span style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{row.unit}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
