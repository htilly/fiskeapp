import { useState } from 'react';
import { api, type Catch } from '../lib/api';
import { describeWeather } from '../lib/geo';

export function Log({ catches, onChange }: { catches: Catch[]; onChange: () => void }) {
  const [filter, setFilter] = useState('');
  const species = [...new Set(catches.map((c) => c.species))];
  const shown = filter ? catches.filter((c) => c.species === filter) : catches;

  async function remove(c: Catch) {
    if (!confirm(`Ta bort ${c.species}?`)) return;
    await api.deleteCatch(c.id);
    onChange();
  }

  return (
    <div className="page">
      <h2>Mina fångster</h2>
      {species.length > 1 && (
        <div className="chips scroll">
          <button className={!filter ? 'chip on' : 'chip'} onClick={() => setFilter('')}>Alla</button>
          {species.map((s) => <button key={s} className={filter === s ? 'chip on' : 'chip'} onClick={() => setFilter(s)}>{s}</button>)}
        </div>
      )}
      {shown.length === 0 && <div className="card empty">Inga fångster än. Dags att kasta ut! 🎣</div>}
      {shown.map((c) => (
        <article key={c.id} className="card catch">
          {c.has_photo && <img src={`/api/catches/${c.id}/photo`} alt={c.species} loading="lazy" />}
          <div className="catch-body">
            <div className="catch-head">
              <h3>{c.species}</h3>
              <button className="ghost" onClick={() => remove(c)} aria-label="Ta bort">🗑️</button>
            </div>
            <p className="muted small">
              {new Date(c.caught_at).toLocaleString('sv-SE', { dateStyle: 'medium', timeStyle: 'short' })}
              {c.lake_name && ` · ${c.lake_name}`}
            </p>
            <div className="badges">
              {c.length_cm != null && <span>📏 {c.length_cm} cm</span>}
              {c.weight_g != null && <span>⚖️ {c.weight_g} g</span>}
              {c.lure && <span>🪝 {c.lure}</span>}
              {c.weather && <span>{describeWeather(c.weather.code).icon} {Math.round(c.weather.temp)}° · {c.weather.wind.toFixed(0)} m/s</span>}
            </div>
            {c.note && <p className="note">{c.note}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}
