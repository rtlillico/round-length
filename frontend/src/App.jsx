// round-length/frontend/src/App.jsx
import { useState, useEffect } from 'react';
import Dashboard  from './pages/Dashboard';
import Setup      from './pages/Setup';
import ScenarioDetail from './pages/ScenarioDetail';
import Planning   from './pages/Planning';
import Settings   from './pages/Settings';
import BottomNav  from './components/BottomNav';

// Colour palette — earthy greens, cream backgrounds
export const C = {
  bg:     '#f5f0e8',
  card:   '#fffef9',
  green1: '#2d4a1e',
  green2: '#5a8c2a',
  green3: '#7ab55c',
  green4: '#c8e6b8',
  amber:  '#c8891a',
  red:    '#c0392b',
  text:   '#1e2d14',
  muted:  '#6b7c5e',
  border: '#d6e8c8',
};

export const styles = {
  app:    { fontFamily: "'DM Sans', 'Helvetica Neue', Arial, sans-serif", background: C.bg, minHeight: '100vh', maxWidth: 480, margin: '0 auto', position: 'relative' },
  screen: { padding: '0 0 80px 0', minHeight: '100vh' },
  header: { background: C.green1, color: '#fff', padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', letterSpacing: 0.5, fontFamily: "'Lora', Georgia, serif" },
  headerSub:   { fontSize: 12, opacity: 0.75, marginTop: 2 },
  card:   { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, margin: '14px 16px', padding: '18px 18px' },
  btn:    { background: C.green2, color: '#fff', border: 'none', borderRadius: 12, padding: '14px 24px', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', width: '100%' },
  btnOutline: { background: 'transparent', color: C.green2, border: `2px solid ${C.green2}`, borderRadius: 12, padding: '12px 24px', fontSize: 15, fontWeight: 'bold', cursor: 'pointer', width: '100%' },
  input:  { width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 16, background: '#fff', color: '#1e2d14', fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' },
  label:  { fontSize: 13, fontWeight: '500', color: C.muted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, display: 'block' },
  h2:     { fontSize: 20, color: C.green1, fontWeight: 'bold', margin: '0 0 4px', fontFamily: "'Lora', Georgia, serif" },
  h3:     { fontSize: 16, color: C.green1, fontWeight: 'bold', margin: '0 0 10px', fontFamily: "'Lora', Georgia, serif" },
  muted:  { fontSize: 14, color: C.muted, lineHeight: 1.5 },
  tip:    { background: '#eef7e8', border: `1px solid ${C.green3}`, borderRadius: 10, padding: '12px 14px', fontSize: 14, color: C.green1, marginTop: 12 },
  warning:{ background: '#fff3e0', border: '1px solid #e0913a', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#7a4000', marginTop: 12 },
  row:    { display: 'flex', gap: 10 },
  bigNumber: { fontSize: 88, fontWeight: 'bold', color: C.green1, lineHeight: 1, textAlign: 'center', letterSpacing: -4, fontFamily: "'Lora', Georgia, serif" },
  bigLabel:  { fontSize: 15, color: C.muted, textAlign: 'center', marginTop: 4 },
};

// Local storage keys
const LS_FARM_ID = 'roundlength_farm_id';

export default function App() {
  const [tab, setTab]           = useState('scenarios'); // scenarios | add | planning | settings
  const [farmId, setFarmId]     = useState(() => localStorage.getItem(LS_FARM_ID));
  const [selectedScenario, setSelectedScenario] = useState(null); // scenario object or null

  function handleFarmCreated(id) {
    localStorage.setItem(LS_FARM_ID, String(id));
    setFarmId(String(id));
    setTab('scenarios');
  }

  function handleSelectScenario(scenario) {
    setSelectedScenario(scenario);
  }

  function handleBackFromScenario() {
    setSelectedScenario(null);
  }

  // If no farm set up yet, show setup wizard
  if (!farmId) {
    return (
      <div style={styles.app}>
        <Setup onComplete={handleFarmCreated} />
      </div>
    );
  }

  // If a scenario is selected, show its detail screen (full screen, no nav)
  if (selectedScenario) {
    return (
      <div style={styles.app}>
        <ScenarioDetail
          scenario={selectedScenario}
          farmId={farmId}
          onBack={handleBackFromScenario}
        />
      </div>
    );
  }

  return (
    <div style={styles.app}>
      {tab === 'scenarios' && (
        <Dashboard
          farmId={farmId}
          onSelectScenario={handleSelectScenario}
          onAdd={() => setTab('add')}
        />
      )}
      {tab === 'add' && (
        <Setup
          farmId={farmId}
          scenarioOnly
          onComplete={() => setTab('scenarios')}
          onCancel={() => setTab('scenarios')}
        />
      )}
      {tab === 'planning' && <Planning farmId={farmId} />}
      {tab === 'settings' && (
        <Settings
          farmId={farmId}
          onFarmDeleted={() => {
            localStorage.removeItem(LS_FARM_ID);
            setFarmId(null);
          }}
        />
      )}
      <BottomNav active={tab} onChange={setTab} />
    </div>
  );
}
