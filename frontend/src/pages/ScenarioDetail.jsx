// round-length/frontend/src/pages/ScenarioDetail.jsx
import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import SeasonOverview from './SeasonOverview';
import TemperatureScreen from './TemperatureScreen';
import MoistureScreen from './MoistureScreen';
import SolarScreen from './SolarScreen';
import NitrogenScreen from './NitrogenScreen';
import FormulaBreakdown from './FormulaBreakdown';

export default function ScenarioDetail({ scenario, farmId, onBack }) {
  const [screen, setScreen]     = useState('overview');
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  useEffect(() => {
    api.scenarios.chart(scenario.id)
      .then(data => { setChartData(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, [scenario.id]);

  const shared = { scenario, chartData, loading, onNavigate: setScreen };

  if (screen === 'formula')  return <FormulaBreakdown scenario={scenario} actualSeries={chartData?.actual} onBack={() => setScreen('overview')} />;
  if (screen === 'temp')     return <TemperatureScreen {...shared} />;
  if (screen === 'moisture') return <MoistureScreen    {...shared} />;
  if (screen === 'solar')    return <SolarScreen       {...shared} />;
  if (screen === 'nitrogen') return <NitrogenScreen    {...shared} />;
  return <SeasonOverview {...shared} farmId={farmId} error={error} onBack={onBack} />;
}
