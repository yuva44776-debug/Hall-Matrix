import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';

export const StudentLogin = () => {
  const [regno, setRegno] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setStudentSession } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanRegno = regno.trim().replace(/\s+/g, '');
    const cleanPassword = password.trim();

    if (!cleanRegno || !cleanPassword) {
      showToast('Please enter your Register Number and Password', 'error');
      return;
    }

    if (!/^\d{12}$/.test(cleanRegno)) {
      showToast('Register Number must be exactly 12 digits (e.g. 100000000001)', 'error');
      return;
    }

    if (!/^\d{6}$/.test(cleanPassword)) {
      showToast('Password must be exactly 6 digits (e.g. 123456)', 'error');
      return;
    }

    setLoading(true);
    try {
      const data = await api.post('/auth/student-login', {
        regno: cleanRegno,
        username: cleanRegno,
        password: cleanPassword
      });

      if (data.success) {
        setStudentSession(data.student);
        showToast(`Welcome ${data.student?.name || cleanRegno}!`, 'success');
        navigate('/student/dashboard');
      } else {
        showToast(data.error || 'Login failed', 'error');
      }
    } catch (err) {
      showToast(err.message || 'Login failed. Please verify your Register Number and password.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        {/* Role Switcher Tabs */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '10px',
          padding: '4px',
          marginBottom: '20px',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <button
            onClick={() => navigate('/login')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            🔑 Admin Login
          </button>
          <button
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'default'
            }}
          >
            🎓 Student Portal
          </button>
          <button
            onClick={() => navigate('/tutor/login')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontWeight: '600',
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            📚 Tutor
          </button>
        </div>

        <div className="logo" style={{ background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' }}>🎓</div>
        <h2>Student Portal</h2>
        <p className="subtitle">Access Your Academic Profile & Exam Schedules</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Student Register Number</span>
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600' }}>12 Digits</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={12}
              placeholder="Enter 12-digit Register Number (e.g. 100000000001)"
              value={regno}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                setRegno(val);
              }}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Password</span>
              <span style={{ fontSize: '11px', color: '#06b6d4', fontWeight: '600' }}>6 Digits</span>
            </label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter 6-digit password (default: 123456)"
              value={password}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                setPassword(val);
              }}
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '10px', background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' }} disabled={loading}>
            {loading ? 'Verifying Student Credentials...' : 'Access Student Portal'}
          </button>
        </form>

        <div className="footer-text" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
          <div>
            🔑 Are you an administrator? <Link to="/login" style={{ color: '#6366f1', fontWeight: '700' }}>Admin Login</Link>
          </div>
          <div>
            📚 Are you a tutor? <Link to="/tutor/login" style={{ color: '#f59e0b', fontWeight: '700' }}>Go to Tutor Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
