// round-length/frontend/src/pages/Settings.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { C, styles } from '../App';

export default function Settings({ farmId, onFarmDeleted }) {
  const [farm, setFarm]       = useState(null);
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    api.farms.get(farmId).then(f => {
      setFarm(f);
      setName(f.name);
      setEmail(f.silo_email);
    }).catch(err => setError(err.message));
  }, [farmId]);

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false);
    try {
      await api.farms.update(farmId, { name, lat: farm.lat, lon: farm.lon, siloEmail: email });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>⚙️ Settings</div>
          <div style={styles.headerSub}>Farm configuration</div>
        </div>
      </div>

      <div style={styles.card}>
        <p style={styles.h3}>Farm details</p>
        <div style={{ marginBottom: 14 }}>
          <label style={styles.label}>Farm name</label>
          <input style={styles.input} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={styles.label}>Email (for SILO data)</label>
          <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        {farm && (
          <div style={{ background: '#f5f0e8', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: C.muted }}>
            📍 Location: {Number(farm.lat).toFixed(5)}, {Number(farm.lon).toFixed(5)}
            <br />To change location, contact support or create a new farm.
          </div>
        )}
        {error && <div style={styles.warning}>{error}</div>}
        {saved && <div style={styles.tip}>✓ Settings saved</div>}
        <button style={{ ...styles.btn, marginTop: 16 }} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>

      <div style={styles.card}>
        <p style={styles.h3}>About</p>
        <p style={{ ...styles.muted, lineHeight: 1.6 }}>
          Round Length is a free pasture growth calculator for Australian dairy farmers.
          Climate data provided by SILO (Queensland Government), sourced from the Bureau of Meteorology.
        </p>
        <p style={{ ...styles.muted, fontSize: 12, marginTop: 8 }}>v1.0 — Temperature LAR only</p>
      </div>

      <div style={{ padding: '8px 16px 20px' }}>
        <button
          onClick={() => {
            if (!confirm('Reset app? This will delete all your farm data and scenarios.')) return;
            onFarmDeleted();
          }}
          style={{ ...styles.btnOutline, color: C.red, borderColor: C.red, fontSize: 14 }}
        >
          Reset app
        </button>
      </div>
    </div>
  );
}
