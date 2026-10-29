import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { api } from '../utils/api';

export const TutorDashboard = () => {
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  const [tutorInfo, setTutorInfo] = useState(user || null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);

  const fetchTutorStudents = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.get('/tutor/my-students');
      if (res.tutor) {
        setTutorInfo(res.tutor);
      }
      setStudents(res.students || []);
    } catch (err) {
      console.error('Failed to load tutor students:', err);
      setErrorMsg(err.message || 'Failed to fetch batch students.');
      showToast(err.message || 'Failed to load mapped students', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTutorStudents();
  }, []);

  // Filter students based on search input
  const filteredStudents = students.filter((st) => {
    if (!searchTerm.trim()) return true;
    const query = searchTerm.toLowerCase().trim();
    return (
      (st.regno && st.regno.toLowerCase().includes(query)) ||
      (st.name && st.name.toLowerCase().includes(query)) ||
      (st.subject_code && st.subject_code.toLowerCase().includes(query)) ||
      (st.dept && st.dept.toLowerCase().includes(query)) ||
      (st.batch && st.batch.toLowerCase().includes(query))
    );
  });

  const activeBranch = tutorInfo?.branch || tutorInfo?.dept || user?.branch || 'Information Technology';
  const activeBatch = tutorInfo?.batch || user?.batch || '2023-2027';
  const activeDegree = tutorInfo?.degree || user?.degree || 'B.Tech';
  const tutorName = tutorInfo?.name || user?.name || 'Tutor';
  const tutorRole = tutorInfo?.role || user?.role || 'Tutor/Employee';
  const tutorEmail = tutorInfo?.email || user?.email || user?.username || 'tutor@institution.edu';

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(circle at 50% 50%, #111827 0%, #070a13 100%)',
      color: '#f3f4f6',
      fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif",
      padding: '24px'
    }}>
      <style>{`
        .tutor-container {
          max-width: 1200px;
          margin: 0 auto;
        }

        .tutor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(17, 24, 39, 0.7);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 20px 28px;
          margin-bottom: 24px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }

        .tutor-title {
          font-size: 1.6rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .tutor-sub {
          color: #9ca3af;
          font-size: 0.9rem;
          margin-top: 4px;
        }

        .btn-tutor-logout {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          color: #fff;
          border: none;
          padding: 10px 20px;
          border-radius: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .btn-tutor-logout:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(239, 68, 68, 0.4);
        }

        .tutor-hero-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }

        .stat-card {
          background: rgba(17, 24, 39, 0.65);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 20px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
          transition: transform 0.2s ease;
        }

        .stat-card:hover {
          transform: translateY(-3px);
          border-color: rgba(99, 102, 241, 0.3);
        }

        .stat-label {
          font-size: 0.78rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #9ca3af;
          margin-bottom: 6px;
        }

        .stat-value {
          font-size: 1.4rem;
          font-weight: 700;
          color: #ffffff;
        }

        .badge-indigo {
          background: rgba(99, 102, 241, 0.15);
          color: #818cf8;
          border: 1px solid rgba(99, 102, 241, 0.3);
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .badge-amber {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .badge-green {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .students-section {
          background: rgba(17, 24, 39, 0.65);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
        }

        .section-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }

        .section-title {
          font-size: 1.25rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .tutor-search-input {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 10px 16px;
          color: #ffffff;
          font-size: 0.9rem;
          width: 280px;
          outline: none;
          transition: border-color 0.2s ease;
        }

        .tutor-search-input:focus {
          border-color: #6366f1;
        }

        .tutor-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0 8px;
        }

        .tutor-table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #9ca3af;
          font-weight: 700;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .tutor-table td {
          padding: 14px 16px;
          background: rgba(31, 41, 55, 0.4);
          color: #e5e7eb;
          font-size: 0.9rem;
          vertical-align: middle;
        }

        .tutor-table tr td:first-child {
          border-top-left-radius: 12px;
          border-bottom-left-radius: 12px;
        }

        .tutor-table tr td:last-child {
          border-top-right-radius: 12px;
          border-bottom-right-radius: 12px;
        }

        .tutor-table tr:hover td {
          background: rgba(45, 55, 72, 0.6);
        }

        .regno-badge {
          font-family: monospace;
          font-size: 0.95rem;
          font-weight: 700;
          color: #60a5fa;
          background: rgba(59, 130, 246, 0.1);
          padding: 4px 10px;
          border-radius: 8px;
          border: 1px solid rgba(59, 130, 246, 0.2);
          display: inline-block;
        }

        .empty-tutor-state {
          text-align: center;
          padding: 60px 20px;
          color: #9ca3af;
        }

        .empty-tutor-state h4 {
          font-size: 1.2rem;
          color: #ffffff;
          margin: 12px 0 6px;
        }

        .spinner {
          width: 36px;
          height: 36px;
          border: 3px solid rgba(255, 255, 255, 0.1);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 0 auto 16px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div className="tutor-container">
        {/* Tutor Top Bar Header */}
        <div className="tutor-header">
          <div>
            <h1 className="tutor-title">
              <span>📚</span> Welcome, {tutorName}
            </h1>
            <p className="tutor-sub">
              Tutor Portal • Automatic Student Batch Mapping Dashboard
            </p>
          </div>
          <button className="btn-tutor-logout" onClick={logout}>
            Sign Out
          </button>
        </div>

        {/* Profile & Batch Overview Grid */}
        <div className="tutor-hero-grid">
          <div className="stat-card">
            <div className="stat-label">Assigned Department</div>
            <div className="stat-value" style={{ color: '#818cf8' }}>
              🏢 {activeBranch}
            </div>
            <span className="badge-indigo" style={{ marginTop: '10px', display: 'inline-block' }}>
              Qualification: {activeDegree}
            </span>
          </div>

          <div className="stat-card">
            <div className="stat-label">Assigned Batch</div>
            <div className="stat-value" style={{ color: '#fbbf24' }}>
              📅 {activeBatch}
            </div>
            <span className="badge-amber" style={{ marginTop: '10px', display: 'inline-block' }}>
              Auto-Mapped Batch
            </span>
          </div>

          <div className="stat-card">
            <div className="stat-label">Total Mapped Students</div>
            <div className="stat-value" style={{ color: '#34d399' }}>
              👥 {loading ? '...' : students.length}
            </div>
            <span className="badge-green" style={{ marginTop: '10px', display: 'inline-block' }}>
              Role: {tutorRole}
            </span>
          </div>

          <div className="stat-card">
            <div className="stat-label">Username / Email</div>
            <div className="stat-value" style={{ fontSize: '1rem', wordBreak: 'break-all', color: '#e5e7eb' }}>
              🔑 {tutorEmail}
            </div>
            <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#9ca3af' }}>
              Verified Credentials
            </div>
          </div>
        </div>

        {/* Mapped Students Section */}
        <div className="students-section">
          <div className="section-bar">
            <div>
              <h2 className="section-title">
                🎓 Dynamic Mapped Students
                <span className="badge-indigo">{filteredStudents.length} Students</span>
              </h2>
              <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '4px 0 0' }}>
                Students automatically retrieved for Department: <strong>{activeBranch}</strong> | Batch: <strong>{activeBatch}</strong>
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                className="tutor-search-input"
                placeholder="Search register no, name, subject..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button
                onClick={fetchTutorStudents}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  padding: '10px 16px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.9rem'
                }}
                title="Reload Mapped Students"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {errorMsg && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '14px 18px',
              borderRadius: '12px',
              marginBottom: '20px'
            }}>
              ⚠️ {errorMsg}
            </div>
          )}

          {loading ? (
            <div className="empty-tutor-state">
              <div className="spinner" />
              <h4>Fetching mapped students for batch {activeBatch}...</h4>
              <p>Scanning institution database for matching department and batch records.</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="empty-tutor-state">
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>📭</div>
              <h4>No students found for assigned batch ({activeBatch})</h4>
              <p>
                {searchTerm
                  ? `No student records matched your search "${searchTerm}".`
                  : `There are currently no students registered in department "${activeBranch}" for batch "${activeBatch}".`}
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tutor-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Register Number</th>
                    <th>Student Name</th>
                    <th>Department</th>
                    <th>Batch</th>
                    <th>Subject Code</th>
                    <th>Degree</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudents.map((st, idx) => (
                    <tr key={st.id || idx}>
                      <td style={{ color: '#9ca3af', fontWeight: 600 }}>{idx + 1}</td>
                      <td>
                        <span className="regno-badge">{st.regno}</span>
                      </td>
                      <td style={{ fontWeight: 600, color: '#ffffff' }}>
                        {st.name || st.regno || 'Student Record'}
                      </td>
                      <td>{st.dept || activeBranch}</td>
                      <td>
                        <span className="badge-amber">{st.batch || activeBatch}</span>
                      </td>
                      <td>
                        <span style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#a5b4fc',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontWeight: 700,
                          fontSize: '0.82rem'
                        }}>
                          {st.subject_code || 'N/A'}
                        </span>
                      </td>
                      <td>{st.degree || activeDegree || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TutorDashboard;
