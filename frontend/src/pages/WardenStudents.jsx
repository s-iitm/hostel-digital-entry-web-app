import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from '../utils.js';
import { PhoneLinks } from './WardenOverview.jsx';

const EMPTY = { mis: '', name: '', class: '', room: '', homeAddress: '', admissionDate: '', phoneNo: '', parentsPhoneNo: '', password: '' };

export default function WardenStudents() {
  const [students, setStudents] = useState([]);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [msg, setMsg] = useState(null);

  const load = useCallback(() => api.get('/warden/students').then((r) => setStudents(r.students)).catch((e) => setMsg({ kind: 'error', text: e.message })), []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((s) => ({ ...s, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/warden/students', form);
      setMsg({ kind: 'ok', text: `Added ${form.name}. Share the temporary password with them.` });
      setForm(EMPTY);
      setAdding(false);
      load();
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  async function reset(s) {
    const password = window.prompt(`New temporary password for ${s.name} (minimum 6 characters):`);
    if (!password) return;
    try {
      await api.post(`/warden/students/${encodeURIComponent(s.mis)}/reset-password`, { password });
      setMsg({ kind: 'ok', text: `Password reset for ${s.name}.` });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    }
  }

  const shown = students.filter((s) => `${s.name} ${s.mis} ${s.room}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="stack-lg">
      {msg && <p className={`msg ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
      <div className="toolbar">
        <label className="field grow"><span>Search</span><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, MIS or room" /></label>
        <button className="btn primary" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : 'Add student'}</button>
      </div>

      {adding && (
        <form className="card stack" onSubmit={add}>
          <h2>New student</h2>
          <div className="grid3">
            <label className="field"><span>MIS number</span><input value={form.mis} onChange={set('mis')} required /></label>
            <label className="field"><span>Full name</span><input value={form.name} onChange={set('name')} required /></label>
            <label className="field"><span>Class</span><input value={form.class} onChange={set('class')} required /></label>
            <label className="field"><span>Room</span><input value={form.room} onChange={set('room')} required /></label>
            <label className="field"><span>Admission date</span><input type="date" value={form.admissionDate} onChange={set('admissionDate')} required /></label>
            <label className="field"><span>Temporary password</span><input value={form.password} onChange={set('password')} minLength={6} required /></label>
            <label className="field"><span>Student phone</span><input value={form.phoneNo} onChange={set('phoneNo')} inputMode="tel" required /></label>
            <label className="field"><span>Parent phone</span><input value={form.parentsPhoneNo} onChange={set('parentsPhoneNo')} inputMode="tel" required /></label>
            <label className="field"><span>Home address</span><input value={form.homeAddress} onChange={set('homeAddress')} required /></label>
          </div>
          <div><button className="btn primary">Save student</button></div>
        </form>
      )}

      <section className="card">
        <div className="card-head"><h2>Students</h2><span className="muted small">{shown.length} of {students.length}</span></div>
        {shown.length === 0 ? (
          <p className="muted">No students match your search.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Name</th><th>Class</th><th>Room</th><th>Phone</th><th>Parent phone</th><th>Admitted</th><th>Now</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.mis}>
                    <td><strong>{s.name}</strong><br /><small className="muted">MIS {s.mis}</small></td>
                    <td>{s.class}</td>
                    <td>{s.room}</td>
                    <td><PhoneLinks list={s.phone_no} /></td>
                    <td><PhoneLinks list={s.parents_phone_no} /></td>
                    <td>{fmtDate(s.admission_date)}</td>
                    <td><span className={`pill ${s.is_outside ? 'warn' : 'ok'}`}>{s.is_outside ? 'Outside' : 'In'}</span></td>
                    <td><button className="btn small" onClick={() => reset(s)}>Reset password</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
