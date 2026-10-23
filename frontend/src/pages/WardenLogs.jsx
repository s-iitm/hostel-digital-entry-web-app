import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate, fmtTime } from '../utils.js';

const PAGE = 50;

export default function WardenLogs() {
  const [filters, setFilters] = useState({ from: '', to: '', status: '', q: '' });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ logs: [], total: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const qs = (f, extra = {}) => {
    const p = new URLSearchParams();
    Object.entries({ ...f, ...extra }).forEach(([k, v]) => v !== '' && v !== undefined && p.set(k, v));
    return p.toString();
  };

  useEffect(() => {
    setLoading(true);
    api
      .get(`/warden/logs?${qs(applied, { limit: PAGE, offset: page * PAGE })}`)
      .then((r) => { setData(r); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [applied, page]);

  const set = (k) => (e) => setFilters((s) => ({ ...s, [k]: e.target.value }));
  const submit = (e) => { e.preventDefault(); setPage(0); setApplied(filters); };

  async function exportCsv() {
    try {
      const res = await api.raw(`/warden/logs.csv?${qs(applied)}`);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: 'entry-exit-logs.csv' });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    }
  }

  const pages = Math.max(1, Math.ceil(data.total / PAGE));

  return (
    <div className="stack-lg">
      <form className="card filters" onSubmit={submit}>
        <label className="field"><span>From</span><input type="date" value={filters.from} onChange={set('from')} /></label>
        <label className="field"><span>To</span><input type="date" value={filters.to} onChange={set('to')} /></label>
        <label className="field">
          <span>Status</span>
          <select value={filters.status} onChange={set('status')}>
            <option value="">All</option>
            <option value="OUT">Outside</option>
            <option value="IN">Returned</option>
          </select>
        </label>
        <label className="field grow"><span>Name or MIS</span><input value={filters.q} onChange={set('q')} placeholder="Search students" /></label>
        <button className="btn primary">Apply filters</button>
        <button type="button" className="btn" onClick={exportCsv}>Download CSV</button>
      </form>

      {error && <p className="msg error" role="alert">{error}</p>}

      <section className="card">
        <div className="card-head">
          <h2>Entry and exit log</h2>
          <span className="muted small">{data.total} records</span>
        </div>
        {!loading && data.logs.length === 0 ? (
          <p className="muted">No records match these filters. Clear the dates or search to see more.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Student</th><th>Class</th><th>Room</th><th>Exit</th><th>Entry</th><th>Status</th></tr></thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id}>
                    <td>{fmtDate(l.log_date)}</td>
                    <td><strong>{l.name}</strong><br /><small className="muted">MIS {l.mis}</small></td>
                    <td>{l.class}</td>
                    <td>{l.room}</td>
                    <td>{fmtTime(l.exit_time)}</td>
                    <td>{l.entry_time ? fmtTime(l.entry_time) : '—'}</td>
                    <td><span className={`pill ${l.status === 'IN' ? 'ok' : 'warn'}`}>{l.status === 'IN' ? 'Returned' : 'Outside'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="pager">
            <button className="btn small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className="muted small">Page {page + 1} of {pages}</span>
            <button className="btn small" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </section>
    </div>
  );
}
