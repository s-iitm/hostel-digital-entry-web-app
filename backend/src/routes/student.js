import { Router } from 'express';
import { z } from 'zod';
import { query, tx, localNow } from '../db/index.js';
import { config } from '../config.js';
import { auth } from '../middleware/auth.js';
import { wrap, HttpError } from '../middleware/errors.js';
import { distanceMeters } from '../services/geo.js';

const router = Router();
router.use(auth('student'));

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(), // metres, as reported by the device
});

const MAX_ACCURACY_M = 200;

async function loadHostel(client, mis) {
  const { rows } = await client.query(
    `SELECT h.id AS hostel_id, h.name, h.address, h.latitude, h.longitude, h.geofence_radius_m,
            to_char(h.gate_closure_time, 'HH24:MI:SS') AS gate_closure_time,
            i.id AS in_out_time_id,
            to_char(i.out_time, 'HH24:MI:SS') AS out_time,
            to_char(i.in_time, 'HH24:MI:SS') AS in_time
     FROM student s
     JOIN hostel h ON h.id = s.hostel_id
     LEFT JOIN in_out_time i ON i.hostel_id = h.id
     WHERE s.mis = $1`,
    [mis]
  );
  if (!rows[0]) throw new HttpError(404, 'Student not found');
  return rows[0];
}

const logSelect = `SELECT id, log_date, exit_time, entry_time, entry_distance_m, status FROM entry_exit_log`;

// Current state: inside/outside, open entry, reminder flag and hostel rules.
router.get(
  '/status',
  wrap(async (req, res) => {
    const mis = req.user.id;
    const [hostel, now, open, recent] = await Promise.all([
      loadHostel({ query }, mis),
      localNow(),
      query(`${logSelect} WHERE student_mis = $1 AND status = 'OUT'`, [mis]),
      query(`${logSelect} WHERE student_mis = $1 ORDER BY exit_time DESC LIMIT 5`, [mis]),
    ]);
    const openLog = open.rows[0] || null;
    const reminderDue = !!openLog && (openLog.log_date < now.date || now.time >= (hostel.in_time || hostel.gate_closure_time));
    const overdue = !!openLog && (openLog.log_date < now.date || now.time >= hostel.gate_closure_time);
    res.json({
      state: openLog ? 'OUT' : 'IN',
      openLog,
      reminderDue,
      overdue,
      serverTime: now,
      canExit: !openLog && (!config.enforceExitWindow || (now.time >= (hostel.out_time || '00:00:00') && now.time < hostel.gate_closure_time)),
      hostel: {
        name: hostel.name,
        address: hostel.address,
        latitude: hostel.latitude,
        longitude: hostel.longitude,
        geofenceRadiusM: hostel.geofence_radius_m,
        gateClosureTime: hostel.gate_closure_time,
        outTime: hostel.out_time,
        inTime: hostel.in_time,
      },
      recent: recent.rows,
    });
  })
);

// Mark exit.
router.post(
  '/exit',
  wrap(async (req, res) => {
    const loc = locationSchema.parse(req.body);
    const mis = req.user.id;
    const log = await tx(async (client) => {
      const hostel = await loadHostel(client, mis);
      const now = await localNow(client);
      if (config.enforceExitWindow) {
        const from = hostel.out_time || '00:00:00';
        if (now.time < from || now.time >= hostel.gate_closure_time) {
          throw new HttpError(403, `Exits can be marked between ${from.slice(0, 5)} and ${hostel.gate_closure_time.slice(0, 5)}`);
        }
      }
      try {
        const { rows } = await client.query(
          `INSERT INTO entry_exit_log (student_mis, in_out_time_id, log_date, exit_latitude, exit_longitude)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, log_date, exit_time, entry_time, entry_distance_m, status`,
          [mis, hostel.in_out_time_id, now.date, loc.latitude, loc.longitude]
        );
        return rows[0];
      } catch (e) {
        if (e.code === '23505') throw new HttpError(409, 'You already have an open exit. Mark your entry first.');
        throw e;
      }
    });
    res.status(201).json({ log });
  })
);

// Mark entry (geofenced): only accepted when the device is at the hostel.
router.post(
  '/entry',
  wrap(async (req, res) => {
    const loc = locationSchema.parse(req.body);
    const mis = req.user.id;

    if (loc.accuracy !== undefined && loc.accuracy > MAX_ACCURACY_M) {
      throw new HttpError(422, `Location is too imprecise (±${Math.round(loc.accuracy)} m). Move to an open area and try again.`, {
        code: 'LOW_ACCURACY',
      });
    }

    const result = await tx(async (client) => {
      const hostel = await loadHostel(client, mis);
      const { rows: open } = await client.query(
        `SELECT id, log_date FROM entry_exit_log WHERE student_mis = $1 AND status = 'OUT' FOR UPDATE`,
        [mis]
      );
      if (!open[0]) throw new HttpError(409, 'You have no open exit to close.');

      const distance = Math.round(distanceMeters(loc.latitude, loc.longitude, hostel.latitude, hostel.longitude));
      if (distance > hostel.geofence_radius_m) {
        throw new HttpError(403, `You are ${distance} m from the hostel. Entry can only be marked within ${hostel.geofence_radius_m} m.`, {
          code: 'OUTSIDE_GEOFENCE',
          distanceM: distance,
          radiusM: hostel.geofence_radius_m,
        });
      }

      const { rows } = await client.query(
        `UPDATE entry_exit_log
            SET status = 'IN', entry_time = now(), entry_latitude = $2, entry_longitude = $3, entry_distance_m = $4
          WHERE id = $1
          RETURNING id, log_date, exit_time, entry_time, entry_distance_m, status`,
        [open[0].id, loc.latitude, loc.longitude, distance]
      );

      // The student is back: close the "not returned" alerts for this entry.
      await client.query(`UPDATE alert SET status = 'RESOLVED' WHERE log_id = $1 AND alert_type = 'NOT_RETURNED'`, [open[0].id]);

      // If they came back after gate closure, tell the wardens (informational).
      const now = await localNow(client);
      const late = open[0].log_date < now.date || now.time >= hostel.gate_closure_time;
      if (late) {
        await client.query(
          `INSERT INTO alert (log_id, warden_id, alert_type, message)
           SELECT $1, w.id, 'LATE_RETURN',
                  s.name || ' (' || s.class || ', room ' || s.room || ') returned after gate closure.'
           FROM warden w, student s
           WHERE w.hostel_id = $2 AND s.mis = $3
           ON CONFLICT (log_id, warden_id, alert_type) DO NOTHING`,
          [open[0].id, hostel.hostel_id, mis]
        );
      }
      return { log: rows[0], distanceM: distance, late };
    });
    res.json(result);
  })
);

router.get(
  '/logs',
  wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 30, 200);
    const { rows } = await query(`${logSelect} WHERE student_mis = $1 ORDER BY exit_time DESC LIMIT $2`, [req.user.id, limit]);
    res.json({ logs: rows });
  })
);

export default router;
