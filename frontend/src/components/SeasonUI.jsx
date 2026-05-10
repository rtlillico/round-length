// round-length/frontend/src/components/SeasonUI.jsx
// Shared UI components for season overview and factor screens.
import { C } from '../App';

export function ScenarioBanner({ scenario, pasture, title, onBack }) {
  return (
    <div style={{ background: '#1e3a12', padding: '14px 16px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {onBack && (
          <button onClick={onBack}
            style={{ background: 'transparent', border: 'none', color: '#a8c48a', fontSize: 20, cursor: 'pointer', padding: '0 6px 0 0', lineHeight: 1 }}>
            ←
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 28, fontWeight: 700, color: '#e8f5d0', lineHeight: 1, fontFamily: "'Lora', Georgia, serif" }}>
              {scenario.short_code || 'S1'}
            </span>
            <span style={{ fontSize: 12, color: '#a8c48a' }}>
              {pasture?.name || scenario.pasture_key} · {scenario.target_leaves} leaf
            </span>
          </div>
          <div style={{ height: 1.5, background: 'rgba(255,255,255,0.25)', margin: '9px 0 7px' }} />
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f0ead8', letterSpacing: 0.2 }}>{title}</div>
        </div>
      </div>
    </div>
  );
}

export function NavLinks({ onNavigate, current }) {
  const all = [
    { id: 'temp',     label: '🌡️ Temperature' },
    { id: 'moisture', label: '💧 Moisture' },
    { id: 'solar',    label: '☀️ Solar' },
    { id: 'nitrogen', label: '🌱 Nitrogen' },
  ];
  return (
    <div style={{ padding: '16px 0 100px', borderTop: `1px solid ${C.border}`, marginTop: 16 }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1.2px', color: C.muted, marginBottom: 8 }}>
        Navigate to
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        <div onClick={() => onNavigate('overview')} style={{
          background: '#2d4a1e', color: '#f0ead8', border: '1px solid #2d4a1e',
          borderRadius: 20, padding: '7px 13px', fontSize: 12, cursor: 'pointer',
        }}>
          ← Season overview
        </div>
        {all.filter(l => l.id !== current).map(l => (
          <div key={l.id} onClick={() => onNavigate(l.id)} style={{
            background: '#fff', border: '1px solid rgba(0,0,0,0.1)',
            borderRadius: 20, padding: '7px 13px', fontSize: 12, color: '#2d4a1e', cursor: 'pointer',
          }}>
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function FormulaBtn({ open, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#fff',
      cursor: 'pointer', marginBottom: 8, fontWeight: 500, background: '#3a6b1a',
      border: 'none', borderRadius: 16, padding: '6px 12px',
    }}>
      {open ? '▼ Hide formula' : '▶ Show formula'}
    </button>
  );
}

export function FormulaBox({ lines, vars }) {
  return (
    <div style={{
      background: '#f0f8e8', borderRadius: 8, padding: 10, marginBottom: 10,
      border: '1px solid rgba(90,140,42,0.2)',
    }}>
      <pre style={{ fontSize: 10, color: '#3a5a1a', lineHeight: 1.7, whiteSpace: 'pre-wrap', fontFamily: 'monospace', margin: 0 }}>
        {lines}
      </pre>
      {vars && (
        <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(90,140,42,0.15)' }}>
          {vars.map(({ label, value }) => (
            <div key={label} style={{ fontSize: 11, color: '#4a6a2a', marginBottom: 3 }}>
              {label} = <strong style={{ color: '#2d4a1e' }}>{value}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToggleBar({ items, show, onToggle }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10, paddingTop: 9, borderTop: '1px solid #f0ead8' }}>
      {items.map(({ key, label, color }) => (
        <button key={key} onClick={() => onToggle(key)} style={{
          padding: '4px 9px', borderRadius: 14, fontSize: 10, fontWeight: 500,
          cursor: 'pointer', border: `1.5px solid ${color}`,
          background: show[key] ? color : '#fff',
          color: show[key] ? '#fff' : color,
          opacity: show[key] ? 1 : 0.45,
          whiteSpace: 'nowrap',
        }}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function PctBtn({ open, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      fontSize: 11, color: open ? '#fff' : '#3a6b1a', cursor: 'pointer', marginTop: 10,
      fontWeight: 500, background: open ? '#3a6b1a' : '#f0f8e8',
      border: '1.5px solid #3a6b1a', borderRadius: 16, padding: '8px 14px', width: '100%',
    }}>
      {open ? '▼ Hide percentiles chart' : '▶ Show percentiles chart to compare historical data'}
    </button>
  );
}

export function TodayLabel() {
  return (
    <div style={{ fontSize: 9, color: '#3a6b1a', textAlign: 'center', marginTop: 2, fontWeight: 600, letterSpacing: 0.5 }}>
      ← PAST · TODAY · FUTURE →
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
      {items.map(({ label, color, dashed }) => (
        <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#6b7c5a' }}>
          {dashed
            ? <span style={{ width: 14, height: 0, borderTop: `2px dashed ${color}`, display: 'inline-block', flexShrink: 0 }} />
            : <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />}
          {label}
        </span>
      ))}
    </div>
  );
}

// Build month-start ticks for XAxis, always including todayStr
export function buildMonthTicks(series, todayStr) {
  if (!series.length) return [];
  const dateSet = new Set(series.map(r => r.date));
  const ticks = [];
  const end = new Date(series[series.length - 1].date + 'T00:00:00Z');
  let d = new Date(series[0].date + 'T00:00:00Z');
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  while (d <= end) {
    const s = d.toISOString().slice(0, 10);
    if (dateSet.has(s)) ticks.push(s);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return [...new Set([...ticks, todayStr])].sort();
}

// Custom XAxis tick renderer
export function xAxisTick(todayStr) {
  return ({ x, y, payload }) => {
    const isToday = payload.value === todayStr;
    const d = new Date(payload.value + 'T00:00:00Z');
    if (isToday) return (
      <text textAnchor="middle" fontSize={9} fontWeight="bold" fill="#2d5a1b">
        <tspan x={x} y={y + 10}>TODAY</tspan>
      </text>
    );
    const mon = d.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });
    const isJan = d.getUTCMonth() === 0;
    return (
      <text textAnchor="middle" fontSize={8} fill="#9aab85">
        <tspan x={x} y={y + 10}>{mon}</tspan>
        {isJan && <tspan x={x} y={y + 18} fontSize={7}>{d.getUTCFullYear()}</tspan>}
      </text>
    );
  };
}

export const yAxisProps = {
  tick: { fontSize: 8, fill: '#9aab85' },
  tickLine: false,
  axisLine: false,
};
