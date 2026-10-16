import { useState } from 'react';
import type { User } from '../lib/api';
import { loginWithPasskey, passkeysSupported, registerWithPasskey } from '../lib/auth';

export function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'login' | 'new'>('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function run(fn: () => Promise<User>) {
    setBusy(true); setErr('');
    try { onLogin(await fn()); }
    catch (e) {
      const m = (e as Error).name === 'NotAllowedError' ? 'Avbröt du? Försök igen.' : (e as Error).message;
      setErr(m);
    } finally { setBusy(false); }
  }

  return (
    <div className="login">
      <div className="logo">🐟</div>
      <h1>Fiskeapp</h1>
      <p className="muted">Pinna fångsten. Hitta tillbaka. Bli bättre.</p>

      {!passkeysSupported() && <p className="error">Din webbläsare stöder inte passkeys. Prova Safari, Chrome eller Edge.</p>}

      {mode === 'login' ? (
        <>
          <button className="big" disabled={busy} onClick={() => run(loginWithPasskey)}>
            🔐 Logga in med Face ID / fingeravtryck
          </button>
          <button className="link" onClick={() => setMode('new')}>Ny här? Skapa konto</button>
        </>
      ) : (
        <>
          <input placeholder="Välj ett smeknamn" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button className="big" disabled={busy || !name.trim()} onClick={() => run(() => registerWithPasskey(name.trim()))}>
            ✨ Skapa konto – inget lösenord
          </button>
          <button className="link" onClick={() => setMode('login')}>Jag har redan konto</button>
        </>
      )}
      {err && <p className="error">{err}</p>}
      <p className="tiny muted">Ingen e-post, inga lösenord. Du låser upp med telefonens Face ID, fingeravtryck eller Windows Hello.</p>
    </div>
  );
}
