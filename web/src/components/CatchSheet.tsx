import { useState } from 'react';
import { api, type Weather } from '../lib/api';
import { shrinkImage } from '../lib/image';
import type { Spot } from '../App';

const SPECIES = ['Abborre', 'Gädda', 'Gös', 'Öring', 'Regnbåge', 'Mört', 'Braxen', 'Lax', 'Torsk', 'Makrill'];

type Props = { spot: Spot; lake: string | null; weather: Weather | null; onClose: () => void; onSaved: () => void };

export function CatchSheet({ spot, lake, weather, onClose, onSaved }: Props) {
  const [species, setSpecies] = useState('');
  const [length, setLength] = useState('');
  const [weight, setWeight] = useState('');
  const [lure, setLure] = useState('');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setBusy(true); setErr('');
    try {
      const c = await api.addCatch({
        ...spot, species: species.trim(), caught_at: new Date().toISOString(),
        length_cm: length ? Number(length) : null, weight_g: weight ? Number(weight) : null,
        lure: lure.trim() || null, note: note.trim() || null, lake_name: lake, weather,
      } as never);
      if (photo) await api.uploadPhoto(c.id, await shrinkImage(photo)).catch(() => setErr('Bilden sparades inte'));
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>🎣 Ny fångst</h3>
        <p className="muted small">{lake ?? 'Okänd plats'} · {spot.lat.toFixed(4)}, {spot.lng.toFixed(4)}</p>

        <div className="chips">
          {SPECIES.map((s) => (
            <button key={s} className={species === s ? 'chip on' : 'chip'} onClick={() => setSpecies(s)}>{s}</button>
          ))}
        </div>
        <input placeholder="…eller skriv art" value={species} onChange={(e) => setSpecies(e.target.value)} />
        <div className="row">
          <input type="number" inputMode="decimal" placeholder="Längd (cm)" value={length} onChange={(e) => setLength(e.target.value)} />
          <input type="number" inputMode="decimal" placeholder="Vikt (g)" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <input placeholder="Drag / bete (t.ex. gul jigg 10 g)" value={lure} onChange={(e) => setLure(e.target.value)} />
        <input placeholder="Anteckning" value={note} onChange={(e) => setNote(e.target.value)} />
        <label className="file">
          {photo ? `📸 ${photo.name}` : '📸 Lägg till bild'}
          <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
        {err && <p className="error">{err}</p>}
        <button className="big" disabled={busy || !species.trim()} onClick={save}>{busy ? 'Sparar…' : 'Spara fångst'}</button>
        <p className="tiny muted">🔒 Bara du ser den här fångsten.</p>
      </div>
    </div>
  );
}
