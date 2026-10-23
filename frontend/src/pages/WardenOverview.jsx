import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate, fmtDateTime, fmtTime } from '../utils.js';

export function PhoneLinks({ list }) {
  return (
    <>
      {(list || []).map((n, i) => (
        <span key={n}>
          {i > 0 && ', '}
          <a href={`tel:${n.replace(/\s|-/g, '')}`}>{n}</a>
        </span>
      ))}
    </>
  );
}

export default function WardenOverview() {
  const [stats, setStats] = useState(null);
  const [outside, setOutside] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, o, a] = await Promise.all([api.get('/warden/dashboard'), api.get('/warden/outside'), api.get('/warden/alerts?status=OPEN')]);
      setStats(s);
      setOutside(o.students);
      setAlerts(a.alerts);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function acknowledge(id) {
    await api.patch(`/warden/alerts/${id}/acknowledge`).catch((e) => setError(e.message));
    load();
  }

  if (!stats) return <p className="muted pad">{error || 'Loading…'}</p>;
  const overdue = outside.filter((s) => s.overdue);
  const others = outside.filter((s) => !s.overdue);

  return (
    <div className="stack-lg">
      {error && <p className="msg error" role="alert">{error}</p>}
      <section className="stats" aria-label="Today at a glance">
        <Stat value={stats.outsideNow} label="Outside now" />
        <Stat value={stats.overdue} label={`Not back after ${stats.gateClosureTime}`} tone={stats.overdue ? 'danger' : ''} />
        <Stat value={stats.totalStudents - stats.outsideNow} label="In the hostel" tone="ok" />
        <Stat value={stats.movementsToday} label="Movements today" />
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Not returned</h2>
          <span className="muted small">Updates every 30 seconds</span>
        </div>
        {overdue.length === 0 ? (
          <p className="muted">{stats.outsideNow ? 'Nobody is overdue yet. Students outside now are listed below.' : 'Everyone is in the hostel.'}</p>
        ) : (
          <PeopleTable rows={overdue} />
        )}
        {others.length > 0 && (
          <>
            <h3>Outside, before gate closure</h3>
            <PeopleTable rows={others} />
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Alerts</h2>
          <span className="muted small">{alerts.length} open</span>
        </div>
        {alerts.length === 0 ? (
          <p className="muted">No open alerts. A new alert appears here when gate closure passes with students still out.</p>
        ) : (
          <ul className="alerts">
            {alerts.map((a) => (
              <li key={a.alert_id} className={a.alert_type === 'NOT_RETURNED' ? 'danger' : ''}>
                <div>
                  <strong>{a.alert_type === 'NOT_RETURNED' ? 'Not returned' : 'Returned late'}</strong>
                  <p>{a.message}</p>
                  <small className="muted">{fmtDateTime(a.alert_time)}</small>
                </div>
                <button className="btn small" onClick={() => acknowledge(a.alert_id)}>Acknowledge</button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ value, label, tone = '' }) {
  return (
    <div className={`stat ${tone}`}>
      <span className="stat-n">{value}</span>
      <span className="stat-l">{label}</span>
    </div>
  );
}

function PeopleTable({ rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>Name</th><th>Class</th><th>Room</th><th>Left at</th><th>Student phone</th><th>Parent phone</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.log_id} className={s.overdue ? 'row-danger' : ''}>
              <td><strong>{s.name}</strong><br /><small className="muted">MIS {s.mis}</small></td>
              <td>{s.class}</td>
              <td>{s.room}</td>
              <td>{fmtTime(s.exit_time)}<br /><small className="muted">{fmtDate(s.log_date)}</small></td>
              <td><PhoneLinks list={s.phone_no} /></td>
              <td><PhoneLinks list={s.parents_phone_no} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
