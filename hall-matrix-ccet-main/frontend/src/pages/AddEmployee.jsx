import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';

export const AddEmployee = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [degree, setDegree] = useState('');
  const [branch, setBranch] = useState('');
  const [batch, setBatch] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Tutor/Employee');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim() || !username.trim() || !password.trim()) {
      showToast('Name, username, and password are required', 'error');
      return;
    }

    setLoading(true);
    try {
      await api.post('/employees', {
        name: name.trim(),
        email: email.trim(),
        degree: degree.trim(),
        branch: branch.trim(),
        batch: batch.trim(),
        username: username.trim(),
        password: password.trim(),
        role: role.trim() || 'Tutor/Employee',
        status: 'Active',
      });
      showToast('Employee/Tutor added successfully', 'success');
      navigate('/employee/list');
    } catch (err) {
      showToast(err.message || 'Failed to add employee', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="page">
        <div className="page-header card" style={{ padding: 18, marginBottom: 20 }}>
          <h2>Add Employee / Tutor</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: 6 }}>
            Create a new employee record with tutor credentials and assigned department batch.
          </p>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <form onSubmit={handleSubmit}>
            <div className="form-inline">
              <div className="form-group">
                <label>Full Name *</label>
                <input
                  placeholder="e.g. A Arul"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  placeholder="e.g. arul123@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-inline" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label>Qualification / Degree</label>
                <input
                  placeholder="e.g. B.Tech"
                  value={degree}
                  onChange={(e) => setDegree(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Department / Branch</label>
                <input
                  placeholder="e.g. Information Technology"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Assigned Batch</label>
                <input
                  placeholder="e.g. 2023-2027"
                  value={batch}
                  onChange={(e) => setBatch(e.target.value)}
                />
              </div>
            </div>

            <div className="form-inline" style={{ marginTop: 16 }}>
              <div className="form-group">
                <label>Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    background: 'rgba(0, 0, 0, 0.2)',
                    color: 'var(--text-main)'
                  }}
                >
                  <option value="Tutor/Employee">Tutor/Employee</option>
                  <option value="Tutor">Tutor</option>
                  <option value="Employee">Employee</option>
                </select>
              </div>
            </div>

            <div style={{
              marginTop: 20,
              padding: '18px',
              background: 'rgba(99, 102, 241, 0.08)',
              borderRadius: '14px',
              border: '1px solid rgba(99, 102, 241, 0.2)'
            }}>
              <p style={{ margin: '0 0 12px', fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                🔑 Tutor Login Credentials
              </p>
              <div className="form-inline">
                <div className="form-group">
                  <label>Username (Email)</label>
                  <input
                    type="email"
                    placeholder="arul123@gmail.com"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    placeholder="e.g. 789456"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving Employee...' : 'Save Employee / Tutor'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setName('');
                  setEmail('');
                  setDegree('');
                  setBranch('');
                  setBatch('');
                  setUsername('');
                  setPassword('');
                  setRole('Tutor/Employee');
                }}
                className="btn btn-secondary"
              >
                Reset
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default AddEmployee;
