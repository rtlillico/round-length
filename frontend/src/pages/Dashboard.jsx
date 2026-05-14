// round-length/frontend/src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { C, styles } from '../App';
import ComparisonTable from '../components/ComparisonTable';
import ScenarioDetail  from './ScenarioDetail';

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

export default function Dashboard({ farmId, onSelectScenario, onAdd }) {
  const [farm, setFarm]           = useState(null);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);

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
  }, [farmId]);

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

  // 1 scenario — render ScenarioDetail inline (no back button)
  if (scenarios.length === 1) {
    return (
      <ScenarioDetail
        scenario={scenarios[0]}
        farmId={farmId}
        onBack={null}
      />
    );
  }

  // 2+ scenarios — comparison table
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

      <ComparisonTable
        scenarios={scenarios}
        onSelectScenario={onSelectScenario}
      />
    </div>
  );
}
