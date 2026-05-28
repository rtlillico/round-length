// round-length/frontend/src/components/SeasonUI.jsx
// Shared UI components for season overview and factor screens.
import { useState } from 'react';
import { C } from '../App';
import { api } from '../lib/api';
import { PASTURE_PARAMS, SOIL_PARAMS } from '../lib/formula';

function ScenarioInfoSheet({ scenario, onClose, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name:         scenario.name         || '',
    pastureKey:   scenario.pasture_key  || 'perennialRyegrass',
    targetLeaves: scenario.target_leaves || 3,
    soilType:     scenario.soil_type    || 'sandyLoam',
    description:  scenario.description  || '',
  });
  const [saving, setSaving]   = useState(false);
  const [saveErr, setSaveErr] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);

  const heavy = form.pastureKey !== scenario.pasture_key ||
                Number(form.targetLeaves) !== Number(scenario.target_leaves) ||
                form.soilType !== scenario.soil_type;

  async function save() {
    setSaving(true); setSaveErr(null);
    try {
      const updated = await api.scenarios.update(scenario.id, {
        name:         form.name,
        pastureKey:   form.pastureKey,
        targetLeaves: Number(form.targetLeaves),
        soilType:     form.soilType,
        description:  form.description,
      });
      onSaved(updated);
      setEditing(false);
      if (heavy) setNeedsReload(true);
    } catch (e) {
      setSaveErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  const row = (label, value) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #f0f0e8' }}>
      <span style={{ fontSize: 12, color: '#8a9a78', minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1e3a12', fontWeight: 500, textAlign: 'right', flex: 1 }}>{value}</span>
    </div>
  );

  const inp = (style) => ({
    width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 10px',
    border: '1.5px solid #c8dab0', borderRadius: 8, color: '#1e3a12',
    background: '#f8fdf4', outline: 'none', ...style,
  });

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200 }} />
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderRadius: '16px 16px 0 0', zIndex: 201, maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
        {/* drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d0d8c8' }} />
        </div>

        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: '#1e3a12', fontFamily: "'Lora', Georgia, serif" }}>{scenario.short_code}</span>
            <span style={{ fontSize: 12, color: '#8a9a78' }}>Scenario details</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: 18, color: '#8a9a78', cursor: 'pointer', lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {/* body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '0 16px 24px' }}>
          {needsReload && (
            <div style={{ background: '#f0f8e8', border: '1px solid #a8c48a', borderRadius: 8, padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#3a6b1a' }}>Saved. Reload to recompute charts.</span>
              <button onClick={() => window.location.reload()} style={{ background: '#3a6b1a', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0 }}>Reload</button>
            </div>
          )}

          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 4 }}>
              <div>
                <label style={{ fontSize: 11, color: '#8a9a78', display: 'block', marginBottom: 4 }}>Name</label>
                <input style={inp()} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8a9a78', display: 'block', marginBottom: 4 }}>Grass type</label>
                <select style={inp()} value={form.pastureKey} onChange={e => setForm(f => ({ ...f, pastureKey: e.target.value }))}>
                  {Object.entries(PASTURE_PARAMS).map(([k, v]) => (
                    <option key={k} value={k}>{v.name} ({v.region})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8a9a78', display: 'block', marginBottom: 4 }}>Target leaf stage</label>
                <select style={inp()} value={form.targetLeaves} onChange={e => setForm(f => ({ ...f, targetLeaves: e.target.value }))}>
                  {[1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => <option key={v} value={v}>{v} leaf</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8a9a78', display: 'block', marginBottom: 4 }}>Soil type</label>
                <select style={inp()} value={form.soilType} onChange={e => setForm(f => ({ ...f, soilType: e.target.value }))}>
                  {Object.entries(SOIL_PARAMS).map(([k, v]) => (
                    <option key={k} value={k}>{v.name} ({v.SWmax}mm capacity)</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: '#8a9a78', display: 'block', marginBottom: 4 }}>Description (optional)</label>
                <textarea style={inp({ resize: 'none', height: 72 })} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. North paddock, irrigated" />
              </div>
              {heavy && (
                <div style={{ fontSize: 11, color: '#c47a12', background: '#fdf6e8', border: '1px solid #e8c87a', borderRadius: 8, padding: '8px 10px' }}>
                  ⚠ Changing grass type, leaf stage or soil type requires recomputing historical charts — you'll be prompted to reload after saving.
                </div>
              )}
              {saveErr && <div style={{ fontSize: 12, color: '#c43a2a' }}>{saveErr}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setEditing(false); setSaveErr(null); }} style={{ flex: 1, padding: '11px', border: '1.5px solid #c8dab0', borderRadius: 10, background: '#fff', color: '#3a6b1a', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={save} disabled={saving} style={{ flex: 2, padding: '11px', border: 'none', borderRadius: 10, background: '#3a6b1a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          ) : (
            <>
              {row('Name', form.name || '—')}
              {row('Grass type', PASTURE_PARAMS[form.pastureKey]?.name || form.pastureKey)}
              {row('Target leaf stage', `${form.targetLeaves} leaf`)}
              {row('Soil type', SOIL_PARAMS[form.soilType]?.name || form.soilType)}
              {row('Description', form.description || '—')}
              <button onClick={() => setEditing(true)} style={{ marginTop: 20, width: '100%', padding: '12px', border: 'none', borderRadius: 10, background: '#3a6b1a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Edit details
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

export function ScenarioBanner({ scenario, pasture, title, onBack }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [current, setCurrent] = useState(scenario);
  const currentPasture = PASTURE_PARAMS[current.pasture_key] || pasture;

  return (
    <>
      <div style={{ background: '#1e3a12', padding: '14px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onBack && (
            <button onClick={onBack}
              style={{ background: 'transparent', border: 'none', color: '#a8c48a', fontSize: 20, cursor: 'pointer', padding: '0 6px 0 0', lineHeight: 1 }}>
              ←
            </button>
          )}
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => setSheetOpen(true)}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#e8f5d0', lineHeight: 1, fontFamily: "'Lora', Georgia, serif" }}>
                {current.short_code || 'S1'}
              </span>
              <span style={{ fontSize: 12, color: '#a8c48a' }}>
                {currentPasture?.name || current.pasture_key} · {current.target_leaves} leaf
              </span>
              <span style={{ fontSize: 11, color: '#a8c48a', opacity: 0.6 }}>ⓘ</span>
            </div>
          </div>
          <button onClick={() => window.location.reload()}
            style={{ background: 'transparent', border: 'none', color: '#a8c48a', fontSize: 18, cursor: 'pointer', padding: '4px 6px', lineHeight: 1, flexShrink: 0 }}
            title="Refresh">
            ↻
          </button>
        </div>
        <div style={{ height: 1.5, background: 'rgba(255,255,255,0.25)', margin: '9px 0 7px' }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: '#f0ead8', letterSpacing: 0.2 }}>{title}</div>
      </div>

      {sheetOpen && (
        <ScenarioInfoSheet
          scenario={current}
          onClose={() => setSheetOpen(false)}
          onSaved={(updated) => { setCurrent(updated); setSheetOpen(false); }}
        />
      )}
    </>
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
// Snap a target date string to the nearest date in the series (within maxDays).
function snapToNearest(target, dates, maxDays = 7) {
  const dateSet = new Set(dates);
  if (dateSet.has(target)) return target;
  for (let dd = 1; dd <= maxDays; dd++) {
    const t = new Date(target + 'T00:00:00Z');
    const p = new Date(t); p.setUTCDate(p.getUTCDate() + dd);
    const m = new Date(t); m.setUTCDate(m.getUTCDate() - dd);
    if (dateSet.has(p.toISOString().slice(0, 10))) return p.toISOString().slice(0, 10);
    if (dateSet.has(m.toISOString().slice(0, 10))) return m.toISOString().slice(0, 10);
  }
  return null;
}

export function buildMonthTicks(series, todayStr, stepMonths = 1) {
  if (!series.length) return [];
  const dates = series.map(r => r.date);
  const ticks = new Set();
  const end = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  let d = new Date(dates[0] + 'T00:00:00Z');
  d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const snappedToday = snapToNearest(todayStr, dates) ?? todayStr;
  const todayMs = new Date(snappedToday + 'T00:00:00Z').getTime();
  while (d <= end) {
    const snapped = snapToNearest(d.toISOString().slice(0, 10), dates);
    if (snapped) {
      const diffDays = Math.abs(new Date(snapped + 'T00:00:00Z').getTime() - todayMs) / 86400000;
      if (diffDays > 20) ticks.add(snapped); // skip month ticks too close to TODAY
    }
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + stepMonths, 1));
  }
  ticks.add(snappedToday);
  return [...ticks].sort();
}

// Returns the nearest data point date to today — use for ReferenceLine x and tick renderer.
export function nearestToToday(series, todayStr) {
  if (!series.length) return todayStr;
  return snapToNearest(todayStr, series.map(r => r.date)) ?? todayStr;
}

// Weekly tick builder — snaps each 7-day step from today to the nearest series date.
// Excludes any weekly tick within 4 days of snappedToday to avoid crowding TODAY label.
export function buildWeeklyTicks(series, todayStr) {
  if (!series.length) return [];
  const dates        = series.map(r => r.date);
  const dateSet      = new Set(dates);
  const first        = new Date(dates[0] + 'T00:00:00Z');
  const last         = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  const today        = new Date(todayStr + 'T00:00:00Z');
  const snappedToday = snapToNearest(todayStr, dates) ?? todayStr;
  const todayMs      = new Date(snappedToday + 'T00:00:00Z').getTime();
  const ticks        = new Set([snappedToday]);

  for (const dir of [-1, 1]) {
    let d = new Date(today);
    d.setUTCDate(d.getUTCDate() + dir * 7);
    while (d >= first && d <= last) {
      for (let dd = 0; dd <= 4; dd++) {
        const p = new Date(d); p.setUTCDate(p.getUTCDate() + dd);
        const m = new Date(d); m.setUTCDate(m.getUTCDate() - dd);
        const ps = p.toISOString().slice(0, 10);
        const ms = m.toISOString().slice(0, 10);
        if (dateSet.has(ps)) {
          if (Math.abs(new Date(ps + 'T00:00:00Z') - todayMs) / 86400000 > 4) ticks.add(ps);
          break;
        }
        if (dd > 0 && dateSet.has(ms)) {
          if (Math.abs(new Date(ms + 'T00:00:00Z') - todayMs) / 86400000 > 4) ticks.add(ms);
          break;
        }
      }
      d.setUTCDate(d.getUTCDate() + dir * 7);
    }
  }
  return [...ticks].sort();
}

// Tick renderer showing "26 Apr" — used for 1W and 1M views.
// Pass nearestToday so TODAY is correctly detected even on binned data.
export function dayMonthTick(todayStr, nearestToday) {
  const todayMark = nearestToday ?? todayStr;
  return ({ x, y, payload }) => {
    const isToday = payload.value === todayMark;
    const d = new Date(payload.value + 'T00:00:00Z');
    if (isToday) return (
      <text textAnchor="middle" fontSize={9} fontWeight="bold" fill="#2d5a1b">
        <tspan x={x} y={y + 10}>TODAY</tspan>
      </text>
    );
    const mon = d.toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });
    return (
      <text textAnchor="middle" fontSize={8} fill="#9aab85">
        <tspan x={x} y={y + 10}>{d.getUTCDate()} {mon}</tspan>
      </text>
    );
  };
}

// Custom XAxis tick renderer
export function xAxisTick(todayStr, nearestToday) {
  const todayMark = nearestToday ?? todayStr;
  return ({ x, y, payload }) => {
    const isToday = payload.value === todayMark;
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
        {isJan && <tspan x={x} y={y + 20} fontSize={9}>{d.getUTCFullYear()}</tspan>}
      </text>
    );
  };
}

export const yAxisProps = {
  tick: { fontSize: 8, fill: '#9aab85' },
  tickLine: false,
  axisLine: false,
};
