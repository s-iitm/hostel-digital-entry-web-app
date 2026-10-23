# hostel-digital-entry-web-app — Digital Hostel Entry Management System

**Problem**: Physical entries in hostel register. Due to crowds and long lines at the register, students often miss logging entries and exits.  
From a safety perspective, students who do not close their entries at night make the records inconsistent.

#### Proposed Solution:
A digital, geofenced web app that allows students to mark exits and entries securely from their phones, with automated warden alerts and reminders.

- **Students mark exit** from anywhere (timestamp and GPS recorded).
- **Entry is geofenced** to the hostel premises — entry can only be marked when the student is physically within the hostel's geofence radius.
- **Automated Alerts**: At gate closure (9:00 PM), the warden dashboard highlights students who have not returned, along with student and parent contact numbers.
- **Student Reminders**: In-app banner and browser notifications once curfew/in-time approaches.

### Key Features
- **Role-based Authentication**: Student login & registration, Warden login & registration (protected via warden invite code), JWT authentication, rate limiting.
- **Geofencing**: Haversine distance validation against hostel coordinates using browser Geolocation API.
- **Warden Portal**:
  - Live overview of students currently outside with quick-call links.
  - Comprehensive logs with filters, date range, search, pagination, and CSV export.
  - Student directory and password reset capabilities.
  - Hostel settings to update gate closure time and calibrate GPS geofence with "Use my current location".
- **Student Portal**:
  - Simple 1-tap exit and entry marking.
  - Active status cards and countdown to gate closure.
  - Personal log history.

---

## Tech Stack
- **Frontend**: React 18, Vite, Lucide Icons, Vanilla CSS
- **Backend**: Node.js, Express, PostgreSQL (`pg` connection pool), Zod validation, Bcrypt
- **Scheduling**: `node-cron` (automated gate closure checks)
- **Containerization**: Docker & Docker Compose for PostgreSQL

---

## How the ER Diagram Maps to the Database

| ER element | Table / column |
|---|---|
| Student (MIS, Name, Class, Room, Home_Address, Admission_date, Password, Phone_no*, Parents_phone_no*) | `student` — `phone_no` and `parents_phone_no` are `TEXT[]` (multivalued attributes) |
| Warden (ID, Name, Mobile_no*, Password) | `warden` (+ `username` for login) |
| Hostel (ID, Name, Address, Latitude, Longitude, Gate_closure_time) | `hostel` (+ `geofence_radius_m`) |
| In_Out_Time (ID, In_time, Out_time) | `in_out_time` |
| Entry_Exit_Log (ID, Log_Date, Status, Entry_Time, Exit_Time, Exit_latitude, Exit_longitude) | `entry_exit_log` (+ entry coordinates and distance) |
| Alert (Alert_ID, Alert_Type, Alert_Time, Message, Status) | `alert` |
| Lives (Student M — 1 Hostel) | `student.hostel_id` |
| Employs (Hostel 1 — 1..M Warden) | `warden.hostel_id` |
| Logs (Student 1 — M Entry_Exit_Log) | `entry_exit_log.student_mis` |
| provides (Hostel 1 — 1 In_Out_Time) | `in_out_time.hostel_id` (UNIQUE) |
| Require (In_Out_Time 1 — 1 Log) | `entry_exit_log.in_out_time_id` |
| Triggers (Log 1 — 0..M Alert) | `alert.log_id` |
| Receives (Warden 1 — 1..M Alert) | `alert.warden_id` |

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ (or Docker)

### 1. Database Setup
Start Postgres with Docker:
```bash
docker compose up -d
```
*(Or use your local PostgreSQL server on port 5432 with database `hostel_entry`)*

### 2. Backend Setup
```bash
cd backend
cp .env.example .env       # verify DATABASE_URL and JWT_SECRET
npm install
npm run db:init            # create database tables
npm run db:seed            # seed sample hostels, warden, and students
npm run dev                # runs on http://localhost:4000
```

### 3. Frontend Setup
In a second terminal:
```bash
cd frontend
npm install
npm run dev                # runs on http://localhost:5173
```

---

## Demo Credentials

- **Warden Login**:
  - **Username**: `warden1`
  - **Password**: `warden123`
- **Student Login**:
  - **MIS**: `612415090` (Darshana Kulkarni) or `612415096` (Shivani Mahajan)
  - **Password**: `student123`
- **Warden Registration Invite Code**: `change-me-warden-code` (configurable in `backend/.env`)

---

## API Summary

```
POST /api/auth/login | /register | /register-warden      GET /api/auth/me | /hostels
GET  /api/student/status | /logs                           POST /api/student/exit | /entry
GET  /api/warden/dashboard | /outside | /logs | /logs.csv | /students | /hostel | /alerts
POST /api/warden/students | /students/:mis/reset-password
PUT  /api/warden/hostel                                    PATCH /api/warden/alerts/:id/acknowledge
```
