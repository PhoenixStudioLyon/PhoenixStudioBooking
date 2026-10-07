import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ hasUsers, settings, onDone }) {
  const [f, setF] = useState({ name: '', email: '', password: '', businessName: settings?.businessName || '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const setup = !hasUsers;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const { user } = setup ? await api.setup(f) : await api.login(f);
      onDone(user);
    } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand"><span className="brand-mark">P</span>{settings?.businessName || 'Phoenix Studio'}</div>
        <h1>{setup ? 'Create your account' : 'Log in'}</h1>
        <p className="muted">{setup ? 'First time here — set up the owner login for your studio.' : 'Welcome back. Log in to manage your bookings.'}</p>
        {setup && <>
          <label className="field"><span className="lbl">Your name</span><input className="input" value={f.name} onChange={set('name')} required /></label>
          <label className="field"><span className="lbl">Business name</span><input className="input" value={f.businessName} onChange={set('businessName')} /></label>
        </>}
        <label className="field"><span className="lbl">Email or ID</span>
          <input className="input" type="text" autoCapitalize="none" spellCheck={false} autoComplete="username" value={f.email} onChange={set('email')} required /></label>
        <label className="field"><span className="lbl">Password</span>
          <input className="input" type="password" autoComplete={setup ? 'new-password' : 'current-password'} minLength={setup ? 8 : undefined}
            value={f.password} onChange={set('password')} required /></label>
        {err && <div className="form-error">{err}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Please wait…' : setup ? 'Create account' : 'Log in'}</button>
      </form>
    </div>
  );
}
