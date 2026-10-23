import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { distanceMeters, fmtClock, fmtDate, fmtTime, getPosition } from '../utils.js';

export default function StudentHome() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: 'ok' | 'error', text }
  const [distance, setDistance] = useState(null);
  const [notifPerm, setNotifPerm] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const notifiedFor = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get('/student/status'));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  // While outside, quietly measure the distance to the hostel so the student knows if entry will be accepted.
  const isOut = data?.state === 'OUT';
  useEffect(() => {
    if (!isOut || !data) return;
    let cancelled = false;
    getPosition()
      .then((p) => { if (!cancelled) setDistance(Math.round(distanceMeters(p.latitude, p.longitude, data.hostel.latitude, data.hostel.longitude))); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isOut, data?.hostel?.latitude, data?.hostel?.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reminder from the app itself: a system notification once per open entry.
  useEffect(() => {
    const id = data?.openLog?.id;
    if (data?.reminderDue && id && notifiedFor.current !== id && notifPerm === 'granted') {
      notifiedFor.current = id;
      new Notification('Mark your entry', { body: 'You are still marked as out. Close your entry when you reach the hostel.' });
    }
  }, [data, notifPerm]);

  async function act(kind) {
    setBusy(true);
    setNotice(null);
    try {
      const pos = await getPosition();
      const res = await api.post(`/student/${kind}`, { latitude: pos.latitude, longitude: pos.longitude, accuracy: pos.accuracy });
      if (kind === 'exit') setNotice({ kind: 'ok', text: 'Exit marked. Remember to mark your entry when you are back.' });
      else setNotice({ kind: 'ok', text: res.late ? 'Entry marked. You returned after gate closure and the warden has been told.' : 'Entry marked. Welcome back.' });
      setDistance(null);
      await load();
    } catch (e) {
      setNotice({ kind: 'error', text: e.message });
      if (e.data?.distanceM) setDistance(e.data.distanceM);
      if (e.status === 409) load();
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="muted pad">{error || 'Loading…'}</p>;

  const { hostel, openLog } = data;
  const inside = data.state === 'IN';
  const stateClass = !inside && data.overdue ? 'overdue' : inside ? 'in' : 'out';
  const label = inside ? 'Mark exit' : 'Mark entry';
  const disabled = busy || (inside && !data.canExit);

  return (
    <div className="student">
      {data.reminderDue && !inside && (
        <div className="banner" role="status">
          {data.overdue ? 'Gate has closed and you are still marked as out. Mark your entry as soon as you reach the hostel.' : 'Time to head back. Mark your entry when you reach the hostel.'}
        </div>
      )}

      <section className={`gate ${stateClass}`} aria-live="polite">
        <p className="gate-state">{inside ? 'You are in the hostel' : `You are out${openLog ? ` since ${fmtTime(openLog.exit_time)}` : ''}`}</p>
        <button className="gate-btn" onClick={() => act(inside ? 'exit' : 'entry')} disabled={disabled} aria-label={label}>
          <span className="gate-btn-ring" />
          <span className="gate-btn-text">{busy ? 'Checking location…' : label}</span>
        </button>
        <p className="gate-sub">
          {inside && !data.canExit
            ? `Exits open between ${fmtClock(hostel.outTime)} and ${fmtClock(hostel.gateClosureTime)}.`
            : !inside && distance !== null
            ? distance <= hostel.geofenceRadiusM
              ? `You are at the hostel (${distance} m away). You can mark your entry.`
              : `You are ${distance} m from the hostel. Entry works within ${hostel.geofenceRadiusM} m.`
            : inside
            ? `Gate closes at ${fmtClock(hostel.gateClosureTime)}.`
            : `Entry only works at the hostel, within ${hostel.geofenceRadiusM} m.`}
        </p>
        {notice && <p className={`msg ${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.text}</p>}
      </section>

      {notifPerm === 'default' && (
        <button className="btn link" onClick={() => Notification.requestPermission().then(setNotifPerm)}>
          Turn on reminders for this device
        </button>
      )}

      <section className="card">
        <h2>Recent movements</h2>
        {data.recent.length === 0 ? (
          <p className="muted">No movements yet. Mark an exit when you leave the hostel.</p>
        ) : (
          <ul className="timeline">
            {data.recent.map((l) => (
              <li key={l.id} className={l.status === 'OUT' ? 'open' : ''}>
                <span className="t-date">{fmtDate(l.log_date)}</span>
                <span className="t-range">
                  {fmtTime(l.exit_time)} <i aria-hidden="true">to</i> <span className="sr-only">to</span>{l.entry_time ? fmtTime(l.entry_time) : 'not back yet'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="muted small center">{hostel.name} · {hostel.address}</p>
    </div>
  );
}
