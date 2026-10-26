import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtClock, fmtDate } from '../utils.js';
import { PhoneLinks } from './WardenOverview.jsx';

function Item({ label, children }) {
  return (
    <div className="profile-item">
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/auth/profile').then((r) => setProfile(r.profile)).catch((e) => setError(e.message));
  }, []);

  if (!profile) return <p className={error ? 'msg error' : 'muted pad'} role={error ? 'alert' : undefined}>{error || 'Loading…'}</p>;

  const isStudent = profile.role === 'student';
  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

  return (
    <div className="stack-lg profile">
      <section className="card profile-head">
        <span className="avatar" aria-hidden="true">{initials}</span>
        <div>
          <h1>{profile.name}</h1>
          <p className="muted">{isStudent ? `MIS ${profile.mis}` : `Warden · @${profile.username}`}</p>
        </div>
      </section>

      <section className="card">
        <h2>{isStudent ? 'Student details' : 'Warden details'}</h2>
        <dl className="profile-list">
          {isStudent ? (
            <>
              <Item label="MIS">{profile.mis}</Item>
              <Item label="Class">{profile.class}</Item>
              <Item label="Room">{profile.room}</Item>
              <Item label="Admission date">{fmtDate(profile.admissionDate)}</Item>
              <Item label="Home address">{profile.homeAddress}</Item>
              <Item label="My phone"><PhoneLinks list={profile.phoneNo} /></Item>
              <Item label="Parents’ phone"><PhoneLinks list={profile.parentsPhoneNo} /></Item>
            </>
          ) : (
            <>
              <Item label="Warden ID">{profile.id}</Item>
              <Item label="Username">{profile.username}</Item>
              <Item label="Mobile"><PhoneLinks list={profile.mobileNo} /></Item>
            </>
          )}
        </dl>
      </section>

      <section className="card">
        <h2>Hostel</h2>
        <dl className="profile-list">
          <Item label="Name">{profile.hostel.name}</Item>
          <Item label="Address">{profile.hostel.address}</Item>
          <Item label="Gate closes">{fmtClock(profile.hostel.gateClosureTime)}</Item>
        </dl>
      </section>
    </div>
  );
}