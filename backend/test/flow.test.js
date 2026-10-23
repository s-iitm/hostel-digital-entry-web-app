// End-to-end API test. Requires a running API (API_URL) and a seeded database (npm run db:seed).
// Run:  API_URL=http://localhost:4000 npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAlertSweep } from '../src/services/alerts.js';
import { pool } from '../src/db/index.js';

const API = process.env.API_URL || 'http://localhost:4000';
const HOSTEL = { latitude: 18.5293, longitude: 73.8566 };
const FAR = { latitude: 18.55, longitude: 73.9 }; // several km away

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

const login = async (role, identifier, password) => (await call('POST', '/api/auth/login', { body: { role, identifier, password } })).body;

test.after(() => pool.end());

test('full student + warden flow', async () => {
  const MIS = 'T' + Date.now().toString().slice(-8);

  // --- registration + login
  const hostels = (await call('GET', '/api/auth/hostels')).body.hostels;
  assert.ok(hostels.length >= 1);
  const reg = await call('POST', '/api/auth/register', {
    body: { mis: MIS, name: 'Test Student', class: 'TY CSE', room: 'Z-1', homeAddress: '12 Some Road, Pune', admissionDate: '2024-08-01',
            phoneNo: '9000012345', parentsPhoneNo: '9000054321, 9000054322', hostelId: hostels[0].id, password: 'secret123' },
  });
  assert.equal(reg.status, 201);
  assert.equal((await call('POST', '/api/auth/register', { body: { ...reg.body, mis: MIS } })).status, 400); // malformed
  assert.equal((await call('POST', '/api/auth/login', { body: { role: 'student', identifier: MIS, password: 'wrong' } })).status, 401);
  const s = await login('student', MIS, 'secret123');
  assert.ok(s.token);

  // --- role separation
  assert.equal((await call('GET', '/api/warden/dashboard', { token: s.token })).status, 403);
  assert.equal((await call('GET', '/api/student/status')).status, 401);

  // --- warden: widen the exit window so the test can run at any hour, reset any leftovers
  const w = await login('warden', 'warden1', 'warden123');
  const hostel = (await call('GET', '/api/warden/hostel', { token: w.token })).body.hostel;
  const put = (over) =>
    call('PUT', '/api/warden/hostel', {
      token: w.token,
      body: { name: hostel.name, address: hostel.address, latitude: hostel.latitude, longitude: hostel.longitude,
              geofenceRadiusM: hostel.geofence_radius_m, gateClosureTime: '23:59', outTime: '00:00', inTime: '23:30', ...over },
    });
  assert.equal((await put({})).status, 200);
  assert.equal((await put({ inTime: '23:59', gateClosureTime: '22:00' })).status, 400); // in after closure

  // --- exit
  let st = (await call('GET', '/api/student/status', { token: s.token })).body;
  assert.equal(st.state, 'IN');
  assert.equal(st.canExit, true);
  const ex = await call('POST', '/api/student/exit', { token: s.token, body: HOSTEL });
  assert.equal(ex.status, 201);
  assert.equal((await call('POST', '/api/student/exit', { token: s.token, body: HOSTEL })).status, 409); // double exit blocked
  st = (await call('GET', '/api/student/status', { token: s.token })).body;
  assert.equal(st.state, 'OUT');

  // --- warden sees the student outside
  let outside = (await call('GET', '/api/warden/outside', { token: w.token })).body.students;
  const row = outside.find((x) => x.mis === MIS);
  assert.ok(row);
  assert.equal(row.overdue, false);
  assert.deepEqual(row.parents_phone_no, ['9000054321', '9000054322']);

  // --- geofence: far away is rejected, bad accuracy is rejected, at hostel works
  const far = await call('POST', '/api/student/entry', { token: s.token, body: FAR });
  assert.equal(far.status, 403);
  assert.equal(far.body.code, 'OUTSIDE_GEOFENCE');
  const fuzzy = await call('POST', '/api/student/entry', { token: s.token, body: { ...HOSTEL, accuracy: 900 } });
  assert.equal(fuzzy.status, 422);

  // --- 9 PM behaviour: move gate closure into the past → sweep creates an alert for each warden
  assert.equal((await put({ outTime: '00:00', inTime: '00:01', gateClosureTime: '00:02' })).status, 200);
  assert.equal((await call('POST', '/api/student/exit', { token: s.token, body: HOSTEL })).status, 403); // exit window closed
  await runAlertSweep();
  await runAlertSweep(); // idempotent
  const alerts = (await call('GET', '/api/warden/alerts?status=OPEN', { token: w.token })).body.alerts;
  const mine = alerts.filter((a) => a.mis === MIS && a.alert_type === 'NOT_RETURNED');
  assert.equal(mine.length, 1);
  assert.match(mine[0].message, /Test Student/);
  outside = (await call('GET', '/api/warden/outside', { token: w.token })).body.students;
  assert.equal(outside.find((x) => x.mis === MIS).overdue, true);
  st = (await call('GET', '/api/student/status', { token: s.token })).body;
  assert.equal(st.reminderDue, true);
  assert.equal(st.overdue, true);
  assert.equal((await call('GET', '/api/warden/dashboard', { token: w.token })).body.overdue >= 1, true);

  // --- student returns (late) → alert resolved, late-return notice created
  const back = await call('POST', '/api/student/entry', { token: s.token, body: { ...HOSTEL, accuracy: 20 } });
  assert.equal(back.status, 200);
  assert.equal(back.body.late, true);
  assert.equal(back.body.log.status, 'IN');
  assert.equal((await call('POST', '/api/student/entry', { token: s.token, body: HOSTEL })).status, 409); // nothing to close
  const after = (await call('GET', '/api/warden/alerts', { token: w.token })).body.alerts.filter((a) => a.mis === MIS);
  assert.equal(after.find((a) => a.alert_type === 'NOT_RETURNED').status, 'RESOLVED');
  const late = after.find((a) => a.alert_type === 'LATE_RETURN');
  assert.ok(late);
  assert.equal((await call('PATCH', `/api/warden/alerts/${late.alert_id}/acknowledge`, { token: w.token })).status, 200);

  // --- logs, filters, CSV, students list
  const logs = (await call('GET', `/api/warden/logs?q=${MIS}`, { token: w.token })).body;
  assert.equal(logs.total, 1);
  assert.equal(logs.logs[0].status, 'IN');
  const csv = await fetch(`${API}/api/warden/logs.csv?q=${MIS}`, { headers: { Authorization: `Bearer ${w.token}` } });
  assert.match(await csv.text(), new RegExp(MIS));
  const studs = (await call('GET', '/api/warden/students', { token: w.token })).body.students;
  assert.ok(studs.find((x) => x.mis === MIS && x.is_outside === false));

  // --- warden creates a student, warden registration needs the invite code
  const created = await call('POST', '/api/warden/students', {
    token: w.token,
    body: { mis: MIS + 'W', name: 'Added By Warden', class: 'FY', room: 'Z-2', homeAddress: '34 Other Road, Pune', admissionDate: '2025-08-01',
            phoneNo: '9000099999', parentsPhoneNo: '9000088888', password: 'temp1234' },
  });
  assert.equal(created.status, 201);
  assert.equal((await login('student', MIS + 'W', 'temp1234')).user.name, 'Added By Warden');
  assert.equal((await call('POST', '/api/auth/register-warden', { body: { inviteCode: 'nope', username: 'x' + MIS, name: 'Bad Warden', mobileNo: '9000011111', hostelId: hostel.id, password: 'longenough1' } })).status, 403);

  // restore sensible settings
  assert.equal((await put({ gateClosureTime: '21:00', outTime: '06:00', inTime: '20:30' })).status, 200);
});
