
import { FormEvent, useState } from 'react';
import { supabaseBrowser } from '../lib/supabase';
import '../styles.css';

export default function StaffLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const { error: signInError } = await supabaseBrowser.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      return;
    }

    window.location.href = '/staff/kunden-management';
  };

  return (
    <div className="staff-app">
      <div className="staff-container" style={{ maxWidth: 460 }}>
        <div className="card">
          <h1>Operator Login</h1>
          <p className="note">Login mit bestehendem Supabase-Account. Zugriff nur mit Eintrag in `admin_users`.</p>
          <form onSubmit={onSubmit} className="grid">
            <div>
              <label>E-Mail</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </div>
            <div>
              <label>Passwort</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </div>
            <button type="submit">Einloggen</button>
            {error && <p className="error">{error}</p>}
          </form>
        </div>
      </div>
    </div>
  );
}
