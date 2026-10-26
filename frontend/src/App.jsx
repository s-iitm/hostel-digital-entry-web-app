import { Navigate, Route, Routes, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import StudentHome from './pages/StudentHome.jsx';
import WardenOverview from './pages/WardenOverview.jsx';
import WardenLogs from './pages/WardenLogs.jsx';
import WardenStudents from './pages/WardenStudents.jsx';
import WardenSettings from './pages/WardenSettings.jsx';
import Profile from './pages/Profile.jsx';

function Shell({ role }) {
  const { user, signOut } = useAuth();
  return (
    <div className={`shell ${role}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">Hostel Gate</span>
        </div>
        {role === 'warden' && (
          <nav className="tabs" aria-label="Warden sections">
            <NavLink to="/warden" end>Overview</NavLink>
            <NavLink to="/warden/logs">Logs</NavLink>
            <NavLink to="/warden/students">Students</NavLink>
            <NavLink to="/warden/settings">Settings</NavLink>
            <NavLink to="/warden/profile">Profile</NavLink>
          </nav>
        )}
        <div className="who">
          {role === 'student' && (
            <NavLink to="/profile" className="btn ghost small">Profile</NavLink>
          )}
          <span className="who-name">{user.name}</span>
          <button className="btn ghost small" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}

function Guard({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'warden' ? '/warden' : '/'} replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="splash">Loading…</div>;
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'warden' ? '/warden' : '/'} replace /> : <Login />} />
      <Route element={<Guard role="student"><Shell role="student" /></Guard>}>
        <Route index element={<StudentHome />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="/warden" element={<Guard role="warden"><Shell role="warden" /></Guard>}>
        <Route index element={<WardenOverview />} />
        <Route path="logs" element={<WardenLogs />} />
        <Route path="students" element={<WardenStudents />} />
        <Route path="settings" element={<WardenSettings />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
