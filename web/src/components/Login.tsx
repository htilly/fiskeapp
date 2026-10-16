import { useState } from 'react';
import type { User } from '../lib/api';
import { enrollWithToken, loginWithPasskey, passkeysSupported, registerWithPasskey, type Enrolled } from '../lib/auth';

export function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  return (
    <div className="login">
      <div className="logo">🔑</div>
      <h1>Spara din kod</h1>
      <p className="muted">Med den här koden kommer du in igen om du tappar alla dina enheter. Den visas bara nu.</p>
      <div className="card recovery">{code}</div>
      <button className="link" onClick={() => navigator.clipboard?.writeText(code)}>Kopiera</button>
      <button className="big" onClick={onDone}>Jag har sparat den</button>
    </div>
  );
}

export function Login({ onLogin, inviteToken }: { onLogin: (u: User) => void; inviteToken?: string | null }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'login' | 'new' | 'code'>('login');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pending, setPending] = useState<Enrolled | null>(null);

  async function run(fn: () => Promise<Enrolled>) {
    setBusy(true); setErr('');
    try {
      const u = await fn();
      if (inviteToken) history.replaceState(null, '', location.pathname);
      if (u.recoveryCode) setPending(u); else onLogin(u);
    } catch (e) {
      const m = (e as Error).name === 'NotAllowedError' ? 'Avbröt du? Försök igen.' : (e as Error).message;
      setErr(m);
    } finally { setBusy(false); }
  }

  if (pending?.recoveryCode) return <RecoveryCode code={pending.recoveryCode} onDone={() => onLogin(pending)} />;

  return (
    <div className="login">
      <div className="logo">🐟</div>
      <h1>Fiskeapp</h1>
      <p className="muted">Pinna fångsten. Hitta tillbaka. Bli bättre.</p>

      {!passkeysSupported() && <p className="error">Din webbläsare stöder inte passkeys. Prova Safari, Chrome eller Edge.</p>}

      {inviteToken ? (
        <>
          <p>Du har bjudits in att lägga till den här enheten på ditt konto.</p>
          <button className="big" disabled={busy} onClick={() => run(() => enrollWithToken(inviteToken))}>
            📲 Lägg till den här enheten
          </button>
          <button className="link" onClick={() => { history.replaceState(null, '', location.pathname); location.reload(); }}>Avbryt</button>
        </>
      ) : mode === 'login' ? (
        <>
          <button className="big" disabled={busy} onClick={() => run(loginWithPasskey)}>
            🔐 Logga in med Face ID / fingeravtryck
          </button>
          <button className="link" onClick={() => setMode('new')}>Ny här? Skapa konto</button>
          <button className="link" onClick={() => setMode('code')}>Ny enhet eller tappad telefon? Använd kod</button>
        </>
      ) : mode === 'new' ? (
        <>
          <input placeholder="Välj ett smeknamn" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button className="big" disabled={busy || !name.trim()} onClick={() => run(() => registerWithPasskey(name.trim()))}>
            ✨ Skapa konto – inget lösenord
          </button>
          <button className="link" onClick={() => setMode('login')}>Jag har redan konto</button>
        </>
      ) : (
        <>
          <p className="muted small">Skriv din återställningskod, eller koden från "Lägg till enhet" på en enhet där du redan är inloggad.</p>
          <input placeholder="XXXX-XXXX-XXXX-XXXX" value={code} autoCapitalize="characters" autoCorrect="off"
            onChange={(e) => setCode(e.target.value)} />
          <button className="big" disabled={busy || code.replace(/[^a-z0-9]/gi, '').length < 16} onClick={() => run(() => enrollWithToken(code))}>
            🔑 Lägg till den här enheten
          </button>
          <button className="link" onClick={() => setMode('login')}>Tillbaka</button>
        </>
      )}
      {err && <p className="error">{err}</p>}
      <p className="tiny muted">Ingen e-post, inga lösenord. Du låser upp med telefonens Face ID (iPhone) eller fingeravtryck/ansiktslås/skärmlås (Android), eller Windows Hello.</p>
    </div>
  );
}
