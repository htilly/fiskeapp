import { useCallback, useEffect, useState } from 'react';
import { api, type Catch, type User, type Weather } from './lib/api';
import { fetchLake, fetchWeather, useLocation } from './lib/geo';
import { Login } from './components/Login';
import { Home } from './components/Home';
import { MapView } from './components/MapView';
import { Log } from './components/Log';
import { CatchSheet } from './components/CatchSheet';

type Tab = 'home' | 'map' | 'log';
export type Spot = { lat: number; lng: number };

export function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => { api.me().then(setUser).catch(() => setUser(null)); }, []);

  if (user === undefined) return <div className="splash">🐟</div>;
  if (!user) return <Login onLogin={setUser} />;
  return <Main user={user} onLogout={async () => { await api.logout(); setUser(null); }} />;
}

function Main({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('home');
  const [catches, setCatches] = useState<Catch[]>([]);
  const [sheetSpot, setSheetSpot] = useState<Spot | null>(null);
  const { pos, error } = useLocation();
  const [lake, setLake] = useState<string | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);

  const reload = useCallback(() => api.catches().then(setCatches), []);
  useEffect(() => { reload(); }, [reload]);

  const lat = pos?.lat, lng = pos?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    fetchLake(lat, lng).then(setLake).catch(() => setLake(null));
    fetchWeather(lat, lng).then(setWeather).catch(() => setWeather(null));
  }, [lat?.toFixed(2), lng?.toFixed(2)]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shell">
      <main className="screen">
        {tab === 'home' && (
          <Home user={user} pos={pos} geoError={error} lake={lake} weather={weather} catches={catches}
            onCatch={() => pos && setSheetSpot({ lat: pos.lat, lng: pos.lng })} onLogout={onLogout} />
        )}
        {tab === 'map' && <MapView pos={pos} catches={catches} onPick={setSheetSpot} />}
        {tab === 'log' && <Log catches={catches} onChange={reload} />}
      </main>
      <nav className="tabs">
        {([['home', '🏠', 'Hem'], ['map', '🗺️', 'Karta'], ['log', '📒', 'Fångster']] as const).map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>
      {sheetSpot && (
        <CatchSheet spot={sheetSpot} lake={lake} weather={weather} onClose={() => setSheetSpot(null)}
          onSaved={() => { setSheetSpot(null); reload(); setTab('log'); }} />
      )}
    </div>
  );
}
