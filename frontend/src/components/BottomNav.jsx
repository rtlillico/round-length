// round-length/frontend/src/components/BottomNav.jsx
import { C } from '../App';

const NAV_ITEMS = [
  { id: 'scenarios', icon: '🌿', label: 'Scenarios' },
  { id: 'add',       icon: '＋', label: 'Add'       },
  { id: 'planning',  icon: '📊', label: 'Planning'  },
  { id: 'settings',  icon: '⚙️', label: 'Settings'  },
];

export default function BottomNav({ active, onChange }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480,
      background: C.green1, display: 'flex',
      borderTop: `2px solid ${C.green2}`,
      zIndex: 100,
    }}>
      {NAV_ITEMS.map(n => (
        <button
          key={n.id}
          onClick={() => onChange(n.id)}
          style={{
            flex: 1, padding: '12px 4px',
            background: 'transparent', border: 'none',
            color: active === n.id ? '#fff' : 'rgba(255,255,255,0.55)',
            cursor: 'pointer', fontSize: 11,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          }}
        >
          <span style={{ fontSize: 20 }}>{n.icon}</span>
          {n.label}
        </button>
      ))}
    </div>
  );
}
