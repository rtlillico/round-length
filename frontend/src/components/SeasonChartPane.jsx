// round-length/frontend/src/components/SeasonChartPane.jsx
// Chart.js-based chart pane: pan, scrub, range buttons, today marker, toggle pills, readout.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Chart, BarController, LineController, LinearScale, CategoryScale, BarElement, LineElement, PointElement, Filler, Tooltip } from 'chart.js';
import { C } from '../App';

Chart.register(BarController, LineController, LinearScale, CategoryScale, BarElement, LineElement, PointElement, Filler, Tooltip);

export const CHART_N = 910;
export const CHART_TODAY = 545;

const RANGE_WIDTHS = { '1W': 14, '1M': 60, 'Full': null };
const MO = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function getBinDays(range) {
  if (range === '1W') return 1;
  if (range === '1M') return 4;
  return 7;
}

export function makeBins(arr, binDays) {
  const past = new Array(CHART_N).fill(null);
  const future = new Array(CHART_N).fill(null);
  for (let start = 0; start < CHART_N; start += binDays) {
    let sum = 0, count = 0;
    for (let j = start; j < Math.min(CHART_N, start + binDays); j++) {
      if (arr[j] != null) { sum += arr[j]; count++; }
    }
    if (!count) continue;
    const center = Math.min(CHART_N - 1, start + Math.floor(binDays / 2));
    const val = +(sum / count).toFixed(5);
    if (center <= CHART_TODAY) past[center] = val;
    else future[center] = val;
  }
  return { past, future };
}

export function buildTickLabels(dates) {
  return dates.map(dateStr => {
    const d = new Date(dateStr + 'T00:00:00Z');
    if (d.getUTCDate() === 1) {
      const mon = MO[d.getUTCMonth()];
      return d.getUTCMonth() === 0 ? `${mon} '${String(d.getUTCFullYear()).slice(-2)}` : mon;
    }
    if (d.getUTCDay() === 0) return String(d.getUTCDate());
    return '';
  });
}

function fmtDay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00Z');
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
}

// ── SeasonChartPane ────────────────────────────────────────────────────────────

export default function SeasonChartPane({
  dates,          // string[] length CHART_N
  buildDatasets,  // (range, visible, containerW) => Chart.js datasets[]
  buildScales,    // (range) => Chart.js scales config
  buildReadout,   // (dayIdx, visible) => { lines: [{label, value, color}] }
  togglePills,    // { key: { label, color, dashed, defaultOn } }[]
  chartHeight = 200,
  label,
  sublabel,
}) {
  const [range, setRange] = useState('1M');
  const [visible, setVisible] = useState(() => {
    const v = {};
    for (const [k, cfg] of Object.entries(togglePills)) v[k] = cfg.defaultOn !== false;
    return v;
  });
  const [readout, setReadout] = useState(null);

  const canvasRef  = useRef(null);
  const chartRef   = useRef(null);
  const scrubRef   = useRef(null);   // the scrubber line div
  const handleRef  = useRef(null);   // the drag handle circle
  const todayRef   = useRef(null);   // today marker div
  const pillRef    = useRef(null);   // today pill
  const containerRef = useRef(null);
  const scrubDayRef  = useRef(CHART_TODAY);
  const centerRef    = useRef(CHART_TODAY);
  const panRef = useRef(null); // { startX, startCenter, mode, originX, originY }

  const rangeW = RANGE_WIDTHS[range] ?? CHART_N;

  // ── clamp helpers ─────────────────────────────────────────────────────────
  function clampCenter(c, rw) {
    const half = Math.floor((rw ?? CHART_N) / 2);
    return Math.max(half, Math.min(CHART_N - 1 - half, c));
  }

  // ── pixel helpers ─────────────────────────────────────────────────────────
  function dayToPixel(dayIdx) {
    const chart = chartRef.current;
    if (!chart) return null;
    const scale = chart.scales.x;
    if (!scale) return null;
    const { min, max } = scale;
    const pct = (dayIdx - min) / Math.max(1, max - min);
    return scale.left + pct * (scale.right - scale.left);
  }

  // ── overlay positioning ───────────────────────────────────────────────────
  function positionOverlays() {
    const sx = dayToPixel(scrubDayRef.current);
    const tx = dayToPixel(CHART_TODAY);
    if (scrubRef.current) {
      scrubRef.current.style.left = sx != null ? `${sx}px` : '-9999px';
    }
    if (handleRef.current) {
      handleRef.current.style.left = sx != null ? `${sx}px` : '-9999px';
    }
    if (todayRef.current) {
      todayRef.current.style.left = tx != null ? `${tx}px` : '-9999px';
    }
    if (pillRef.current) {
      pillRef.current.style.left = tx != null ? `${tx}px` : '-9999px';
    }
  }

  // ── apply pan (fast: no chart recreate) ──────────────────────────────────
  const applyPan = useCallback((centerDay) => {
    const chart = chartRef.current;
    if (!chart) return;
    const rw = RANGE_WIDTHS[range] ?? CHART_N;
    const half = rw != null ? Math.floor(rw / 2) : null;
    let min, max;
    if (half == null) { min = 0; max = CHART_N - 1; }
    else { min = centerDay - half; max = centerDay + half; }
    chart.options.scales.x.min = min;
    chart.options.scales.x.max = max;
    chart.update('none');
    positionOverlays();
  }, [range]);

  // ── readout refresh ───────────────────────────────────────────────────────
  const refreshReadout = useCallback((dayIdx) => {
    if (!buildReadout || !dates) return;
    setReadout(buildReadout(dayIdx, visible, dates));
  }, [buildReadout, visible, dates]);

  // ── reset to today ────────────────────────────────────────────────────────
  function resetToToday() {
    scrubDayRef.current = CHART_TODAY;
    centerRef.current = CHART_TODAY;
    applyPan(CHART_TODAY);
    refreshReadout(CHART_TODAY);
  }

  // ── pointer handlers ──────────────────────────────────────────────────────
  function pixelToDay(clientX) {
    const chart = chartRef.current;
    if (!chart) return null;
    const scale = chart.scales.x;
    const rect = canvasRef.current.getBoundingClientRect();
    const relX = clientX - rect.left;
    const pct = (relX - scale.left) / Math.max(1, scale.right - scale.left);
    const { min, max } = scale;
    return Math.round(min + pct * (max - min));
  }

  function handlePointerDown(e) {
    const isHandle = e.target.dataset.handle === 'scrub';
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCenter: centerRef.current,
      mode: isHandle ? 'scrub' : 'tap-or-pan',
      originX: e.clientX,
      originY: e.clientY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e) {
    const p = panRef.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;

    if (p.mode === 'tap-or-pan') {
      if (Math.abs(dx) > 6) p.mode = 'pan';
      else return;
    }

    const chart = chartRef.current;
    if (!chart) return;
    const scale = chart.scales.x;
    const pxSpan = scale.right - scale.left;
    const rw = RANGE_WIDTHS[range] ?? CHART_N;
    const daySpan = rw ?? CHART_N;

    if (p.mode === 'pan') {
      const daysPerPx = daySpan / Math.max(1, pxSpan);
      const newCenter = clampCenter(Math.round(p.startCenter - dx * daysPerPx), rw);
      centerRef.current = newCenter;
      applyPan(newCenter);
    } else if (p.mode === 'scrub') {
      const day = Math.max(0, Math.min(CHART_N - 1, pixelToDay(e.clientX) ?? scrubDayRef.current));
      scrubDayRef.current = day;
      positionOverlays();
      refreshReadout(day);
    }
  }

  function handlePointerUp(e) {
    const p = panRef.current;
    panRef.current = null;
    if (!p) return;
    if (p.mode === 'tap-or-pan') {
      // tap — move scrubber to tap point
      const day = Math.max(0, Math.min(CHART_N - 1, pixelToDay(e.clientX) ?? scrubDayRef.current));
      scrubDayRef.current = day;
      positionOverlays();
      refreshReadout(day);
    }
  }

  // ── chart creation ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !dates || !buildDatasets || !buildScales) return;
    const containerW = containerRef.current?.offsetWidth || 340;

    const tickLabels = buildTickLabels(dates);
    const rw = RANGE_WIDTHS[range] ?? CHART_N;
    const half = rw != null ? Math.floor(rw / 2) : null;
    const ctr = clampCenter(centerRef.current, rw);
    const xMin = half != null ? ctr - half : 0;
    const xMax = half != null ? ctr + half : CHART_N - 1;

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }

    const datasets = buildDatasets(range, visible, containerW);
    const scales   = buildScales(range, visible);

    // Patch x scale
    scales.x = {
      ...scales.x,
      type: 'linear',
      min: xMin,
      max: xMax,
      ticks: {
        autoSkip: false,
        maxRotation: 0,
        callback(val) {
          const i = Math.round(val);
          if (i < 0 || i >= tickLabels.length) return '';
          const lbl = tickLabels[i];
          if (!lbl) return '';
          // monthly tick is bold, weekly is lighter
          return lbl;
        },
        font(ctx) {
          const i = Math.round(ctx.tick?.value ?? 0);
          const lbl = tickLabels[i] || '';
          const isMonth = lbl.length > 2 || (lbl.length === 3 && isNaN(Number(lbl)));
          return { size: isMonth ? 11 : 9, weight: isMonth ? '600' : '400' };
        },
        color(ctx) {
          const i = Math.round(ctx.tick?.value ?? 0);
          const lbl = tickLabels[i] || '';
          const isMonth = lbl.length > 2 || (lbl.length === 3 && isNaN(Number(lbl)));
          return isMonth ? C.text : C.muted;
        },
      },
      afterBuildTicks(scale) {
        // Keep only labelled ticks and apply collision avoidance for weekly ticks
        const allLabelled = scale.ticks.filter(t => {
          const i = Math.round(t.value);
          return i >= 0 && i < tickLabels.length && tickLabels[i] !== '';
        });
        const span = (scale.max ?? CHART_N) - (scale.min ?? 0);
        const pxWidth = (scale.right ?? 300) - (scale.left ?? 0) || 300;
        const pxPerDay = pxWidth / Math.max(1, span);
        const minGap = Math.max(2, Math.ceil(38 / pxPerDay));

        const monthlyIdxs = new Set(
          allLabelled
            .map(t => Math.round(t.value))
            .filter(i => { const l = tickLabels[i]; return l && (l.length > 2 || (l.length === 3 && isNaN(Number(l)))); })
        );

        scale.ticks = allLabelled.filter(t => {
          const i = Math.round(t.value);
          const lbl = tickLabels[i] || '';
          const isMonth = lbl.length > 2 || (lbl.length === 3 && isNaN(Number(lbl)));
          if (isMonth) return true;
          // weekly: drop if within minGap of any monthly tick
          for (const mi of monthlyIdxs) {
            if (Math.abs(i - mi) < minGap) return false;
          }
          return true;
        });
      },
      grid: { color: C.border },
    };

    // Today annotation via dataset (vertical line at CHART_TODAY)
    // We'll use the DOM overlay instead, so just create the chart:
    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: { datasets },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { enabled: false }, legend: { display: false } },
        scales,
      },
    });

    positionOverlays();
    refreshReadout(scrubDayRef.current);

    return () => { chartRef.current?.destroy(); chartRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates, buildDatasets, buildScales, range, visible]);

  // Re-position overlays after chart renders
  useEffect(() => { positionOverlays(); });

  // Range button handler
  function handleRangeChange(r) {
    const rw = RANGE_WIDTHS[r];
    const newCenter = clampCenter(scrubDayRef.current, rw);
    centerRef.current = newCenter;
    setRange(r);
  }

  function toggleKey(k) {
    setVisible(v => ({ ...v, [k]: !v[k] }));
  }

  const todayDateStr = dates?.[CHART_TODAY] ?? '';

  return (
    <div style={{ position: 'relative' }}>
      {/* Title */}
      {label && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.green1, marginBottom: 2 }}>{label}</div>
          {sublabel && <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>{sublabel}</div>}
        </div>
      )}

      {/* Range buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        {Object.keys(RANGE_WIDTHS).map(r => (
          <button
            key={r}
            onClick={() => handleRangeChange(r)}
            style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, cursor: 'pointer', border: 'none',
              background: range === r ? C.green2 : C.green4,
              color: range === r ? '#fff' : C.green1,
            }}
          >{r}</button>
        ))}
      </div>

      {/* Readout box */}
      {readout && (
        <div
          onClick={resetToToday}
          style={{
            background: 'rgba(255,255,255,0.96)', border: `1px solid ${C.border}`, borderRadius: 8,
            padding: '5px 9px', fontSize: 11, lineHeight: 1.7, marginBottom: 6, cursor: 'pointer',
            boxShadow: '0 1px 6px rgba(0,0,0,0.07)',
          }}
        >
          <div style={{ fontWeight: 700, color: C.green1, marginBottom: 1 }}>{readout.dateLabel}</div>
          {readout.lines.map((l, i) => (
            <div key={i} style={{ color: l.color || C.text }}>
              {l.label}: <strong>{l.value}</strong>
            </div>
          ))}
          <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>Tap to return to today</div>
        </div>
      )}

      {/* Canvas + overlays */}
      <div
        ref={containerRef}
        style={{ position: 'relative', width: '100%', height: chartHeight, touchAction: 'none', userSelect: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => { panRef.current = null; }}
      >
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }}
          height={chartHeight} />

        {/* Scrubber line */}
        <div ref={scrubRef} style={{
          position: 'absolute', top: 0, bottom: 28, width: 2, background: C.green1,
          pointerEvents: 'none', transform: 'translateX(-1px)',
        }} />

        {/* Scrubber handle */}
        <div ref={handleRef} data-handle="scrub" style={{
          position: 'absolute', bottom: 28, width: 22, height: 22,
          background: '#fff', border: `2px solid ${C.green1}`, borderRadius: '50%',
          transform: 'translate(-50%, 50%)', cursor: 'ew-resize', touchAction: 'none',
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
        }} />

        {/* Today marker line */}
        <div ref={todayRef} style={{
          position: 'absolute', top: 0, bottom: 28, width: 1.5,
          background: C.green2, opacity: 0.7, pointerEvents: 'none',
          transform: 'translateX(-0.75px)', borderRadius: 1,
          borderTop: `2px dashed ${C.green2}`, borderBottom: 'none',
        }} />

        {/* Today pill */}
        <div ref={pillRef} style={{
          position: 'absolute', top: 3, transform: 'translateX(-50%)',
          background: C.green2, color: '#fff', fontSize: 9, fontWeight: 700,
          padding: '2px 6px', borderRadius: 8, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          Today · {fmtDay(todayDateStr)}
        </div>
      </div>

      {/* Toggle pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
        {Object.entries(togglePills).map(([k, cfg]) => {
          const on = visible[k];
          return (
            <button
              key={k}
              onClick={() => toggleKey(k)}
              style={{
                fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 10, cursor: 'pointer',
                background: on ? (cfg.color + '22') : 'transparent',
                color: on ? cfg.color : C.muted,
                border: `1.5px ${cfg.dashed ? 'dashed' : 'solid'} ${on ? cfg.color : C.border}`,
              }}
            >{cfg.label}</button>
          );
        })}
      </div>
    </div>
  );
}
