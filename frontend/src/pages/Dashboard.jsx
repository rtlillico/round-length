// round-length/frontend/src/pages/Dashboard.jsx
import { useState, useEffect, lazy, Suspense } from 'react';
import { api } from '../lib/api';
import { C, styles } from '../App';
import { PASTURE_PARAMS, SOIL_PARAMS } from '../lib/formula';
import ComparisonTable from '../components/ComparisonTable';
import { ScenarioInfoSheet } from '../components/SeasonUI';

const ScenarioDetail = lazy(() => import('./ScenarioDetail'));

function ProgressBar({ pct }) {
  return (
    <div style={{ background: C.green4, borderRadius: 20, height: 10, overflow: 'hidden', marginTop: 8 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: C.green2, borderRadius: 20, transition: 'width 0.5s ease' }} />
    </div>
  );
}

function StatusBanner({ progress }) {
  if (progress.phase === 'error') {
    return (
      <div style={{ ...styles.card, ...styles.warning }}>
        <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4 }}>Something went wrong</div>
        <div style={{ fontSize: 13 }}>{progress.error || 'Unknown error.'}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
          Check the backend logs. Once fixed, recreate the affected scenario or wait for the nightly update.
        </div>
      </div>
    );
  }
  return (
    <div style={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 'bold', color: C.green1 }}>
          {progress.phase === 'downloading' && 'Fetching climate data from SILO...'}
          {progress.phase === 'inserting'   && 'Saving data...'}
          {progress.phase === 'computing'   && 'Computing historical averages...'}
        </div>
        <div style={{ fontSize: 13, color: C.muted }}>{progress.pct}%</div>
      </div>
      <ProgressBar pct={progress.pct} />
      <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
        The page will update automatically when ready.
      </div>
    </div>
  );
}

const LABEL_W = 96;
const COL_W   = 112;

function ScenarioSummaryTable({ scenarios, farm, onSelectScenario, onEdit }) {
  const ROWS = [
    { label: 'Farm',          getValue: (s) => farm?.name || '—' },
    { label: 'Description',   getValue: (s) => s.description || '—' },
    { label: 'Grass type',    getValue: (s) => PASTURE_PARAMS[s.pasture_key]?.name?.replace(/ ryegrass| grass/, '') || s.pasture_key },
    { label: 'Location',      getValue: (s) => farm ? `${Number(farm.lat).toFixed(2)}, ${Number(farm.lon).toFixed(2)}` : '—' },
    { label: 'Soil type',     getValue: (s) => SOIL_PARAMS[s.soil_type]?.name || s.soil_type || '—' },
    { label: 'Target leaves', getValue: (s) => s.target_leaves != null ? String(Number(s.target_leaves).toFixed(1)) : '—' },
  ];

  return (
    <div style={{ overflowX: 'auto', margin: '12px 16px 0', borderRadius: 12, border: `1px solid ${C.border}`, background: C.card }}>
      <div style={{ minWidth: LABEL_W + scenarios.length * COL_W }}>
        {/* Header row */}
        <div style={{ display: 'flex', borderBottom: `2px solid ${C.border}` }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          {scenarios.map((s, i) => (
            <div
              key={s.id}
              style={{ width: COL_W, flexShrink: 0, textAlign: 'center', padding: '12px 6px 10px', borderLeft: `1px solid ${C.border}` }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Lora', Georgia, serif", color: C.green1, lineHeight: 1, cursor: 'pointer' }} onClick={() => onSelectScenario(s)}>
                {s.short_code || `S${i + 1}`}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(s); }}
                style={{ marginTop: 6, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 11, padding: '3px 8px', cursor: 'pointer' }}
              >
                Edit
              </button>
            </div>
          ))}
        </div>
        {/* Data rows */}
        {ROWS.map((row, ri) => (
          <div key={row.label} style={{ display: 'flex', alignItems: 'stretch', borderBottom: ri < ROWS.length - 1 ? `1px solid ${C.border}` : 'none' }}>
            <div style={{ width: LABEL_W, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '10px', fontSize: 12, fontWeight: 500, color: C.muted, lineHeight: 1.3 }}>
              {row.label}
            </div>
            {scenarios.map((s, ci) => (
              <div
                key={s.id}
                style={{ width: COL_W, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px 6px', cursor: 'pointer', borderLeft: `1px solid ${C.border}` }}
                onClick={() => onSelectScenario(s)}
              >
                <span style={{ fontSize: 13, fontWeight: 500, color: C.text, textAlign: 'center', lineHeight: 1.3, wordBreak: 'break-word' }}>
                  {row.getValue(s)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard({ farmId, onSelectScenario, onAdd, forceTable, onShowTable }) {
  const [farm, setFarm]           = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [editingScenario, setEditingScenario] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  useEffect(() => {
    let timer;

    async function load() {
      try {
        setLoading(true);
        const [farmData, scenarioData, statusData] = await Promise.all([
          api.farms.get(farmId),
          api.scenarios.list(farmId),
          api.farms.status(farmId),
        ]);
        setFarm(farmData);
        setScenarios(scenarioData.sort((a, b) => {
          const ra = a.todayState?.true_round ?? Infinity;
          const rb = b.todayState?.true_round ?? Infinity;
          return ra - rb;
        }));
        setDownloadProgress(statusData.downloadProgress);
        if (statusData.downloadProgress && statusData.downloadProgress.phase !== 'error') timer = setTimeout(poll, 3000);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    async function poll() {
      try {
        const [scenarioData, statusData] = await Promise.all([
          api.scenarios.list(farmId),
          api.farms.status(farmId),
        ]);
        setScenarios(scenarioData.sort((a, b) => {
          const ra = a.todayState?.true_round ?? Infinity;
          const rb = b.todayState?.true_round ?? Infinity;
          return ra - rb;
        }));
        setDownloadProgress(statusData.downloadProgress);
        if (statusData.downloadProgress && statusData.downloadProgress.phase !== 'error') timer = setTimeout(poll, 3000);
      } catch {
        // ignore poll errors
      }
    }

    load();
    return () => clearTimeout(timer);
  }, [farmId, reloadTick]);

  if (loading) return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Round Length</div>
          <div style={styles.headerSub}>Loading...</div>
        </div>
      </div>
      <div style={{ ...styles.card, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
        <p style={styles.muted}>Loading your farm data...</p>
      </div>
    </div>
  );

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div style={styles.headerTitle}>Round Length</div>
      </div>
      <div style={{ ...styles.card, ...styles.warning }}>
        Error loading data: {error}
      </div>
    </div>
  );

  // 0 scenarios — empty state
  if (scenarios.length === 0) {
    return (
      <div style={styles.screen}>
        <div style={styles.header}>
          <div>
            <div style={styles.headerTitle}>{farm?.name || 'Round Length'}</div>
            <div style={styles.headerSub}>{today}</div>
          </div>
        </div>
        {downloadProgress && <StatusBanner progress={downloadProgress} />}
        <div style={{ ...styles.card, textAlign: 'center', padding: '32px 20px' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
          <p style={styles.h2}>No scenarios yet</p>
          <p style={{ ...styles.muted, marginBottom: 20 }}>
            Add your first scenario to get started. A scenario is a combination
            of pasture type, leaf target, and soil conditions for a part of your farm.
          </p>
          <button style={styles.btn} onClick={onAdd}>＋ Add first scenario</button>
        </div>
      </div>
    );
  }

  // 1 scenario and not forced to table — show season overview directly
  if (!forceTable && scenarios.length === 1) {
    return (
      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: C.muted, fontSize: 14 }}>Loading…</div>}>
        <ScenarioDetail
          scenario={scenarios[0]}
          farmId={farmId}
          onBack={onShowTable}
        />
      </Suspense>
    );
  }

  // 1+ scenarios — summary table + comparison metrics for 2+
  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>{farm?.name || 'Round Length'}</div>
          <div style={styles.headerSub}>{today}</div>
        </div>
        <button
          onClick={onAdd}
          style={{ background: 'transparent', border: '1.5px solid rgba(255,255,255,0.6)', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: '600', cursor: 'pointer' }}
        >
          ＋ Add
        </button>
      </div>

      {downloadProgress && <StatusBanner progress={downloadProgress} />}

      <ScenarioSummaryTable
        scenarios={scenarios}
        farm={farm}
        onSelectScenario={onSelectScenario}
        onEdit={setEditingScenario}
      />
      {editingScenario && (
        <ScenarioInfoSheet
          scenario={editingScenario}
          startEditing
          onClose={() => setEditingScenario(null)}
          onSaved={(updated) => {
            setScenarios(prev => prev.map(s => s.id === updated.id ? { ...s, ...updated } : s));
            setEditingScenario(null);
            if (updated.recomputing) setReloadTick(t => t + 1);
          }}
        />
      )}

      {scenarios.length >= 2 && (
        <ComparisonTable
          scenarios={scenarios}
          onSelectScenario={onSelectScenario}
        />
      )}
    </div>
  );
}
