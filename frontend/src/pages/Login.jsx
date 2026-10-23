import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

const MODES = [
  { id: 'student', label: 'Student' },
  { id: 'warden', label: 'Warden' },
  { id: 'register', label: 'New student' },
];

export default function Login() {
  const [mode, setMode] = useState('student');
  return (
    <div className="login">
      <section className="login-hero" aria-hidden="true">
        <div className="gate-art">
          <span className="gate-art-ring" />
          <span className="gate-art-dot" />
        </div>
        <h1>Hostel Gate</h1>
        <p>Mark when you leave. Mark when you are back. The warden sees who is still out.</p>
      </section>
      <section className="login-card">
        <div className="seg" role="tablist" aria-label="Account">
          {MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} className={mode === m.id ? 'on' : ''} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        {mode === 'register' ? <RegisterForm /> : <SignInForm key={mode} role={mode} />}
        {mode === 'warden' && <WardenRegister />}
      </section>
    </div>
  );
}

function SignInForm({ role }) {
  const { accept } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      accept(await api.post('/auth/login', { role, identifier, password }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field">
        <span>{role === 'student' ? 'MIS number' : 'Warden username'}</span>
        <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" inputMode={role === 'student' ? 'numeric' : 'text'} required />
      </label>
      <label className="field">
        <span>Password</span>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      </label>
      {error && <p className="msg error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function useHostels() {
  const [hostels, setHostels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/auth/hostels')
      .then((r) => {
        const list = Array.isArray(r) ? r : r?.hostels ?? [];
        setHostels(list);
      })
      .catch((err) => {
        console.error('hostels fetch failed:', err);
        setError(err.message || 'Could not load hostels');
      })
      .finally(() => setLoading(false));
  }, []);

  return { hostels, loading, error };
}

function HostelSelect({ value, onChange, hostels, loading, error, label = 'Hostel' }) {
  const placeholder = loading
    ? 'Loading hostels…'
    : hostels.length
      ? 'Select your hostel'
      : 'No hostels available';

  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={onChange} required disabled={loading || !hostels.length}>
        <option value="" disabled>{placeholder}</option>
        {hostels.map((h) => (
          <option key={h.id} value={String(h.id)}>{h.name}</option>
        ))}
      </select>
      {error && <small className="msg error">{error}</small>}
    </label>
  );
}

function RegisterForm() {
  const { accept } = useAuth();
  const { hostels, loading, error: hostelsError } = useHostels();
  const [f, setF] = useState({ mis: '', name: '', class: '', room: '', homeAddress: '', admissionDate: '', phoneNo: '', parentsPhoneNo: '', hostelId: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  useEffect(() => {
    if (hostels.length === 1) setF((s) => ({ ...s, hostelId: String(hostels[0].id) }));
  }, [hostels]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      accept(await api.post('/auth/register', { ...f, hostelId: Number(f.hostelId) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack">
      <div className="grid2">
        <label className="field"><span>MIS number</span><input value={f.mis} onChange={set('mis')} required /></label>
        <label className="field"><span>Full name</span><input value={f.name} onChange={set('name')} autoComplete="name" required /></label>
        <label className="field"><span>Class</span><input value={f.class} onChange={set('class')} placeholder="TY CSE" required /></label>
        <label className="field"><span>Room</span><input value={f.room} onChange={set('room')} placeholder="A-101" required /></label>
      </div>
      <label className="field"><span>Home address</span><input value={f.homeAddress} onChange={set('homeAddress')} autoComplete="street-address" required /></label>
      <div className="grid2">
        <label className="field"><span>Admission date</span><input type="date" value={f.admissionDate} onChange={set('admissionDate')} required /></label>
        <HostelSelect value={f.hostelId} onChange={set('hostelId')} hostels={hostels} loading={loading} error={hostelsError} />
        <label className="field"><span>Your phone</span><input value={f.phoneNo} onChange={set('phoneNo')} inputMode="tel" autoComplete="tel" required /><small>Separate several numbers with commas.</small></label>
        <label className="field"><span>Parent’s phone</span><input value={f.parentsPhoneNo} onChange={set('parentsPhoneNo')} inputMode="tel" required /></label>
      </div>
      <label className="field"><span>Password</span><input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" minLength={6} required /><small>At least 6 characters.</small></label>
      {error && <p className="msg error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
    </form>
  );
}

function WardenRegister() {
  const { accept } = useAuth();
  const { hostels, loading, error: hostelsError } = useHostels();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ inviteCode: '', username: '', name: '', mobileNo: '', hostelId: '', password: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      accept(await api.post('/auth/register-warden', { ...f, hostelId: Number(f.hostelId) }));
    } catch (err) {
      setError(err.message);
    }
  }

  if (!open) return <button className="btn link" onClick={() => setOpen(true)}>New warden? Register with an invite code</button>;
  return (
    <form onSubmit={submit} className="stack sub">
      <h2>Register as warden</h2>
      <div className="grid2">
        <label className="field"><span>Invite code</span><input value={f.inviteCode} onChange={set('inviteCode')} required /></label>
        <label className="field"><span>Username</span><input value={f.username} onChange={set('username')} required /></label>
        <label className="field"><span>Full name</span><input value={f.name} onChange={set('name')} required /></label>
        <label className="field"><span>Mobile</span><input value={f.mobileNo} onChange={set('mobileNo')} inputMode="tel" required /></label>
        <HostelSelect value={f.hostelId} onChange={set('hostelId')} hostels={hostels} loading={loading} error={hostelsError} />
        <label className="field"><span>Password</span><input type="password" value={f.password} onChange={set('password')} minLength={8} required /></label>
      </div>
      {error && <p className="msg error" role="alert">{error}</p>}
      <button className="btn">Register warden</button>
    </form>
  );
}