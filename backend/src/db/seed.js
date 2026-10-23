import bcrypt from 'bcryptjs';
import { pool } from './index.js';

// Real hostels. After seeding, go to Warden → Settings → "Use my current location" to set the actual geofence.
const hostels = [
  { name: 'COEP Girls Hostel', address: 'College of Engineering Pune, Shivajinagar, Pune',       latitude: 18.5293, longitude: 73.8566, radius: 600 },
  { name: 'PICT Girls Hostel', address: 'Pune Institute of Computer Technology, Dhankawadi, Pune', latitude: 18.4575, longitude: 73.8508, radius: 600 },
  { name: 'VJTI Girls Hostel', address: 'VJTI, Matunga, Mumbai',                                   latitude: 19.0222, longitude: 72.8561, radius: 600 },
];

const students = [
  ['612415090', 'Darshana Kulkarni', 'TY CSE', 'A-101', 'Pune', ['9000000001'], ['9100000001']],
  ['612415096', 'Shivani Mahajan', 'TY CSE', 'A-102', 'Nashik', ['9000000002'], ['9100000002']],
  ['612415101', 'Aarohi Patil', 'SY ENTC', 'B-204', 'Kolhapur', ['9000000003'], ['9100000003']],
  ['612415117', 'Meera Joshi', 'FY Mech', 'B-210', 'Satara', ['9000000004'], ['9100000004']],
  ['612415123', 'Ishita Deshmukh', 'LY CSE', 'C-305', 'Nagpur', ['9000000005'], ['9100000005']],
];

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Insert all hostels and their schedules
  const hostelIds = [];
  for (const hostel of hostels) {
    let { rows } = await client.query('SELECT id FROM hostel WHERE name = $1', [hostel.name]);
    let hostelId = rows[0]?.id;
    if (!hostelId) {
      ({ rows } = await client.query(
        `INSERT INTO hostel (name, address, latitude, longitude, geofence_radius_m, gate_closure_time)
         VALUES ($1,$2,$3,$4,$5,'21:00') RETURNING id`,
        [hostel.name, hostel.address, hostel.latitude, hostel.longitude, hostel.radius]
      ));
      hostelId = rows[0].id;
    }
    await client.query(
      `INSERT INTO in_out_time (hostel_id, out_time, in_time) VALUES ($1,'06:00','20:30')
       ON CONFLICT (hostel_id) DO NOTHING`,
      [hostelId]
    );
    hostelIds.push(hostelId);
  }

  // Demo warden and students go to the first hostel (COEP)
  const coepId = hostelIds[0];

  await client.query(
    `INSERT INTO warden (username, name, mobile_no, password_hash, hostel_id)
     VALUES ('warden1', 'Mrs. Kulkarni (Warden)', ARRAY['9888800001'], $1, $2)
     ON CONFLICT (username) DO NOTHING`,
    [await bcrypt.hash('warden123', 10), coepId]
  );

  const studentHash = await bcrypt.hash('student123', 10);
  for (const [mis, name, cls, room, home, phones, parents] of students) {
    await client.query(
      `INSERT INTO student (mis, name, class, room, home_address, admission_date, password_hash, phone_no, parents_phone_no, hostel_id)
       VALUES ($1,$2,$3,$4,$5,'2024-08-01',$6,$7,$8,$9) ON CONFLICT (mis) DO NOTHING`,
      [mis, name, cls, room, home, studentHash, phones, parents, coepId]
    );
  }

  await client.query('COMMIT');
  console.log('Seeded. Warden login: warden1 / warden123 — Student login: 612415090 / student123');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
  await pool.end();
}
