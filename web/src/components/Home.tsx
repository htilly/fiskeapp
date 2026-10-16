import type { Catch, User, Weather } from '../lib/api';
import { describeWeather, fishingTip, windDirName, type Pos } from '../lib/geo';

type Props = {
  user: User; pos: Pos | null; geoError: string | null; lake: string | null;
  weather: Weather | null; catches: Catch[]; onCatch: () => void; onLogout: () => void;
};

export function Home({ user, pos, geoError, lake, weather, catches, onCatch, onLogout }: Props) {
  const w = weather && describeWeather(weather.code);
  const biggest = catches.reduce((m, c) => Math.max(m, c.length_cm ?? 0), 0);
  const species = new Set(catches.map((c) => c.species)).size;

  return (
    <div className="page">
      <header className="top">
        <div>
          <p className="muted small">Tjena {user.name} 👋</p>
          <h2>{pos ? (lake ?? 'Letar efter vatten…') : 'Var är du?'}</h2>
        </div>
        <button className="ghost" onClick={onLogout} aria-label="Logga ut">🚪</button>
      </header>

      {geoError && !pos && <div className="card warn">{geoError}</div>}
      {!pos && !geoError && <div className="card"><span className="pulse">📡</span> Hämtar din position…</div>}

      {weather && w && (
        <section className="card weather">
          <div className="temp">{w.icon} {Math.round(weather.temp)}°</div>
          <div className="w-sub">{w.label}</div>
          <div className="stats">
            <div><b>{weather.wind.toFixed(1)}</b><span>m/s {windDirName(weather.windDir)}</span></div>
            <div><b>{Math.round(weather.pressure)}</b><span>hPa</span></div>
            <div><b>{weather.cloud}%</b><span>moln</span></div>
          </div>
          <p className="tip">{fishingTip(weather)}</p>
        </section>
      )}

      <button className="catch-btn" disabled={!pos} onClick={onCatch}>
        <span>🎣</span> Fick fisk!
        <small>{pos ? `GPS ±${Math.round(pos.accuracy)} m` : 'Väntar på GPS…'}</small>
      </button>

      <section className="tiles">
        <div className="tile"><b>{catches.length}</b><span>fångster</span></div>
        <div className="tile"><b>{species}</b><span>arter</span></div>
        <div className="tile"><b>{biggest || '–'}</b><span>störst (cm)</span></div>
      </section>
    </div>
  );
}
