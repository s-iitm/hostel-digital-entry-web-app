-- Digital Hostel Entry System — PostgreSQL schema (derived from the ER diagram)
-- Multivalued attributes (Phone_no, Parents_phone_no, Mobile_no) are stored as TEXT[].

CREATE TABLE IF NOT EXISTS hostel (
  id                 SERIAL PRIMARY KEY,
  name               TEXT NOT NULL,
  address            TEXT NOT NULL,
  latitude           DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude          DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  geofence_radius_m  INTEGER NOT NULL DEFAULT 600 CHECK (geofence_radius_m BETWEEN 20 AND 5000),
  gate_closure_time  TIME NOT NULL DEFAULT '21:00'
);

-- In_Out_Time: the hostel's permitted movement window ("provides": hostel 1 — 1 schedule)
--   out_time = earliest time a student may mark an exit
--   in_time  = time by which students are expected back (reminders start here)
CREATE TABLE IF NOT EXISTS in_out_time (
  id         SERIAL PRIMARY KEY,
  hostel_id  INTEGER NOT NULL UNIQUE REFERENCES hostel(id) ON DELETE CASCADE,
  out_time   TIME NOT NULL DEFAULT '06:00',
  in_time    TIME NOT NULL DEFAULT '20:30'
);

CREATE TABLE IF NOT EXISTS warden (
  id             SERIAL PRIMARY KEY,
  username       TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  mobile_no      TEXT[] NOT NULL CHECK (cardinality(mobile_no) >= 1),
  password_hash  TEXT NOT NULL,
  hostel_id      INTEGER NOT NULL REFERENCES hostel(id)          -- "Employs": hostel 1 — 1..M wardens
);

CREATE TABLE IF NOT EXISTS student (
  mis                TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  class              TEXT NOT NULL,
  room               TEXT NOT NULL,
  home_address       TEXT NOT NULL,
  admission_date     DATE NOT NULL,
  password_hash      TEXT NOT NULL,
  phone_no           TEXT[] NOT NULL CHECK (cardinality(phone_no) >= 1),
  parents_phone_no   TEXT[] NOT NULL CHECK (cardinality(parents_phone_no) >= 1),
  hostel_id          INTEGER NOT NULL REFERENCES hostel(id),     -- "Lives"
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_hostel_idx ON student(hostel_id);

CREATE TABLE IF NOT EXISTS entry_exit_log (
  id                 SERIAL PRIMARY KEY,
  student_mis        TEXT NOT NULL REFERENCES student(mis) ON DELETE CASCADE,   -- "Logs"
  in_out_time_id     INTEGER REFERENCES in_out_time(id) ON DELETE SET NULL,     -- "Require"
  log_date           DATE NOT NULL,
  exit_time          TIMESTAMPTZ NOT NULL DEFAULT now(),
  exit_latitude      DOUBLE PRECISION NOT NULL,
  exit_longitude     DOUBLE PRECISION NOT NULL,
  entry_time         TIMESTAMPTZ,
  entry_latitude     DOUBLE PRECISION,
  entry_longitude    DOUBLE PRECISION,
  entry_distance_m   INTEGER,
  status             TEXT NOT NULL DEFAULT 'OUT' CHECK (status IN ('OUT', 'IN')),
  CHECK ((status = 'OUT' AND entry_time IS NULL) OR (status = 'IN' AND entry_time IS NOT NULL))
);
-- A student can have at most one open (OUT) entry at any time — prevents double exits under races.
CREATE UNIQUE INDEX IF NOT EXISTS one_open_log_per_student ON entry_exit_log(student_mis) WHERE status = 'OUT';
CREATE INDEX IF NOT EXISTS log_date_idx ON entry_exit_log(log_date DESC);
CREATE INDEX IF NOT EXISTS log_status_idx ON entry_exit_log(status);

CREATE TABLE IF NOT EXISTS alert (
  alert_id     SERIAL PRIMARY KEY,
  log_id       INTEGER NOT NULL REFERENCES entry_exit_log(id) ON DELETE CASCADE,   -- "Triggers": log 1 — 0..M alerts
  warden_id    INTEGER NOT NULL REFERENCES warden(id) ON DELETE CASCADE,           -- "Receives": warden 1 — 1..M alerts
  alert_type   TEXT NOT NULL CHECK (alert_type IN ('NOT_RETURNED', 'LATE_RETURN')),
  alert_time   TIMESTAMPTZ NOT NULL DEFAULT now(),
  message      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  UNIQUE (log_id, warden_id, alert_type)       -- makes the 9 PM sweep idempotent
);
CREATE INDEX IF NOT EXISTS alert_warden_idx ON alert(warden_id, status);
