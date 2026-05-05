// round-length/frontend/src/pages/Planning.jsx
import { C, styles } from '../App';

export default function Planning({ farmId }) {
  function copyLink() {
    const url = `${window.location.origin}/planning?farmId=${farmId}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied — paste it into your desktop browser.');
    });
  }

  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>📊 Planning table</div>
          <div style={styles.headerSub}>Historical monthly analysis</div>
        </div>
      </div>

      <div style={{ ...styles.card, textAlign: 'center', padding: '32px 20px' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🖥️</div>
        <p style={styles.h2}>Best on a larger screen</p>
        <p style={{ ...styles.muted, lineHeight: 1.6, marginBottom: 20 }}>
          The planning table shows monthly averages going back to 1889 — temperature,
          growth rate, and round length for every month and year.
          With 12 columns it works best on a desktop or laptop.
        </p>
        <button style={styles.btn} onClick={copyLink}>
          Copy link to open on desktop →
        </button>
      </div>

      <div style={styles.card}>
        <p style={styles.h3}>What you'll see on desktop</p>
        <p style={{ ...styles.muted, lineHeight: 1.6 }}>
          A table with months as columns (Jan–Dec) and years as rows (1889–present).
          Choose what to display at the top: average temperature, daily growth rate (LAR),
          or true round length. Colour-coded so patterns jump out immediately — green
          means fast growth, red means slow.
        </p>
        <p style={{ ...styles.muted, lineHeight: 1.6, marginTop: 10 }}>
          Use it to assess a new block of land, plan stocking rates by season, or
          compare how different pasture types would perform at your location.
        </p>
      </div>

      <div style={styles.card}>
        <p style={styles.h3}>Try landscape mode</p>
        <p style={{ ...styles.muted, fontSize: 13 }}>
          Rotate your phone sideways for a preview of the table — it won't be perfect
          but gives you an idea of what to expect on a larger screen.
        </p>
      </div>
    </div>
  );
}
