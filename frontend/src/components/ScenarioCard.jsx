// round-length/frontend/src/components/ScenarioCard.jsx
import { C, styles } from '../App';
import { PASTURE_PARAMS } from '../lib/formula';

function ProgressBar({ pct, color }) {
  const clamp = Math.max(0, Math.min(100, pct || 0));
  const col = color || (clamp >= 70 ? C.green2 : clamp >= 40 ? C.amber : C.red);
  return (
    <div style={{ background: C.green4, borderRadius: 20, height: 10, overflow: 'hidden' }}>
      <div style={{ width: `${clamp}%`, height: '100%', background: col, borderRadius: 20, transition: 'width 0.5s ease' }} />
    </div>
  );
}

export default function ScenarioCard({ scenario, onTap }) {
  const state     = scenario.todayState;
  const rl        = state?.true_round ?? null;
  const rlDisplay = rl === null ? '—' : rl >= 365 ? '365+' : Math.round(rl);
  const rlColor   = rl === null ? C.muted : rl <= 20 ? C.green2 : rl <= 50 ? C.amber : C.red;
  const pasture   = PASTURE_PARAMS[scenario.pasture_key];

  // LAR as % of maximum possible
  const maxLAR    = pasture ? (pasture.optimumTemp - pasture.baseTemp) / pasture.phyllochron : 0.17;
  const larPct    = state?.temp_lar ? Math.min(100, (state.temp_lar / maxLAR) * 100) : 0;

  return (
    <div
      style={{ ...styles.card, cursor: 'pointer', padding: '14px 16px' }}
      onClick={onTap}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ flex: 1, marginRight: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: C.green1 }}>{scenario.name}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            {pasture?.name || scenario.pasture_key} · 🎯 {scenario.target_leaves} leaf
          </div>
          {state && (
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {state.t_mean !== null ? `${Number(state.t_mean).toFixed(1)}°C` : ''}{' '}
              · LAR {state.temp_lar !== null ? Number(state.temp_lar).toFixed(4) : '—'} leaves/day
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 48, fontWeight: 'bold', color: rlColor, lineHeight: 1, letterSpacing: -2 }}>
            {rlDisplay}
          </div>
          <div style={{ fontSize: 11, color: C.muted }}>days</div>
        </div>
      </div>

      {/* Growth rate bar */}
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12, color: C.muted }}>
          <span>🌡️ Temperature growth rate</span>
          <span>{Math.round(larPct)}% of maximum</span>
        </div>
        <ProgressBar pct={larPct} />
      </div>

      {!state && (
        <div style={{ fontSize: 12, color: C.amber, marginTop: 6 }}>
          ⏳ Computing historical data — check back soon
        </div>
      )}

      <div style={{ textAlign: 'right', marginTop: 8 }}>
        <span style={{ fontSize: 12, color: C.green2, fontWeight: 'bold' }}>
          Tap for detail and chart →
        </span>
      </div>
    </div>
  );
}
