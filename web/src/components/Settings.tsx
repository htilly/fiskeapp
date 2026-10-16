import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import type { Device } from '../lib/auth';

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '–');

export function Settings({ onClose }: { onClose: () => void }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [invite, setInvite] = useState<{ link: string; qr: string; expiresAt: number } | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState('');

  const load = useCallback(() => api.get<Device[]>('/api/auth/devices').then(setDevices).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!invite) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [invite]);

  const guard = (fn: () => Promise<void>) => async () => { setErr(''); try { await fn(); } catch (e) { setErr((e as Error).message); } };

  const createInvite = guard(async () => {
    const { token, expiresAt } = await api.post<{ token: string; expiresAt: number }>('/api/auth/devices/invite');
    const link = `${location.origin}/?add=${token}`;
    setInvite({ link, expiresAt, qr: await QRCode.toDataURL(link, { margin: 1, width: 240 }) });
  });
  const newRecovery = guard(async () => {
    if (!confirm('Den gamla återställningskoden slutar fungera. Fortsätta?')) return;
    setRecovery((await api.post<{ recoveryCode: string }>('/api/auth/recovery')).recoveryCode);
  });
  const rename = (d: Device) => guard(async () => {
    const label = prompt('Namn på enheten', d.label ?? '')?.trim();
    if (label) { await api.patch(`/api/auth/devices/${encodeURIComponent(d.id)}`, { label }); await load(); }
  })();
  const remove = (d: Device) => guard(async () => {
    if (!confirm(`Ta bort "${d.label ?? 'enheten'}"? Den kan inte logga in längre.`)) return;
    await api.del(`/api/auth/devices/${encodeURIComponent(d.id)}`);
    await load();
  })();
  const share = () => invite && (navigator.share
    ? navigator.share({ title: 'Fiskeapp', url: invite.link }).catch(() => {})
    : navigator.clipboard?.writeText(invite.link));

  const left = invite ? Math.max(0, Math.round((invite.expiresAt - now) / 1000)) : 0;

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h3>Enheter</h3>
        {devices.map((d) => (
          <div className="card device" key={d.id}>
            <div><b>{d.label ?? 'Enhet'}</b><span className="muted small"> Tillagd {fmt(d.created_at)} · Senast {fmt(d.last_used_at)}</span></div>
            <button className="ghost" onClick={() => rename(d)} aria-label="Byt namn">✏️</button>
            <button className="ghost" disabled={devices.length < 2} onClick={() => remove(d)} aria-label="Ta bort">🗑️</button>
          </div>
        ))}

        {invite && left > 0 ? (
          <div className="card invite">
            <p className="muted small">Öppna länken eller skanna koden på den nya enheten. Gäller i {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}, en enda gång.</p>
            <img src={invite.qr} alt="QR-kod" width={200} height={200} />
            <button className="link" onClick={share}>{'share' in navigator ? 'Dela länk' : 'Kopiera länk'}</button>
          </div>
        ) : (
          <button className="big" onClick={createInvite}>📲 Lägg till enhet</button>
        )}

        <h3>Återställning</h3>
        {recovery ? (
          <div className="card"><p className="muted small">Spara koden. Den visas bara nu.</p><div className="recovery">{recovery}</div></div>
        ) : (
          <button className="link" onClick={newRecovery}>Skapa ny återställningskod</button>
        )}
        {err && <p className="error">{err}</p>}
      </div>
    </div>
  );
}
