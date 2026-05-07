// round-length/frontend/src/pages/FormulaBreakdown.jsx
import { useState } from 'react';
import { C, styles } from '../App';
import {
  PASTURE_PARAMS, SOIL_PARAMS, MAX_SOLAR_BY_MONTH, calcWaterloggingFactor,
} from '../lib/formula';

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, open, onToggle, children }) {
  return (
    <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '14px 18px', textAlign: 'left',
        }}
      >
        <span style={{ ...styles.h3, margin: 0, fontFamily: "'Lora', Georgia, serif" }}>{title}</span>
        <span style={{ fontSize: 14, color: C.muted }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div style={{ padding: '0 18px 18px' }}>{children}</div>}
    </div>
  );
}

function FormulaBox({ lines }) {
  return (
    <div style={{
      background: '#f5f0e8', border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '10px 14px', fontFamily: "'Courier New', Courier, monospace",
      fontSize: 12, color: C.green1, marginBottom: 14, lineHeight: 2,
      overflowX: 'auto', whiteSpace: 'pre',
    }}>
      {lines.join('\n')}
    </div>
  );
}

function Row({ label, value, highlight, subValue }) {
  return (
    <div style={{
      padding: '8px 0',
      borderBottom: `1px solid ${C.border}`,
      background: highlight ? '#eef7e8' : 'transparent',
      paddingLeft: highlight ? 8 : 0,
      borderRadius: highlight ? 4 : 0,
      marginLeft: highlight ? -8 : 0,
      marginRight: highlight ? -8 : 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
        <span style={{ fontSize: 13, color: C.muted }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 'bold', color: highlight ? C.green2 : C.green1, textAlign: 'right' }}>
          {value}
        </span>
      </div>
      {subValue && (
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{subValue}</div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FormulaBreakdown({ scenario, onBack }) {
  const [open, setOpen] = useState({ temp: true, solar: true, moisture: true, nitrogen: false });

  const state       = scenario.todayState;
  const pasture     = PASTURE_PARAMS[scenario.pasture_key];
  const soilType    = scenario.soil_type || 'sandyLoam';
  const soilParams  = SOIL_PARAMS[soilType] || SOIL_PARAMS.sandyLoam;
  const target      = Number(scenario.target_leaves);

  const today       = new Date();
  const monthIdx    = today.getMonth();
  const monthName   = today.toLocaleDateString('en-AU', { month: 'long' });
  const maxSolar    = MAX_SOLAR_BY_MONTH[monthIdx];

  // Pull today's values from state
  const tMean          = state?.t_mean        != null ? Number(state.t_mean)          : null;
  const tempLAR        = state?.temp_lar      != null ? Number(state.temp_lar)         : null;
  const solarFactor    = state?.solar_factor  != null ? Number(state.solar_factor)     : null;
  const moistureFactor = state?.moisture_factor != null ? Number(state.moisture_factor) : null;
  const soilWater      = state?.soil_water    != null ? Number(state.soil_water)       : null;
  const radiation      = state?.radiation     != null ? Number(state.radiation)        : null;
  const actualLAR      = state?.actual_lar    != null ? Number(state.actual_lar)       : null;
  const trueRound      = state?.true_round    != null ? Number(state.true_round)       : null;

  // ── Temperature ─────────────────────────────────────────────────────────────
  let tempZone = '—';
  let tempFormula = '—';
  if (tMean != null && pasture) {
    if (tMean < pasture.baseTemp) {
      tempZone    = `below base temp (${pasture.baseTemp}°C) — LAR = 0`;
      tempFormula = '0';
    } else if (tMean < pasture.optimumTemp) {
      tempZone    = `rising zone (${pasture.baseTemp}°C – ${pasture.optimumTemp}°C)`;
      tempFormula = `(${tMean.toFixed(1)} − ${pasture.baseTemp}) / ${pasture.phyllochron} = ${(tempLAR ?? 0).toFixed(4)}`;
    } else if (tMean < pasture.ceilingTemp) {
      const maxL = ((pasture.optimumTemp - pasture.baseTemp) / pasture.phyllochron).toFixed(4);
      tempZone    = `falling zone (${pasture.optimumTemp}°C – ${pasture.ceilingTemp}°C)`;
      tempFormula = `${maxL} × (${pasture.ceilingTemp} − ${tMean.toFixed(1)}) / (${pasture.ceilingTemp} − ${pasture.optimumTemp}) = ${(tempLAR ?? 0).toFixed(4)}`;
    } else {
      tempZone    = `above ceiling (${pasture.ceilingTemp}°C) — LAR = 0`;
      tempFormula = '0';
    }
  }
  const roundAtTemp = tempLAR && tempLAR > 0 ? target / tempLAR : null;

  // ── Solar ────────────────────────────────────────────────────────────────────
  const larAfterSolar   = tempLAR != null && solarFactor != null ? tempLAR * solarFactor : null;
  const roundAfterSolar = larAfterSolar && larAfterSolar > 0 ? target / larAfterSolar : null;

  // ── Moisture ─────────────────────────────────────────────────────────────────
  const swThreshold        = soilParams.SWmax * 0.5;
  const wlFactor           = soilWater != null ? calcWaterloggingFactor(soilWater, soilParams.SWmax, soilType) : 1.0;
  const droughtFactor      = soilWater != null ? Math.min(1, soilWater / swThreshold) : null;
  const larAfterMoisture   = larAfterSolar != null && moistureFactor != null ? larAfterSolar * moistureFactor : null;
  const roundAfterMoisture = larAfterMoisture && larAfterMoisture > 0 ? target / larAfterMoisture : null;

  let wlStatus = '—';
  if (soilWater != null) {
    if (wlFactor < 0.6)  wlStatus = `${soilWater.toFixed(1)} mm — severely waterlogged`;
    else if (wlFactor < 1) wlStatus = `${soilWater.toFixed(1)} mm — moderately waterlogged`;
    else                 wlStatus = `${soilWater.toFixed(1)} mm — not waterlogged`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const f  = (v, d = 4) => v != null ? Number(v).toFixed(d) : '—';
  const fd = v => v == null ? '—' : v >= 365 ? '365+ days' : `${Math.round(v)} days`;
  const toggle = key => setOpen(p => ({ ...p, [key]: !p[key] }));

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer', padding: 0 }}
          >
            ←
          </button>
          <div>
            <div style={styles.headerTitle}>LAR Formula</div>
            <div style={styles.headerSub}>{scenario.name} — today's values</div>
          </div>
        </div>
      </div>

      {/* Master formula */}
      <div style={styles.card}>
        <p style={{ ...styles.h3, marginTop: 0 }}>Master formula</p>
        <FormulaBox lines={[
          'Actual LAR = Temp LAR × Solar factor × Moisture factor',
          'Round length = Target leaves ÷ Actual LAR',
        ]} />
        {actualLAR != null && (
          <FormulaBox lines={[
            `= ${f(tempLAR)} × ${f(solarFactor)} × ${f(moistureFactor)}`,
            `= ${f(actualLAR)} leaves/day`,
            `Round (true) = ${fd(trueRound)}`,
          ]} />
        )}
      </div>

      {/* 1. Temperature */}
      <Section title="1. Temperature" open={open.temp} onToggle={() => toggle('temp')}>
        <FormulaBox lines={[
          `Below base (<${pasture?.baseTemp ?? 5}°C):      LAR = 0`,
          `Rising (base → optimum):  LAR = (T_mean − base) / phyllochron`,
          `Falling (optimum → ceiling): LAR = maxLAR × (ceiling − T_mean)`,
          `                                  / (ceiling − optimum)`,
          `Above ceiling (>${pasture?.ceilingTemp ?? 35}°C): LAR = 0`,
        ]} />
        <Row label="T_mean" value={tMean != null ? `${tMean.toFixed(1)}°C` : '—'} />
        <Row
          label={`Base temp (${pasture?.name ?? scenario.pasture_key})`}
          value={pasture ? `${pasture.baseTemp}°C` : '—'}
        />
        <Row
          label={`Optimum temp (${pasture?.name ?? scenario.pasture_key})`}
          value={pasture ? `${pasture.optimumTemp}°C` : '—'}
        />
        <Row
          label={`Ceiling temp (${pasture?.name ?? scenario.pasture_key})`}
          value={pasture ? `${pasture.ceilingTemp}°C` : '—'}
        />
        <Row
          label={`Phyllochron (${pasture?.name ?? scenario.pasture_key})`}
          value={pasture ? `${pasture.phyllochron} degree-days/leaf` : '—'}
        />
        <Row label="Active zone" value={tempZone} highlight />
        <Row
          label="Temp LAR"
          value={tempLAR != null ? `${f(tempLAR)} leaves/day` : '—'}
          subValue={tempFormula !== '—' ? tempFormula : undefined}
          highlight
        />
        <Row
          label="Round at temperature only"
          value={roundAtTemp != null ? `${target} / ${f(tempLAR)} = ${fd(roundAtTemp)}` : '—'}
        />
      </Section>

      {/* 2. Solar */}
      <Section title="2. Solar" open={open.solar} onToggle={() => toggle('solar')}>
        <FormulaBox lines={[
          'Solar factor = MIN(1, daily_solar / max_solar_for_month)',
        ]} />
        <Row label="Daily solar" value={radiation != null ? `${radiation.toFixed(1)} MJ/m²` : '—'} />
        <Row
          label={`Max solar for ${monthName} (Smithton, TAS)`}
          value={`${maxSolar} MJ/m²`}
        />
        <Row
          label="Solar factor"
          value={solarFactor != null ? f(solarFactor) : '—'}
          subValue={radiation != null ? `MIN(1, ${radiation.toFixed(1)} / ${maxSolar}) = ${f(solarFactor)}` : undefined}
          highlight
        />
        <Row
          label="LAR after solar"
          value={larAfterSolar != null ? `${f(larAfterSolar)} leaves/day` : '—'}
          subValue={larAfterSolar != null ? `${f(tempLAR)} × ${f(solarFactor)} = ${f(larAfterSolar)}` : undefined}
        />
        <Row
          label="Round after solar"
          value={roundAfterSolar != null ? `${target} / ${f(larAfterSolar)} = ${fd(roundAfterSolar)}` : '—'}
        />
      </Section>

      {/* 3. Soil moisture */}
      <Section title="3. Soil moisture" open={open.moisture} onToggle={() => toggle('moisture')}>
        <FormulaBox lines={[
          'Moisture factor = MIN(1, SW / (SWmax × 0.5)) × waterlogging_factor',
          'SW = MIN(SWmax, MAX(0, SW_prev + Rain − ET₀ − Drainage))',
        ]} />
        <Row label="Current soil water (SW)" value={soilWater != null ? `${soilWater.toFixed(1)} mm` : '—'} />
        <Row label={`Field capacity — ${soilParams.name}`} value={`${soilParams.SWmax} mm`} />
        <Row
          label={`Stress threshold — ${soilParams.name}`}
          value={`${swThreshold.toFixed(1)} mm`}
          subValue={`50% of ${soilParams.SWmax} mm field capacity`}
        />
        <Row
          label={`Drainage rate — ${soilParams.name}`}
          value={`${(soilParams.drainageRate * 100).toFixed(0)}% of excess per day`}
        />
        <Row label="Waterlogging status" value={wlStatus} />
        <Row label="Waterlogging factor" value={wlFactor.toFixed(2)} />
        <Row
          label="Drought factor"
          value={droughtFactor != null ? `MIN(1, ${soilWater?.toFixed(1)} / ${swThreshold.toFixed(1)}) = ${droughtFactor.toFixed(4)}` : '—'}
        />
        <Row
          label="Moisture factor"
          value={moistureFactor != null ? f(moistureFactor) : '—'}
          subValue={droughtFactor != null ? `${droughtFactor.toFixed(4)} × ${wlFactor.toFixed(2)} = ${f(moistureFactor)}` : undefined}
          highlight
        />
        <Row
          label="LAR after moisture"
          value={larAfterMoisture != null ? `${f(larAfterMoisture)} leaves/day` : '—'}
          subValue={larAfterMoisture != null ? `${f(larAfterSolar)} × ${f(moistureFactor)} = ${f(larAfterMoisture)}` : undefined}
        />
        <Row
          label="Round after moisture"
          value={roundAfterMoisture != null ? `${target} / ${f(larAfterMoisture)} = ${fd(roundAfterMoisture)}` : '—'}
        />
      </Section>

      {/* 4. Nitrogen (placeholder) */}
      <Section title="4. Nitrogen" open={open.nitrogen} onToggle={() => toggle('nitrogen')}>
        <FormulaBox lines={[
          'Nitrogen factor = slider_value / 100',
          'Actual LAR = ... × Nitrogen factor',
        ]} />
        <div style={{ ...styles.tip, marginTop: 0 }}>
          Nitrogen factor is not yet implemented. A slider will let you adjust nitrogen
          availability (0–100%) and see its effect on round length.
        </div>
      </Section>

      {/* Summary */}
      <div style={styles.card}>
        <p style={{ ...styles.h3, marginTop: 0 }}>Summary</p>
        <FormulaBox lines={[
          `Actual LAR`,
          `  = ${f(tempLAR)}  (temperature)`,
          `  × ${f(solarFactor)}  (solar)`,
          `  × ${f(moistureFactor)}  (moisture)`,
          `  = ${f(actualLAR)} leaves/day`,
        ]} />
        <Row label="Target leaves" value={`${target} leaves`} />
        <Row
          label="Instant round (÷ LAR)"
          value={larAfterMoisture && larAfterMoisture > 0 ? fd(target / larAfterMoisture) : '—'}
          subValue="Simple division — actual round uses cumulative backward sum"
        />
        <Row label="True round length (today)" value={fd(trueRound)} highlight />
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}
