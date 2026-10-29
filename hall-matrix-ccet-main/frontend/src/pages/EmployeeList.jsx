import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';

const emptyDraft = {
  name: '',
  email: '',
  degree: '',
  branch: '',
  batch: '',
  username: '',
  password: '',
  role: 'Tutor/Employee',
  status: 'Active'
};

export const EmployeeList = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [editingEmployeeId, setEditingEmployeeId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('ALL');
  const [selectedBatch, setSelectedBatch] = useState('ALL');
  const [savingEdit, setSavingEdit] = useState(false);

  const { showToast } = useToast();

  const loadEmployees = async () => {
    setLoading(true);
    try {
      const data = await api.get('/employees');
      setEmployees(data.employees || []);
    } catch (err) {
      showToast(err.message || 'Failed to load employees', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleClear = async () => {
    if (!window.confirm('Are you sure you want to clear all employee records?')) return;
    try {
      for (const emp of employees) {
        await api.delete(`/employees/${emp.id}`);
      }
      setEmployees([]);
      setSelectedEmployee(null);
      setEditingEmployeeId(null);
      setDraft(emptyDraft);
      showToast('All employees cleared successfully', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to clear employees', 'error');
    }
  };

  const handleRefresh = () => {
    loadEmployees();
    setSelectedEmployee(null);
    setEditingEmployeeId(null);
    setDraft(emptyDraft);
  };

  const handleDelete = async (employeeId) => {
    if (!window.confirm('Are you sure you want to delete this employee?')) return;
    try {
      await api.delete(`/employees/${employeeId}`);
      const nextEmployees = employees.filter((emp) => emp.id !== employeeId);
      setEmployees(nextEmployees);

      if (selectedEmployee && selectedEmployee.id === employeeId) {
        setSelectedEmployee(null);
      }

      if (editingEmployeeId === employeeId) {
        setEditingEmployeeId(null);
        setDraft(emptyDraft);
      }
      showToast('Employee deleted', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to delete employee', 'error');
    }
  };

  const handleView = (employee) => {
    setSelectedEmployee(employee);
    setEditingEmployeeId(null);
    setDraft(emptyDraft);
  };

  const handleEdit = (employee) => {
    setSelectedEmployee(employee);
    setEditingEmployeeId(employee.id);
    setDraft({
      name: employee.name || '',
      email: employee.email || '',
      degree: employee.degree || '',
      branch: employee.branch || '',
      batch: employee.batch || '',
      username: employee.username || '',
      role: employee.role || 'Tutor/Employee',
      status: employee.status || 'Active',
      password: '',
    });
  };

  const handleDraftChange = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();
    if (!editingEmployeeId) return;

    setSavingEdit(true);
    try {
      await api.put(`/employees/${editingEmployeeId}`, {
        name: draft.name.trim(),
        email: draft.email.trim(),
        degree: draft.degree.trim(),
        branch: draft.branch.trim(),
        batch: draft.batch.trim(),
        username: draft.username.trim(),
        role: draft.role.trim() || 'Tutor/Employee',
        status: draft.status.trim() || 'Active',
        password: draft.password.trim() || undefined,
      });

      showToast('Employee updated successfully', 'success');
      await loadEmployees();
      setEditingEmployeeId(null);
      setDraft(emptyDraft);
    } catch (err) {
      showToast(err.message || 'Failed to update employee', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  // Derive unique branches and batches for filter dropdowns
  const uniqueBranches = Array.from(new Set(employees.map(e => e.branch).filter(Boolean)));
  const uniqueBatches = Array.from(new Set(employees.map(e => e.batch).filter(Boolean)));

  // Filtered employees
  const filteredEmployees = employees.filter((emp) => {
    if (selectedBranch !== 'ALL' && emp.branch !== selectedBranch) return false;
    if (selectedBatch !== 'ALL' && emp.batch !== selectedBatch) return false;
    if (!searchTerm.trim()) return true;

    const q = searchTerm.toLowerCase().trim();
    return (
      (emp.name && emp.name.toLowerCase().includes(q)) ||
      (emp.email && emp.email.toLowerCase().includes(q)) ||
      (emp.username && emp.username.toLowerCase().includes(q)) ||
      (emp.branch && emp.branch.toLowerCase().includes(q)) ||
      (emp.batch && emp.batch.toLowerCase().includes(q)) ||
      (emp.degree && emp.degree.toLowerCase().includes(q)) ||
      (emp.role && emp.role.toLowerCase().includes(q))
    );
  });

  return (
    <Layout>
      <style>{`
        .emp-list-page {
          padding: 8px 0 24px;
        }

        .emp-header-card {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(17, 24, 39, 0.75);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px 28px;
          margin-bottom: 24px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
        }

        .emp-header-card h2 {
          margin: 0;
          font-size: 1.8rem;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .emp-tag {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
          padding: 4px 12px;
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-top: 6px;
        }

        .emp-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .emp-btn {
          border: none;
          border-radius: 12px;
          padding: 10px 18px;
          font-size: 0.9rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }

        .emp-btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: #ffffff;
          box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
        }

        .emp-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
        }

        .emp-btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #e5e7eb;
        }

        .emp-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
          color: #ffffff;
        }

        .emp-btn-danger {
          background: rgba(239, 68, 68, 0.15);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
        }

        .emp-btn-danger:hover {
          background: rgba(239, 68, 68, 0.3);
          color: #ffffff;
        }

        .emp-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(320px, 1fr);
          gap: 24px;
        }

        .emp-card-box {
          background: rgba(17, 24, 39, 0.65);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
        }

        .emp-filter-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          flex-wrap: wrap;
          align-items: center;
        }

        .emp-search-input {
          flex: 1;
          min-width: 220px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 10px 16px;
          color: #ffffff;
          font-size: 0.9rem;
          outline: none;
          transition: border-color 0.2s ease;
        }

        .emp-search-input:focus {
          border-color: #6366f1;
        }

        .emp-select-filter {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 12px;
          padding: 10px 14px;
          color: #ffffff;
          font-size: 0.85rem;
          outline: none;
          cursor: pointer;
        }

        .emp-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0 8px;
        }

        .emp-table th {
          padding: 12px 14px;
          text-align: left;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #9ca3af;
          font-weight: 700;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .emp-table td {
          padding: 14px;
          background: rgba(31, 41, 55, 0.45);
          color: #e5e7eb;
          font-size: 0.88rem;
          vertical-align: middle;
        }

        .emp-table tr td:first-child {
          border-top-left-radius: 12px;
          border-bottom-left-radius: 12px;
        }

        .emp-table tr td:last-child {
          border-top-right-radius: 12px;
          border-bottom-right-radius: 12px;
        }

        .emp-table tr:hover td {
          background: rgba(45, 55, 72, 0.65);
        }

        .pill-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 8px;
          padding: 3px 8px;
          font-size: 0.78rem;
          font-weight: 700;
        }

        .pill-role {
          background: rgba(99, 102, 241, 0.15);
          color: #818cf8;
          border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .pill-status {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .pill-batch {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .action-icon-btn {
          border: none;
          border-radius: 8px;
          padding: 6px 10px;
          font-size: 0.78rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .btn-view {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }
        .btn-view:hover { background: rgba(59, 130, 246, 0.3); }

        .btn-edit {
          background: rgba(168, 85, 247, 0.15);
          color: #c084fc;
          border: 1px solid rgba(168, 85, 247, 0.3);
        }
        .btn-edit:hover { background: rgba(168, 85, 247, 0.3); }

        .btn-delete {
          background: rgba(239, 68, 68, 0.15);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .btn-delete:hover { background: rgba(239, 68, 68, 0.3); }

        .detail-panel {
          background: rgba(31, 41, 55, 0.5);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          padding: 20px;
        }

        .detail-item-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .detail-box {
          background: rgba(17, 24, 39, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 10px 14px;
        }

        .detail-box label {
          display: block;
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #9ca3af;
          margin-bottom: 4px;
        }

        .detail-box span {
          color: #ffffff;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .edit-form-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 16px;
        }

        .edit-form-group label {
          display: block;
          font-size: 0.78rem;
          color: #9ca3af;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .edit-form-group input,
        .edit-form-group select {
          width: 100%;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 10px;
          padding: 10px 12px;
          color: #ffffff;
          font-size: 0.9rem;
          outline: none;
        }

        .edit-form-group input:focus,
        .edit-form-group select:focus {
          border-color: #6366f1;
        }

        .empty-emp-state {
          text-align: center;
          padding: 48px 20px;
          color: #9ca3af;
        }

        @media (max-width: 960px) {
          .emp-main-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div className="emp-list-page">
        {/* Header Bar */}
        <div className="emp-header-card">
          <div>
            <h2>
              <span>👥</span> Employee Directory
            </h2>
            <span className="emp-tag">Tutor & Staff Management</span>
          </div>

          <div className="emp-actions">
            <Link to="/employee/add" className="emp-btn emp-btn-primary">
              ➕ Add Employee
            </Link>
            <button type="button" className="emp-btn emp-btn-secondary" onClick={handleRefresh}>
              🔄 Refresh
            </button>
            <button type="button" className="emp-btn emp-btn-danger" onClick={handleClear}>
              🗑️ Clear All
            </button>
          </div>
        </div>

        {/* Main Grid Layout */}
        <div className="emp-main-grid">
          {/* Left Table Section */}
          <div className="emp-card-box">
            {/* Search and Filters */}
            <div className="emp-filter-bar">
              <input
                type="text"
                className="emp-search-input"
                placeholder="Search employee name, email, branch, batch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              <select
                className="emp-select-filter"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="ALL">All Departments</option>
                {uniqueBranches.map((br) => (
                  <option key={br} value={br}>{br}</option>
                ))}
              </select>

              <select
                className="emp-select-filter"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
              >
                <option value="ALL">All Batches</option>
                {uniqueBatches.map((bt) => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="empty-emp-state">
                <div style={{
                  width: '36px',
                  height: '36px',
                  border: '3px solid rgba(255, 255, 255, 0.1)',
                  borderTopColor: '#6366f1',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px'
                }} />
                <h4>Loading employee directory...</h4>
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="empty-emp-state">
                <div style={{ fontSize: '48px', marginBottom: '8px' }}>📭</div>
                <h4 style={{ color: '#ffffff', margin: '0 0 8px' }}>No employees found</h4>
                <p style={{ margin: '0 0 18px' }}>
                  {searchTerm || selectedBranch !== 'ALL' || selectedBatch !== 'ALL'
                    ? 'No staff members match the selected filters.'
                    : 'Start by adding your first employee/tutor to the institution directory.'}
                </p>
                <Link to="/employee/add" className="emp-btn emp-btn-primary">
                  ➕ Add Employee
                </Link>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ margin: 0, color: '#ffffff', fontSize: '1.05rem' }}>Staff Records</h4>
                  <span className="pill-badge pill-role">{filteredEmployees.length} Total</span>
                </div>

                <table className="emp-table">
                  <thead>
                    <tr>
                      <th>Employee Name</th>
                      <th>Email / Username</th>
                      <th>Dept & Batch</th>
                      <th>Role & Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: '#ffffff', fontSize: '0.95rem' }}>
                            {emp.name || 'Unnamed Staff'}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '2px' }}>
                            {emp.degree ? `Qual: ${emp.degree}` : 'Staff Member'}
                          </div>
                        </td>
                        <td>
                          <div style={{ color: '#e5e7eb', fontSize: '0.85rem' }}>{emp.email || 'No email'}</div>
                          {emp.username && (
                            <div style={{ color: '#818cf8', fontSize: '0.8rem', fontWeight: 600, marginTop: '2px' }}>
                              🔑 {emp.username}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ color: '#ffffff', fontWeight: 600 }}>{emp.branch || 'General'}</span>
                            {emp.batch && <span className="pill-badge pill-batch">{emp.batch}</span>}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span className="pill-badge pill-role">{emp.role || 'Tutor/Employee'}</span>
                            <span className="pill-badge pill-status">{emp.status || 'Active'}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="action-icon-btn btn-view"
                              onClick={() => handleView(emp)}
                              title="View Details"
                            >
                              👁️ View
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn btn-edit"
                              onClick={() => handleEdit(emp)}
                              title="Edit Employee"
                            >
                              ✏️ Edit
                            </button>
                            <button
                              type="button"
                              className="action-icon-btn btn-delete"
                              onClick={() => handleDelete(emp.id)}
                              title="Delete Employee"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Right Panel: View Details / Edit Form */}
          <div className="emp-card-box">
            <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem', color: '#ffffff' }}>
              Employee Profile & Actions
            </h3>

            {selectedEmployee ? (
              <div>
                <div className="detail-panel">
                  <h4 style={{ margin: '0 0 4px', fontSize: '1.3rem', color: '#ffffff' }}>
                    {selectedEmployee.name}
                  </h4>
                  <p style={{ margin: 0, color: '#9ca3af', fontSize: '0.88rem' }}>
                    {selectedEmployee.email || selectedEmployee.username}
                  </p>

                  <div className="detail-item-grid">
                    <div className="detail-box">
                      <label>Qualification</label>
                      <span>{selectedEmployee.degree || '—'}</span>
                    </div>

                    <div className="detail-box">
                      <label>Department</label>
                      <span>{selectedEmployee.branch || '—'}</span>
                    </div>

                    <div className="detail-box">
                      <label>Batch</label>
                      <span style={{ color: '#fbbf24' }}>{selectedEmployee.batch || '—'}</span>
                    </div>

                    <div className="detail-box">
                      <label>Role</label>
                      <span style={{ color: '#818cf8' }}>{selectedEmployee.role || 'Tutor/Employee'}</span>
                    </div>

                    <div className="detail-box">
                      <label>Username</label>
                      <span>{selectedEmployee.username || '—'}</span>
                    </div>

                    <div className="detail-box">
                      <label>Status</label>
                      <span style={{ color: '#34d399' }}>{selectedEmployee.status || 'Active'}</span>
                    </div>
                  </div>
                </div>

                {/* Edit Employee Form */}
                {editingEmployeeId === selectedEmployee.id && (
                  <form onSubmit={handleSaveEdit} style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <h4 style={{ margin: '0 0 12px', fontSize: '1.05rem', color: '#ffffff' }}>
                      ✏️ Edit Employee Details
                    </h4>

                    <div className="edit-form-grid">
                      <div className="edit-form-group">
                        <label>Full Name</label>
                        <input
                          value={draft.name}
                          onChange={(e) => handleDraftChange('name', e.target.value)}
                          required
                        />
                      </div>

                      <div className="edit-form-group">
                        <label>Email Address</label>
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(e) => handleDraftChange('email', e.target.value)}
                          required
                        />
                      </div>

                      <div className="edit-form-group">
                        <label>Qualification / Degree</label>
                        <input
                          value={draft.degree}
                          onChange={(e) => handleDraftChange('degree', e.target.value)}
                        />
                      </div>

                      <div className="edit-form-group">
                        <label>Department / Branch</label>
                        <input
                          value={draft.branch}
                          onChange={(e) => handleDraftChange('branch', e.target.value)}
                        />
                      </div>

                      <div className="edit-form-group">
                        <label>Assigned Batch</label>
                        <input
                          value={draft.batch}
                          onChange={(e) => handleDraftChange('batch', e.target.value)}
                        />
                      </div>

                      <div className="edit-form-group">
                        <label>Username (Email)</label>
                        <input
                          type="email"
                          value={draft.username}
                          onChange={(e) => handleDraftChange('username', e.target.value)}
                          required
                        />
                      </div>

                      <div className="edit-form-group">
                        <label>Role</label>
                        <select
                          value={draft.role}
                          onChange={(e) => handleDraftChange('role', e.target.value)}
                        >
                          <option value="Tutor/Employee">Tutor/Employee</option>
                          <option value="Tutor">Tutor</option>
                          <option value="Employee">Employee</option>
                        </select>
                      </div>

                      <div className="edit-form-group">
                        <label>New Password (leave blank to keep unchanged)</label>
                        <input
                          type="password"
                          placeholder="••••••••"
                          value={draft.password}
                          onChange={(e) => handleDraftChange('password', e.target.value)}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
                        <button type="submit" className="emp-btn emp-btn-primary" disabled={savingEdit}>
                          {savingEdit ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button
                          type="button"
                          className="emp-btn emp-btn-secondary"
                          onClick={() => {
                            setEditingEmployeeId(null);
                            setDraft(emptyDraft);
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <div className="empty-emp-state">
                <div style={{ fontSize: '40px', marginBottom: '8px' }}>👤</div>
                <h4 style={{ color: '#ffffff', margin: '0 0 6px' }}>Select an Employee</h4>
                <p style={{ margin: 0, fontSize: '0.85rem' }}>
                  Click "View" or "Edit" on any employee row to inspect or update profile records.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default EmployeeList;
