import cron from 'node-cron';
import { query } from '../db/index.js';
import { config } from '../config.js';

/**
 * Creates NOT_RETURNED alerts (one per warden of the hostel) for every open entry that is overdue:
 *  - the entry belongs to an earlier day, or
 *  - it is today and the hostel's gate closure time (default 9 PM) has passed.
 * Idempotent: UNIQUE(log_id, warden_id, alert_type) means repeated sweeps never duplicate alerts,
 * and students who return later are picked up automatically because the warden's list is a live query.
 */
export async function runAlertSweep() {
  const { rowCount } = await query(
    `INSERT INTO alert (log_id, warden_id, alert_type, message)
     SELECT l.id, w.id, 'NOT_RETURNED',
            s.name || ' (' || s.class || ', room ' || s.room || ', MIS ' || s.mis || ') has not returned. '
              || 'Phone: ' || array_to_string(s.phone_no, ', ')
     FROM entry_exit_log l
     JOIN student s ON s.mis = l.student_mis
     JOIN hostel h ON h.id = s.hostel_id
     JOIN warden w ON w.hostel_id = h.id
     WHERE l.status = 'OUT'
       AND ( l.log_date < (now() AT TIME ZONE $1)::date
             OR (now() AT TIME ZONE $1)::time >= h.gate_closure_time )
     ON CONFLICT (log_id, warden_id, alert_type) DO NOTHING`,
    [config.tz]
  );
  return rowCount;
}

export function startAlertJob() {
  if (!config.alertJobEnabled) {
    console.log('Alert job disabled (ALERT_JOB_ENABLED=false)');
    return;
  }
  // Every minute: cheap, idempotent, and robust to server restarts around 9 PM.
  cron.schedule('* * * * *', async () => {
    try {
      const created = await runAlertSweep();
      if (created > 0) console.log(`[alerts] created ${created} NOT_RETURNED alert(s)`);
    } catch (e) {
      console.error('[alerts] sweep failed', e.message);
    }
  });
  console.log('Alert job scheduled (every minute)');
}
