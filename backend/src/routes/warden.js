import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query, tx } from '../db/index.js';
import { config } from '../config.js';
import { auth } from '../middleware/auth.js';
import { wrap, HttpError } from '../middleware/errors.js';
import { studentFields } from './auth.js';

const router = Router();
router.use(auth('warden'));

// "Overdue" = open entry from an earlier day, or from today after the hostel's gate closure time.
const OVERDUE_SQL = `(l.log_date < (now() AT TIME ZONE $2)::date OR (now() AT TIME ZONE $2)::time >= h.gate_closure_time)`;

router.get(
  '/dashboard',
  wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT
         (SELECT count(*) FROM student WHERE hostel_id = $1)::int AS total_students,
         (SELECT count(*) FROM entry_exit_log l JOIN student s ON s.mis = l.student_mis
            WHERE s.hostel_id = $1 AND l.status = 'OUT')::int AS outside_now,
         (SELECT count(*) FROM entry_exit_log l JOIN student s ON s.mis = l.student_mis JOIN hostel h ON h.id = s.hostel_id
            WHERE s.hostel_id = $1 AND l.status = 'OUT' AND ${OVERDUE_SQL})::int AS overdue,
         (SELECT count(*) FROM entry_exit_log l JOIN student s ON s.mis = l.student_mis
            WHERE s.hostel_id = $1 AND l.log_date = (now() AT TIME ZONE $2)::date)::int AS movements_today,
         (SELECT count(*) FROM alert a WHERE a.warden_id = $3 AND a.status = 'OPEN')::int AS open_alerts,
         (SELECT to_char(gate_closure_time, 'HH24:MI') FROM hostel WHERE id = $1) AS gate_closure_time`,
      [req.user.hostelId, config.tz, Number(req.user.id)]
    );
    const r = rows[0];
    res.json({
      totalStudents: r.total_students,
      outsideNow: r.outside_now,
      overdue: r.overdue,
      movementsToday: r.movements_today,
      openAlerts: r.open_alerts,
      gateClosureTime: r.gate_closure_time,
    });
  })
);

// Everyone who is currently outside (the "who hasn't returned" list), overdue first.
router.get(
  '/outside',
  wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT l.id AS log_id, l.exit_time, l.log_date, s.mis, s.name, s.class, s.room, s.phone_no, s.parents_phone_no,
              ${OVERDUE_SQL} AS overdue
       FROM entry_exit_log l
       JOIN student s ON s.mis = l.student_mis
       JOIN hostel h ON h.id = s.hostel_id
       WHERE s.hostel_id = $1 AND l.status = 'OUT'
       ORDER BY overdue DESC, l.exit_time ASC`,
      [req.user.hostelId, config.tz]
    );
    res.json({ students: rows });
  })
);

const logsFilter = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['OUT', 'IN']).optional(),
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

function logsQuery(hostelId, f) {
  const where = ['s.hostel_id = $1'];
  const params = [hostelId];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };
  if (f.date) add('l.log_date = ?', f.date);
  if (f.from) add('l.log_date >= ?', f.from);
  if (f.to) add('l.log_date <= ?', f.to);
  if (f.status) add('l.status = ?', f.status);
  if (f.q) {
    const like = `%${f.q}%`;
    params.push(like, like);
    where.push(`(s.name ILIKE $${params.length - 1} OR s.mis ILIKE $${params.length})`);
  }
  return { where: where.join(' AND '), params };
}

router.get(
  '/logs',
  wrap(async (req, res) => {
    const f = logsFilter.parse(req.query);
    const { where, params } = logsQuery(req.user.hostelId, f);
    const [rows, count] = await Promise.all([
      query(
        `SELECT l.id, l.log_date, l.exit_time, l.entry_time, l.entry_distance_m, l.status,
                s.mis, s.name, s.class, s.room
         FROM entry_exit_log l JOIN student s ON s.mis = l.student_mis
         WHERE ${where} ORDER BY l.exit_time DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, f.limit, f.offset]
      ),
      query(`SELECT count(*)::int AS n FROM entry_exit_log l JOIN student s ON s.mis = l.student_mis WHERE ${where}`, params),
    ]);
    res.json({ logs: rows.rows, total: count.rows[0].n });
  })
);

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

router.get(
  '/logs.csv',
  wrap(async (req, res) => {
    const f = logsFilter.parse({ ...req.query, limit: 1000, offset: 0 });
    const { where, params } = logsQuery(req.user.hostelId, f);
    const { rows } = await query(
      `SELECT l.log_date, s.mis, s.name, s.class, s.room, l.exit_time, l.entry_time, l.status, l.entry_distance_m
       FROM entry_exit_log l JOIN student s ON s.mis = l.student_mis
       WHERE ${where} ORDER BY l.exit_time DESC LIMIT 1000`,
      params
    );
    const header = ['Date', 'MIS', 'Name', 'Class', 'Room', 'Exit time', 'Entry time', 'Status', 'Entry distance (m)'];
    const lines = [header.join(',')].concat(
      rows.map((r) =>
        [r.log_date, r.mis, r.name, r.class, r.room, r.exit_time, r.entry_time, r.status, r.entry_distance_m].map(csvCell).join(',')
      )
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="entry-exit-logs.csv"');
    res.send(lines.join('\n'));
  })
);

router.get(
  '/students',
  wrap(async (req, res) => {
    const { rows } = await query(
      `SELECT s.mis, s.name, s.class, s.room, s.phone_no, s.parents_phone_no, s.home_address, s.admission_date,
              (l.id IS NOT NULL) AS is_outside
       FROM student s
       LEFT JOIN entry_exit_log l ON l.student_mis = s.mis AND l.status = 'OUT'
       WHERE s.hostel_id = $1
       ORDER BY s.room, s.name`,
      [req.user.hostelId]
    );
    res.json({ students: rows });
  })
);

// Create a student account at admission time (warden sets a temporary password).
const createStudentSchema = z.object({
  ...studentFields,
  password: z.string().min(6).max(100),
});

router.post(
  '/students',
  wrap(async (req, res) => {
    const d = createStudentSchema.parse(req.body);
    await query(
      `INSERT INTO student (mis, name, class, room, home_address, admission_date, password_hash, phone_no, parents_phone_no, hostel_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [d.mis, d.name, d.class, d.room, d.homeAddress, d.admissionDate, await bcrypt.hash(d.password, 10), d.phoneNo, d.parentsPhoneNo, req.user.hostelId]
    ).catch((e) => {
      if (e.code === '23505') throw new HttpError(409, 'A student with this MIS already exists');
      throw e;
    });
    res.status(201).json({ ok: true });
  })
);

router.post(
  '/students/:mis/reset-password',
  wrap(async (req, res) => {
    const { password } = z.object({ password: z.string().min(6).max(100) }).parse(req.body);
    const { rowCount } = await query('UPDATE student SET password_hash = $1 WHERE mis = $2 AND hostel_id = $3', [
      await bcrypt.hash(password, 10),
      req.params.mis,
      req.user.hostelId,
    ]);
    if (!rowCount) throw new HttpError(404, 'Student not found in your hostel');
    res.json({ ok: true });
  })
);

const hostelSelect = `SELECT h.id, h.name, h.address, h.latitude, h.longitude, h.geofence_radius_m,
        to_char(h.gate_closure_time, 'HH24:MI') AS gate_closure_time,
        to_char(i.out_time, 'HH24:MI') AS out_time, to_char(i.in_time, 'HH24:MI') AS in_time
 FROM hostel h LEFT JOIN in_out_time i ON i.hostel_id = h.id WHERE h.id = $1`;

router.get(
  '/hostel',
  wrap(async (req, res) => {
    const { rows } = await query(hostelSelect, [req.user.hostelId]);
    res.json({ hostel: rows[0] });
  })
);

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'use HH:MM (24 hour)');
const hostelSchema = z.object({
  name: z.string().trim().min(2).max(100),
  address: z.string().trim().min(5).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  geofenceRadiusM: z.number().int().min(20).max(5000),
  gateClosureTime: hhmm,
  outTime: hhmm,
  inTime: hhmm,
});

router.put(
  '/hostel',
  wrap(async (req, res) => {
    const d = hostelSchema.parse(req.body);
    if (d.inTime > d.gateClosureTime) throw new HttpError(400, 'Return time (in_time) must not be after gate closure time');
    if (d.outTime >= d.inTime) throw new HttpError(400, 'Out time must be before in time');
    await tx(async (client) => {
      await client.query(
        `UPDATE hostel SET name=$2, address=$3, latitude=$4, longitude=$5, geofence_radius_m=$6, gate_closure_time=$7 WHERE id=$1`,
        [req.user.hostelId, d.name, d.address, d.latitude, d.longitude, d.geofenceRadiusM, d.gateClosureTime]
      );
      await client.query(
        `INSERT INTO in_out_time (hostel_id, out_time, in_time) VALUES ($1,$2,$3)
         ON CONFLICT (hostel_id) DO UPDATE SET out_time = EXCLUDED.out_time, in_time = EXCLUDED.in_time`,
        [req.user.hostelId, d.outTime, d.inTime]
      );
    });
    const { rows } = await query(hostelSelect, [req.user.hostelId]);
    res.json({ hostel: rows[0] });
  })
);

router.get(
  '/alerts',
  wrap(async (req, res) => {
    const status = z.enum(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']).optional().parse(req.query.status);
    const params = [Number(req.user.id)];
    let filter = '';
    if (status) {
      params.push(status);
      filter = 'AND a.status = $2';
    }
    const { rows } = await query(
      `SELECT a.alert_id, a.alert_type, a.alert_time, a.message, a.status,
              s.mis, s.name, s.class, s.room, s.phone_no, s.parents_phone_no
       FROM alert a
       JOIN entry_exit_log l ON l.id = a.log_id
       JOIN student s ON s.mis = l.student_mis
       WHERE a.warden_id = $1 ${filter}
       ORDER BY (a.status = 'OPEN') DESC, a.alert_time DESC
       LIMIT 200`,
      params
    );
    res.json({ alerts: rows });
  })
);

router.patch(
  '/alerts/:id/acknowledge',
  wrap(async (req, res) => {
    const { rowCount } = await query(
      `UPDATE alert SET status = 'ACKNOWLEDGED' WHERE alert_id = $1 AND warden_id = $2 AND status = 'OPEN'`,
      [Number(req.params.id), Number(req.user.id)]
    );
    if (!rowCount) throw new HttpError(404, 'Open alert not found');
    res.json({ ok: true });
  })
);

export default router;
