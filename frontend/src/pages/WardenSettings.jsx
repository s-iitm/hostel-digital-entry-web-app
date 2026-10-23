import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { getPosition } from '../utils.js';

export default function WardenSettings() {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/warden/hostel').then(({ hostel: h }) =>
      setF({
        name: h.name, address: h.address, latitude: String(h.latitude), longitude: String(h.longitude),
        geofenceRadiusM: String(h.geofence_radius_m), gateClosureTime: h.gate_closure_time,
        outTime: h.out_time || '06:00', inTime: h.in_time || '20:30',
      })
    ).catch((e) => setMsg({ kind: 'error', text: e.message }));
  }, []);

  if (!f) return <p className="muted pad">{msg?.text || 'Loading…'}</p>;
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function useMyLocation() {
    setMsg(null);
    try {
      const p = await getPosition();
      setF((s) => ({ ...s, latitude: p.latitude.toFixed(6), longitude: p.longitude.toFixed(6) }));
      setMsg({ kind: 'ok', text: `Location filled in (accurate to about ${Math.round(p.accuracy)} m). Save to apply.` });
    } catch (e) {
      setMsg({ kind: 'error', text: e.message });
    }
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await api.put('/warden/hostel', {
        name: f.name, address: f.address, latitude: Number(f.latitude), longitude: Number(f.longitude),
        geofenceRadiusM: Number(f.geofenceRadiusM), gateClosureTime: f.gateClosureTime, outTime: f.outTime, inTime: f.inTime,
      });
      setMsg({ kind: 'ok', text: 'Settings saved.' });
    } catch (err) {
      setMsg({ kind: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack narrow" onSubmit={save}>
      <h2>Hostel settings</h2>
      <label className="field"><span>Hostel name</span><input value={f.name} onChange={set('name')} required /></label>
      <label className="field"><span>Address</span><input value={f.address} onChange={set('address')} required /></label>

      <fieldset>
        <legend>Entry location</legend>
        <p className="muted small">Students can mark entry only when their phone is within the radius of this point. Stand at the hostel gate and use your current location.</p>
        <div className="grid2">
          <label className="field"><span>Latitude</span><input type="number" step="any" value={f.latitude} onChange={set('latitude')} required /></label>
          <label className="field"><span>Longitude</span><input type="number" step="any" value={f.longitude} onChange={set('longitude')} required /></label>
          <label className="field"><span>Radius (metres)</span><input type="number" min="20" max="5000" value={f.geofenceRadiusM} onChange={set('geofenceRadiusM')} required /></label>
        </div>
        <button type="button" className="btn" onClick={useMyLocation}>Use my current location</button>
      </fieldset>

      <fieldset>
        <legend>Daily timings</legend>
        <div className="grid3">
          <label className="field"><span>Exits open from</span><input type="time" value={f.outTime} onChange={set('outTime')} required /></label>
          <label className="field"><span>Reminders start at</span><input type="time" value={f.inTime} onChange={set('inTime')} required /></label>
          <label className="field"><span>Gate closes at</span><input type="time" value={f.gateClosureTime} onChange={set('gateClosureTime')} required /></label>
        </div>
        <p className="muted small">At gate closure, you get an alert listing every student who has not marked entry.</p>
      </fieldset>

      {msg && <p className={`msg ${msg.kind}`} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}
      <div><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button></div>
    </form>
  );
}
