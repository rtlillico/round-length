// round-length/frontend/src/pages/NitrogenScreen.jsx
import { styles } from '../App';
import { PASTURE_PARAMS } from '../lib/formula';
import { ScenarioBanner, NavLinks } from '../components/SeasonUI';

export default function NitrogenScreen({ scenario, onNavigate }) {
  const pasture = PASTURE_PARAMS[scenario.pasture_key];

  return (
    <div style={styles.screen}>
      <div style={{ background: '#2d4a1e', position: 'sticky', top: 0, zIndex: 20 }}>
        <ScenarioBanner scenario={scenario} pasture={pasture} title="🌱 Nitrogen" onBack={() => onNavigate('overview')} />
      </div>

      <div style={{ padding: '10px 10px 0' }}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🌱</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#2d4a1e', marginBottom: 8 }}>
              Nitrogen factor coming soon
            </div>
            <div style={{ fontSize: 12, color: '#6b7c5a', lineHeight: 1.6 }}>
              Nitrogen response modelling will adjust LAR based on fertiliser application history and soil N availability.
            </div>
          </div>
        </div>

        <NavLinks onNavigate={onNavigate} current="nitrogen" />
      </div>
    </div>
  );
}
