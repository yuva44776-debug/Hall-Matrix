import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';

export const TutorLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { tutorLogin, login } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      showToast('Please enter both username and password', 'error');
      return;
    }
    
    setLoading(true);
    try {
      const loginFn = tutorLogin || login;
      await loginFn(username.trim(), password.trim());
      showToast('Logged in as Tutor successfully', 'success');
      navigate('/tutor/dashboard');
    } catch (err) {
      showToast(err.message || 'Invalid username or password', 'error');
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
            onClick={() => navigate('/student/login')}
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
            🎓 Student Portal
          </button>
          <button
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '13px',
              cursor: 'default'
            }}
          >
            📚 Tutor
          </button>
        </div>

        <div className="logo" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }}>📚</div>
        <h2>Tutor Sign In</h2>
        <p className="subtitle">Hall Allocation Management System</p>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          
          <button type="submit" className="btn btn-primary" style={{ marginTop: '10px', background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)' }} disabled={loading}>
            {loading ? 'Logging in...' : 'Sign In'}
          </button>
        </form>
        
        <div className="footer-text" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
          <div>
            🔑 Are you an administrator? <Link to="/login" style={{ color: '#6366f1', fontWeight: '700' }}>Admin Login</Link>
          </div>
          <div>
            🎓 Student looking for exam seating? <Link to="/student/login" style={{ color: '#10b981', fontWeight: '700' }}>Go to Student Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
