import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db/index.js';
import { config } from '../config.js';
import { auth, signToken } from '../middleware/auth.js';
import { wrap, HttpError } from '../middleware/errors.js';

const router = Router();

const phone = z.string().trim().regex(/^\+?[0-9][0-9\s-]{6,14}$/, 'enter a valid phone number');
// Accepts "9000000001, 9000000002" or ["9000000001"] → string[]
export const phoneList = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
  z.array(phone).min(1, 'at least one number is required').max(4)
);

export const studentFields = {
  mis: z.string().trim().regex(/^[A-Za-z0-9]{4,20}$/, 'MIS must be 4–20 letters/digits'),
  name: z.string().trim().min(2).max(100),
  class: z.string().trim().min(1).max(30),
  room: z.string().trim().min(1).max(20),
  homeAddress: z.string().trim().min(5).max(300),
  admissionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD'),
  phoneNo: phoneList,
  parentsPhoneNo: phoneList,
};

const loginSchema = z.object({
  role: z.enum(['student', 'warden']),
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

router.post(
  '/login',
  wrap(async (req, res) => {
    const { role, identifier, password } = loginSchema.parse(req.body);
    const sql =
      role === 'student'
        ? 'SELECT mis AS id, name, password_hash, hostel_id FROM student WHERE mis = $1'
        : 'SELECT id, name, password_hash, hostel_id FROM warden WHERE username = $1';
    const { rows } = await query(sql, [identifier]);
    const user = rows[0];
    // Same message for unknown user and wrong password.
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new HttpError(401, 'Invalid ID or password');
    }
    const token = signToken({ role, id: String(user.id), hostelId: user.hostel_id });
    res.json({ token, user: { role, id: String(user.id), name: user.name, hostelId: user.hostel_id } });
  })
);

const registerStudentSchema = z.object({
  ...studentFields,
  hostelId: z.coerce.number().int().positive(),
  password: z.string().min(6, 'minimum 6 characters').max(100),
});

router.post(
  '/register',
  wrap(async (req, res) => {
    const d = registerStudentSchema.parse(req.body);
    const hash = await bcrypt.hash(d.password, 10);
    try {
      await query(
        `INSERT INTO student (mis, name, class, room, home_address, admission_date, password_hash, phone_no, parents_phone_no, hostel_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [d.mis, d.name, d.class, d.room, d.homeAddress, d.admissionDate, hash, d.phoneNo, d.parentsPhoneNo, d.hostelId]
      );
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'An account with this MIS already exists');
      throw e;
    }
    const token = signToken({ role: 'student', id: d.mis, hostelId: d.hostelId });
    res.status(201).json({ token, user: { role: 'student', id: d.mis, name: d.name, hostelId: d.hostelId } });
  })
);

const registerWardenSchema = z.object({
  inviteCode: z.string().min(1),
  username: z.string().trim().regex(/^[a-z0-9_.-]{3,30}$/i, '3–30 letters, digits, . _ -'),
  name: z.string().trim().min(2).max(100),
  mobileNo: phoneList,
  hostelId: z.coerce.number().int().positive(),
  password: z.string().min(8, 'minimum 8 characters').max(100),
});

router.post(
  '/register-warden',
  wrap(async (req, res) => {
    const d = registerWardenSchema.parse(req.body);
    if (!config.wardenInviteCode || d.inviteCode !== config.wardenInviteCode) {
      throw new HttpError(403, 'Invalid warden invite code');
    }
    const hash = await bcrypt.hash(d.password, 10);
    let row;
    try {
      ({ rows: [row] } = await query(
        `INSERT INTO warden (username, name, mobile_no, password_hash, hostel_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [d.username.toLowerCase(), d.name, d.mobileNo, hash, d.hostelId]
      ));
    } catch (e) {
      if (e.code === '23505') throw new HttpError(409, 'That username is taken');
      throw e;
    }
    const token = signToken({ role: 'warden', id: String(row.id), hostelId: d.hostelId });
    res.status(201).json({ token, user: { role: 'warden', id: String(row.id), name: d.name, hostelId: d.hostelId } });
  })
);

router.get(
  '/me',
  auth(),
  wrap(async (req, res) => {
    const { role, id } = req.user;
    const sql =
      role === 'student'
        ? 'SELECT mis AS id, name, hostel_id FROM student WHERE mis = $1'
        : 'SELECT id, name, hostel_id FROM warden WHERE id = $1';
    const { rows } = await query(sql, [id]);
    if (!rows[0]) throw new HttpError(401, 'Account no longer exists');
    res.json({ user: { role, id: String(rows[0].id), name: rows[0].name, hostelId: rows[0].hostel_id } });
  })
);

// Public: hostel list for the registration form.
router.get(
  '/hostels',
  wrap(async (_req, res) => {
    const { rows } = await query('SELECT id, name FROM hostel ORDER BY name');
    res.json({ hostels: rows });
  })
);

export default router;
