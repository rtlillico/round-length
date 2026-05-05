// round-length/frontend/src/pages/Setup.jsx
import { useState } from 'react';
import { api } from '../lib/api';
import { C, styles } from '../App';

const PASTURE_PARAMS_UI = {
  perennialRyegrass: { name: 'Perennial ryegrass', region: 'Temperate', desc: 'Most common dairy pasture in Tasmania. Grows best in cool mild conditions.' },
  annualRyegrass:    { name: 'Annual ryegrass',    region: 'Temperate', desc: 'Common in drier areas. Similar to perennial but shorter lived.' },
  tallFescue:        { name: 'Tall fescue',        region: 'Temperate', desc: 'More heat and drought tolerant than ryegrass. Deeper roots.' },
  cocksfoot:         { name: 'Cocksfoot',           region: 'Temperate', desc: 'Hardy and drought tolerant. Common in drier Victoria and SA.' },
  phalaris:          { name: 'Phalaris',            region: 'Temperate', desc: 'Very persistent. Handles both dry summers and waterlogging.' },
  kikuyu:            { name: 'Kikuyu',              region: 'Subtropical', desc: 'Tropical grass. Needs warmth — little growth in cool temperate regions.' },
  rhodesGrass:       { name: 'Rhodes grass',        region: 'Tropical', desc: 'Queensland dairy. Thrives in heat, almost no growth in cool weather.' },
};

const LEAF_STAGES = [
  { value: 1.5, label: '1.5 leaves', desc: 'Too early — plant hasn\'t recovered enough' },
  { value: 2.0, label: '2.0 leaves', desc: 'Getting there but still a bit early' },
  { value: 2.5, label: '2.5 leaves', desc: 'Good — balances yield and plant health' },
  { value: 3.0, label: '3.0 leaves', desc: 'Maximum yield — ideal when growth is slow' },
];

// ─── LOCATION STEP ────────────────────────────────────────────────────────────

function LocationStep({ onNext }) {
  const [method, setMethod]   = useState(null); // 'gps' | 'search' | 'manual'
  const [search, setSearch]   = useState('123 Blameys Road, Christmas Hills, Tasmania');
  const [lat, setLat]         = useState('');
  const [lon, setLon]         = useState('');
  const [resolved, setResolved] = useState(null); // { lat, lon, label }
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  async function useGPS() {
    setMethod('gps');
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const label = await reverseGeocode(latitude, longitude);
        setResolved({ lat: latitude, lon: longitude, label });
        setLoading(false);
      },
      (err) => {
        setError('Could not get your location. Try searching instead.');
        setLoading(false);
      }
    );
  }

  async function searchLocation() {
    if (!search.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(search + ' Australia')}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data.length === 0) throw new Error('Location not found. Try a more specific search.');
      const { lat: rlat, lon: rlon, display_name } = data[0];
      const shortLabel = display_name.split(',').slice(0, 3).join(',');
      setResolved({ lat: Number(rlat), lon: Number(rlon), label: shortLabel });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function useManual() {
    const rlat = parseFloat(lat);
    const rlon = parseFloat(lon);
    if (isNaN(rlat) || isNaN(rlon)) { setError('Please enter valid lat/lon numbers'); return; }
    if (rlat < -44 || rlat > -10 || rlon < 113 || rlon > 154) {
      setError('These coordinates are outside Australia. Check your values.');
      return;
    }
    setResolved({ lat: rlat, lon: rlon, label: `${rlat.toFixed(4)}, ${rlon.toFixed(4)}` });
  }

  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
      const data = await res.json();
      return data.display_name?.split(',').slice(0, 3).join(',') || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    } catch {
      return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  }

  function isInAustralia(lat, lon) {
    return lat >= -44 && lat <= -10 && lon >= 113 && lon <= 154;
  }

  if (resolved) {
    const inAustralia = isInAustralia(resolved.lat, resolved.lon);
    return (
      <div style={styles.screen}>
        <div style={styles.header}>
          <div><div style={styles.headerTitle}>Confirm location</div></div>
          <button onClick={() => setResolved(null)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>← Back</button>
        </div>
        <div style={styles.card}>
          <p style={styles.h3}>📍 Is this your farm location?</p>
          <div style={{ background: '#eef7e8', borderRadius: 10, padding: '14px', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', color: C.green1, marginBottom: 4 }}>{resolved.label}</div>
            <div style={{ fontSize: 13, color: C.muted }}>Lat: {Number(resolved.lat).toFixed(5)} · Lon: {Number(resolved.lon).toFixed(5)}</div>
          </div>
          {!inAustralia && (
            <div style={styles.warning}>
              ⚠️ These coordinates are outside Australia. SILO only covers Australian locations — please go back and try again.
            </div>
          )}
          {inAustralia && (
            <p style={{ ...styles.muted, fontSize: 13 }}>
              This location will be used to download climate data from SILO.
              Make sure it's on or near your farm before continuing.
            </p>
          )}
        </div>
        <div style={{ padding: '0 16px 8px' }}>
          <button style={{ ...styles.btn, opacity: inAustralia ? 1 : 0.4 }} disabled={!inAustralia} onClick={() => onNext(resolved)}>Yes, this is correct ✓</button>
        </div>
        <div style={{ padding: '0 16px' }}>
          <button style={styles.btnOutline} onClick={() => setResolved(null)}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div><div style={styles.headerTitle}>Farm location</div><div style={styles.headerSub}>Where is your farm?</div></div>
      </div>
      <div style={{ padding: '16px 16px 0' }}>
        <p style={styles.muted}>Choose how to set your farm location. This is used to download local climate data.</p>
      </div>

      {/* GPS */}
      <div style={styles.card}>
        <button style={styles.btn} onClick={useGPS} disabled={loading}>
          📍 Use my current location (GPS)
        </button>
        <p style={{ ...styles.muted, fontSize: 13, marginTop: 8 }}>Best if you're at the farm right now.</p>
      </div>

      {/* Search */}
      <div style={styles.card}>
        <p style={styles.h3}>🔍 Search by town or address</p>
        <p style={{ ...styles.muted, fontSize: 13, marginBottom: 10 }}>Use if you're not physically at the farm.</p>
        <input
          style={styles.input}
          placeholder="e.g. Smithton Tasmania"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && searchLocation()}
        />
        <button style={{ ...styles.btn, marginTop: 10 }} onClick={searchLocation} disabled={loading || !search.trim()}>
          Search
        </button>
      </div>

      {/* Manual */}
      <div style={styles.card}>
        <p style={styles.h3}>🌐 Enter coordinates manually</p>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Latitude</label>
            <input style={styles.input} placeholder="-40.85" value={lat} onChange={e => setLat(e.target.value)} type="number" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>Longitude</label>
            <input style={styles.input} placeholder="145.12" value={lon} onChange={e => setLon(e.target.value)} type="number" />
          </div>
        </div>
        <button style={{ ...styles.btn, marginTop: 10 }} onClick={useManual}>Use these coordinates</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 20, color: C.muted }}>Finding location...</div>}
      {error && <div style={{ ...styles.warning, margin: '0 16px' }}>{error}</div>}
    </div>
  );
}

// ─── MAIN SETUP WIZARD ────────────────────────────────────────────────────────

export default function Setup({ onComplete, onCancel, farmId, scenarioOnly }) {
  const [step, setStep]           = useState(scenarioOnly ? 'name' : 'welcome');
  const [farmName, setFarmName]   = useState('My Farm');
  const [siloEmail, setSiloEmail] = useState('rtlillico@gmail.com');
  const [location, setLocation]   = useState(null);
  const [scenarioName, setScenarioName] = useState('');
  const [pastureKey, setPastureKey]     = useState('perennialRyegrass');
  const [targetLeaves, setTargetLeaves] = useState(3.0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);

  async function handleFinish() {
    if (!targetLeaves) return;
    setLoading(true);
    setError(null);
    try {
      let fId = farmId;

      if (!scenarioOnly) {
        // Create the farm — SILO download starts in background
        const { farm } = await api.farms.create({
          name: farmName || 'My Farm',
          lat: location.lat,
          lon: location.lon,
          siloEmail,
        });
        fId = farm.id;
      }

      // Create the scenario
      await api.scenarios.create({
        farmId: fId,
        name: scenarioName || PASTURE_PARAMS_UI[pastureKey].name,
        pastureKey,
        targetLeaves,
      });

      onComplete(fId);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Welcome screen (farm setup only)
  if (step === 'welcome') return (
    <div style={styles.screen}>
      <div style={{ ...styles.header, background: C.green1 }}>
        <div>
          <div style={styles.headerTitle}>🌿 Round Length</div>
          <div style={styles.headerSub}>Free pasture growth calculator</div>
        </div>
      </div>
      <div style={{ padding: '24px 16px 0' }}>
        <p style={{ ...styles.muted, fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>
          Welcome. This free app tells you how long your grazing rotation needs to be,
          based on actual climate data for your farm going back to 1970.
        </p>
        <p style={{ ...styles.muted, fontSize: 14, marginBottom: 24 }}>
          Setup takes about two minutes.
        </p>
      </div>
      <div style={{ padding: '0 16px' }}>
        <button style={styles.btn} onClick={() => setStep('farm')}>Get started →</button>
      </div>
    </div>
  );

  // Farm details
  if (step === 'farm') return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div><div style={styles.headerTitle}>Your farm</div></div>
        <button onClick={() => setStep('welcome')} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>← Back</button>
      </div>
      <div style={styles.card}>
        <div style={{ marginBottom: 16 }}>
          <label style={styles.label}>Farm name</label>
          <input style={styles.input} placeholder="e.g. Smithton Dairy" value={farmName} onChange={e => setFarmName(e.target.value)} />
        </div>
        <div>
          <label style={styles.label}>Your email address</label>
          <input style={styles.input} placeholder="your@email.com" type="email" value={siloEmail} onChange={e => setSiloEmail(e.target.value)} />
          <p style={{ ...styles.muted, fontSize: 13, marginTop: 6 }}>
            Used to download climate data from SILO (the free Australian Government climate database).
            Not used for marketing.
          </p>
        </div>
      </div>
      <div style={{ padding: '0 16px' }}>
        <button style={{ ...styles.btn, opacity: siloEmail.includes('@') ? 1 : 0.4 }}
          disabled={!siloEmail.includes('@')}
          onClick={() => setStep('location')}>
          Next — Set location →
        </button>
      </div>
    </div>
  );

  // Location
  if (step === 'location') return (
    <LocationStep onNext={(loc) => { setLocation(loc); setStep('name'); }} />
  );

  // Scenario name
  if (step === 'name') return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div><div style={styles.headerTitle}>{scenarioOnly ? 'New scenario' : 'First scenario'}</div></div>
        {onCancel && <button onClick={onCancel} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>✕ Cancel</button>}
      </div>
      <div style={styles.card}>
        <p style={styles.h3}>Give this scenario a name</p>
        <p style={{ ...styles.muted, fontSize: 13, marginBottom: 14 }}>
          A scenario represents a specific part of your farm — a paddock type, soil, or management approach.
          You can add more scenarios later to compare different areas.
        </p>
        <label style={styles.label}>Scenario name</label>
        <input
          style={styles.input}
          placeholder='e.g. "Perennial ryegrass, sandy loam"'
          value={scenarioName}
          onChange={e => setScenarioName(e.target.value)}
        />
      </div>
      <div style={{ padding: '0 16px' }}>
        <button style={styles.btn} onClick={() => setStep('pasture')}>Next — Choose pasture →</button>
      </div>
    </div>
  );

  // Pasture type
  if (step === 'pasture') return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div><div style={styles.headerTitle}>Pasture type</div></div>
        <button onClick={() => setStep('name')} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>← Back</button>
      </div>
      <div style={styles.card}>
        <p style={styles.h3}>What grass do you grow?</p>
        <select style={styles.input} value={pastureKey} onChange={e => setPastureKey(e.target.value)}>
          {Object.entries(PASTURE_PARAMS_UI).map(([k, v]) => (
            <option key={k} value={k}>{v.name} ({v.region})</option>
          ))}
        </select>
        <p style={{ ...styles.muted, fontSize: 13, marginTop: 10 }}>
          {PASTURE_PARAMS_UI[pastureKey].desc}
        </p>
        {PASTURE_PARAMS_UI[pastureKey].region !== 'Temperate' && (
          <div style={styles.warning}>
            ⚠️ {PASTURE_PARAMS_UI[pastureKey].name} is a tropical/subtropical grass. It won't grow
            much in cool temperate regions like Tasmania.
          </div>
        )}
      </div>
      <div style={{ padding: '0 16px' }}>
        <button style={styles.btn} onClick={() => setStep('leaves')}>Next — Set leaf target →</button>
      </div>
    </div>
  );

  // Leaf target
  if (step === 'leaves') return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div><div style={styles.headerTitle}>Leaf target</div><div style={styles.headerSub}>When do you want to graze?</div></div>
        <button onClick={() => setStep('pasture')} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 13 }}>← Back</button>
      </div>
      <div style={styles.card}>
        <p style={styles.h3}>Choose your target leaf stage</p>
        <p style={{ ...styles.muted, fontSize: 13, marginBottom: 16 }}>
          After grazing, grass regrows one leaf at a time. Graze at the right leaf stage to
          maximise yield while keeping the plant healthy.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {LEAF_STAGES.map(ls => {
            const active = targetLeaves === ls.value;
            return (
              <button key={ls.value} onClick={() => setTargetLeaves(ls.value)} style={{
                flex: 1, padding: '14px 4px',
                border: `2px solid ${active ? C.green2 : C.border}`,
                borderRadius: 12,
                background: active ? C.green2 : '#fff',
                color: active ? '#fff' : C.text,
                cursor: 'pointer', fontSize: 18, fontWeight: 'bold',
              }}>{ls.value}</button>
            );
          })}
        </div>
        {targetLeaves && (
          <div style={styles.tip}>
            <strong>{LEAF_STAGES.find(l => l.value === targetLeaves)?.label}:</strong>{' '}
            {LEAF_STAGES.find(l => l.value === targetLeaves)?.desc}
          </div>
        )}
      </div>

      {error && <div style={{ ...styles.warning, margin: '0 16px' }}>{error}</div>}

      <div style={{ padding: '0 16px' }}>
        <button
          style={{ ...styles.btn, opacity: targetLeaves && !loading ? 1 : 0.4 }}
          disabled={!targetLeaves || loading}
          onClick={handleFinish}
        >
          {loading ? 'Setting up...' : scenarioOnly ? 'Create scenario ✓' : 'Start using Round Length 🌿'}
        </button>
      </div>
      {loading && (
        <div style={{ ...styles.card, textAlign: 'center' }}>
          <p style={styles.muted}>
            Downloading climate data from 1889 to today for your location.
            This takes about 10–30 seconds — you'll be notified when it's ready.
          </p>
        </div>
      )}
    </div>
  );

  return null;
}
