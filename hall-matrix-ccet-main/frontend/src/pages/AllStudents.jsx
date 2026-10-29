import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { downloadStudentsTemplate } from '../utils/templateGenerator';

export const AllStudents = () => {
  const [students, setStudents] = useState([]);
  const [degrees, setDegrees] = useState([]);
  const [departments, setDepartments] = useState([]);

  // Filters & Search State
  const [search, setSearch] = useState('');
  const [selectedDegree, setSelectedDegree] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Add Form State
  const [newRegNo, setNewRegNo] = useState('');
  const [newName, setNewName] = useState('');
  const [newDegree, setNewDegree] = useState('');
  const [newDept, setNewDept] = useState('');
  const [newBatch, setNewBatch] = useState('');
  const [newSubjectCode, setNewSubjectCode] = useState('');
  const [newUsername, setNewUsername] = useState('');

  // Selection & Bulk Delete State
  const [selectedIds, setSelectedIds] = useState([]);

  // View Modal State
  const [viewingStudent, setViewingStudent] = useState(null);
  const [viewAllocations, setViewAllocations] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);

  const [editingStudent, setEditingStudent] = useState(null);
  const [editForm, setEditForm] = useState({
    regno: '', name: '', degree: '', dept: '', subject_code: '', batch: '', username: '', password: ''
  });

  const handleViewStudent = async (student) => {
    setViewingStudent(student);
    setViewLoading(true);
    try {
      const data = await api.post('/t/ccet/student-view', { regno: student.regno });
      if (data.allocations) {
        setViewAllocations(data.allocations);
      } else {
        setViewAllocations([]);
      }
    } catch (err) {
      setViewAllocations([]);
    } finally {
      setViewLoading(false);
    }
  };

  const handleEditStudent = (student) => {
    setEditingStudent(student);
    setEditForm({
      regno: String(student.regno || '').replace(/\.0$/, ''),
      name: student.name || '',
      degree: student.degree || '',
      dept: student.dept || '',
      subject_code: student.subject_code || '',
      batch: student.batch || '',
      username: student.username || '',
      password: ''
    });
  };

  const handleEditFormChange = (field, value) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  };

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const cleanRegno = editForm.regno.trim();
      await api.put(`/students/${editingStudent.id}`, {
        ...editForm,
        regno: cleanRegno,
        name: editForm.name.trim(),
        degree: editForm.degree.trim(),
        dept: editForm.dept.trim(),
        subject_code: editForm.subject_code.trim(),
        batch: editForm.batch.trim(),
        username: (editForm.username && editForm.username.trim()) || cleanRegno,
        password: editForm.password.trim() || undefined
      });
      showToast('Student details and credentials updated successfully', 'success');
      setEditingStudent(null);
      await fetchStudents();
    } catch (err) {
      showToast(err.message || 'Unable to save student details', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (e, filteredList) => {
    if (e.target.checked) {
      const allIds = filteredList.map((s) => s.id);
      setSelectedIds(allIds);
    } else {
      setSelectedIds([]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;

    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected student(s)?`)) return;

    setActionLoading(true);
    try {
      const res = await api.post('/students/bulk-delete', { ids: selectedIds });
      if (res.success) {
        showToast(`Successfully deleted ${res.deletedCount || selectedIds.length} student(s)`, 'success');
        setSelectedIds([]);
        fetchStudents();
      }
    } catch (err) {
      showToast(err.message || 'Bulk deletion failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const { showToast } = useToast();

  useEffect(() => {
    fetchMetadata();
    fetchStudents();
  }, []);

  const fetchMetadata = async () => {
    try {
      const degData = await api.get('/degrees');
      if (degData.degrees) setDegrees(degData.degrees);

      const deptData = await api.get('/departments');
      if (deptData.departments) setDepartments(deptData.departments);
    } catch (err) {
      console.error('Failed to load metadata:', err);
    }
  };

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const data = await api.get('/students');
      if (data.students) {
        setStudents(data.students);
      }
    } catch (err) {
      showToast('Failed to load students roster', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudent = async (e) => {
    e.preventDefault();
    if (!newRegNo || !newDept || !newSubjectCode) {
      showToast('Register Number, Department, and Subject Code are required', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const res = await api.post('/students/add', {
        regno: newRegNo.trim(),
        name: newName.trim() || null,
        degree: newDegree.trim() || null,
        dept: newDept.trim(),
        batch: newBatch.trim() || null,
        subject_code: newSubjectCode.trim(),
        username: newUsername.trim() || null
      });

      if (res.success) {
        showToast('Student added successfully', 'success');
        setNewRegNo('');
        setNewName('');
        setNewUsername('');
        setNewSubjectCode('');
        setShowAddModal(false);
        fetchStudents();
      }
    } catch (err) {
      showToast(err.message || 'Failed to add student', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteStudent = async (id, regno) => {
    if (!window.confirm(`Are you sure you want to delete student ${regno}?`)) return;

    try {
      const res = await api.post(`/students/delete/${id}`);
      if (res.success) {
        showToast(`Student ${regno} deleted`, 'info');
        setStudents((prev) => prev.filter((s) => s.id !== id));
      }
    } catch (err) {
      showToast('Failed to delete student', 'error');
    }
  };

  const handleUploadExcel = async (e) => {
    e.preventDefault();
    if (!uploadFile) {
      showToast('Please select an Excel file (.xlsx or .xls)', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', uploadFile);

    setActionLoading(true);
    try {
      const res = await api.postFormData('/students/upload', formData);
      if (res.success) {
        showToast(res.message || `Uploaded ${res.count || ''} student records successfully!`, 'success');
        setUploadFile(null);
        setShowUploadModal(false);
        fetchStudents();
      }
    } catch (err) {
      showToast(err.message || 'Failed to upload Excel file', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Dynamically derive unique degrees from both metadata & student roster
  const availableDegrees = useMemo(() => {
    const set = new Set();
    degrees.forEach((d) => {
      if (d && d.name && String(d.name).trim()) {
        const degName = String(d.name).trim();
        if (degName.toUpperCase() !== 'GENERAL') set.add(degName);
      }
    });
    students.forEach((s) => {
      if (s && s.degree && String(s.degree).trim()) {
        const degName = String(s.degree).trim();
        if (degName.toUpperCase() !== 'GENERAL') set.add(degName);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [degrees, students]);

  // Dynamically derive unique departments (filtered by selectedDegree & selectedBatch if set)
  const availableDepartments = useMemo(() => {
    const set = new Set();
    const normDegree = selectedDegree ? String(selectedDegree).trim().toLowerCase() : '';
    const normBatch = selectedBatch ? String(selectedBatch).trim().toLowerCase() : '';

    departments.forEach((dp) => {
      if (!dp || !dp.name || !String(dp.name).trim()) return;
      const dpName = String(dp.name).trim();
      if (dpName.toUpperCase() === 'GENERAL') return;
      if (!normDegree || !dp.degree || String(dp.degree).trim().toLowerCase() === normDegree) {
        set.add(dpName);
      }
    });

    students.forEach((s) => {
      if (!s || !s.dept || !String(s.dept).trim()) return;
      const sDept = String(s.dept).trim();
      if (sDept.toUpperCase() === 'GENERAL') return;
      if (normDegree && (!s.degree || String(s.degree).trim().toLowerCase() !== normDegree)) return;
      if (normBatch && (!s.batch || String(s.batch).trim().toLowerCase() !== normBatch)) return;
      set.add(sDept);
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [departments, students, selectedDegree, selectedBatch]);

  // Dynamically derive unique batches from student roster
  const uniqueBatches = useMemo(() => {
    const set = new Set();
    students.forEach((s) => {
      if (s && s.batch && String(s.batch).trim()) set.add(String(s.batch).trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [students]);

  // Filter Logic with case-insensitive and whitespace-safe matching
  const filteredStudents = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    const degreeLower = selectedDegree.trim().toLowerCase();
    const deptLower = selectedDept.trim().toLowerCase();
    const batchLower = selectedBatch.trim().toLowerCase();

    return students.filter((s) => {
      if (searchLower) {
        const matchesSearch =
          (s.regno && String(s.regno).toLowerCase().includes(searchLower)) ||
          (s.name && String(s.name).toLowerCase().includes(searchLower)) ||
          (s.username && String(s.username).toLowerCase().includes(searchLower)) ||
          (s.subject_code && String(s.subject_code).toLowerCase().includes(searchLower));
        if (!matchesSearch) return false;
      }

      if (degreeLower && (!s.degree || String(s.degree).trim().toLowerCase() !== degreeLower)) {
        return false;
      }
      if (deptLower && (!s.dept || String(s.dept).trim().toLowerCase() !== deptLower)) {
        return false;
      }
      if (batchLower && (!s.batch || String(s.batch).trim().toLowerCase() !== batchLower)) {
        return false;
      }

      return true;
    });
  }, [students, search, selectedDegree, selectedDept, selectedBatch]);

  const hasActiveFilters = Boolean(search || selectedDegree || selectedDept || selectedBatch);

  return (
    <Layout>
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <div>
          <h2>🎓 Students Management</h2>
          <p className="subtitle">Overall view and management of all registered students</p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <Link to="/students/hierarchy" className="btn btn-secondary" style={{ textDecoration: 'none' }}>
            📁 Hierarchy View
          </Link>
          <button className="btn btn-secondary" onClick={() => setShowUploadModal(true)}>
            📥 Upload Excel
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
            + Add Student
          </button>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="card" style={{ padding: '18px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
          {/* Search */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              🔍 Search Reg No / Name
            </label>
            <input
              type="text"
              className="input"
              placeholder="Search Reg No or Name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%', colorScheme: 'dark' }}
            />
          </div>

          {/* Degree Filter */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              Degree Filter {availableDegrees.length > 0 ? `(${availableDegrees.length})` : ''}
            </label>
            <select
              className="input"
              value={selectedDegree}
              onChange={(e) => {
                setSelectedDegree(e.target.value);
              }}
              style={{
                width: '100%',
                colorScheme: 'dark',
                backgroundColor: '#111827',
                color: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <option value="" style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                All Degrees {availableDegrees.length > 0 ? `(${availableDegrees.length})` : ''}
              </option>
              {availableDegrees.map((deg) => (
                <option key={deg} value={deg} style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                  {deg}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              Department Filter {availableDepartments.length > 0 ? `(${availableDepartments.length})` : ''}
            </label>
            <select
              className="input"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              style={{
                width: '100%',
                colorScheme: 'dark',
                backgroundColor: '#111827',
                color: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <option value="" style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                All Departments {availableDepartments.length > 0 ? `(${availableDepartments.length})` : ''}
              </option>
              {availableDepartments.map((dept) => (
                <option key={dept} value={dept} style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                  {dept}
                </option>
              ))}
            </select>
          </div>

          {/* Batch Filter */}
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              Batch Filter {uniqueBatches.length > 0 ? `(${uniqueBatches.length})` : ''}
            </label>
            <select
              className="input"
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              style={{
                width: '100%',
                colorScheme: 'dark',
                backgroundColor: '#111827',
                color: '#ffffff',
                cursor: 'pointer'
              }}
            >
              <option value="" style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                All Batches {uniqueBatches.length > 0 ? `(${uniqueBatches.length})` : ''}
              </option>
              {uniqueBatches.map((b) => (
                <option key={b} value={b} style={{ backgroundColor: '#111827', color: '#ffffff' }}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Reset Filters button */}
          {hasActiveFilters && (
            <div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setSearch('');
                  setSelectedDegree('');
                  setSelectedDept('');
                  setSelectedBatch('');
                }}
                style={{
                  width: '100%',
                  height: '46px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  whiteSpace: 'nowrap'
                }}
              >
                ✕ Reset Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <h3 style={{ fontSize: '16px', margin: 0 }}>
            Showing {filteredStudents.length} of {students.length} Total Students
          </h3>

          {selectedIds.length > 0 && (
            <button
              className="btn"
              onClick={handleBulkDelete}
              disabled={actionLoading}
              style={{
                background: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '8px 18px',
                borderRadius: '8px',
                fontWeight: '700',
                fontSize: '13px',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(244, 63, 94, 0.3)'
              }}
            >
              🗑️ Delete Selected ({selectedIds.length})
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            Loading overall student roster...
          </div>
        ) : filteredStudents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No students found matching the selected search/filter criteria.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
                  <th style={{ padding: '14px 16px', width: '40px' }}>
                    <input
                      type="checkbox"
                      onChange={(e) => handleSelectAll(e, filteredStudents)}
                      checked={
                        filteredStudents.length > 0 &&
                        filteredStudents.every((s) => selectedIds.includes(s.id))
                      }
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                  </th>
                  <th style={{ padding: '14px 16px' }}>#</th>
                  <th style={{ padding: '14px 16px' }}>Register Number</th>
                  <th style={{ padding: '14px 16px' }}>Student Name</th>
                  <th style={{ padding: '14px 16px' }}>Portal Login ID</th>
                  <th style={{ padding: '14px 16px' }}>Degree</th>
                  <th style={{ padding: '14px 16px' }}>Department</th>
                  <th style={{ padding: '14px 16px' }}>Batch</th>
                  <th style={{ padding: '14px 16px' }}>Subject Code</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s, idx) => (
                  <tr key={s.id} style={{
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: selectedIds.includes(s.id) ? 'rgba(99, 102, 241, 0.08)' : 'transparent'
                  }}>
                    <td style={{ padding: '14px 16px' }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(s.id)}
                        onChange={() => handleToggleSelect(s.id)}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                    <td style={{ padding: '14px 16px', fontWeight: '700', color: '#ffffff' }}>
                      {String(s.regno).replace(/\.0$/, '')}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#ffffff', fontWeight: '500' }}>
                      {s.name || 'N/A'}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#10b981', fontWeight: '600' }}>
                      {String(s.regno).replace(/\.0$/, '')}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{s.degree || 'N/A'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: '#818cf8',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {s.dept}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>{s.batch || 'N/A'}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: '700'
                      }}>
                        GENERAL
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <button
                        className="btn"
                        onClick={() => handleViewStudent(s)}
                        style={{
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#818cf8',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          marginRight: '8px'
                        }}
                      >
                        👁️ View Details
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleEditStudent(s)}
                        style={{
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                          marginRight: '8px'
                        }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        className="btn"
                        onClick={() => handleDeleteStudent(s.id, s.regno)}
                        style={{
                          background: 'rgba(244, 63, 94, 0.15)',
                          color: '#f43f5e',
                          border: '1px solid rgba(244, 63, 94, 0.3)',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Single Student Modal */}
      {showAddModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal" style={{ textAlign: 'left', maxWidth: '480px' }}>
            <h4>+ Add Student to Roster</h4>
            <form onSubmit={handleAddStudent} style={{ marginTop: '16px' }}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Register Number *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 950001"
                  value={newRegNo}
                  onChange={(e) => setNewRegNo(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Student Name</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. John Doe"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Gmail Username (Optional)</label>
                <input
                  type="email"
                  className="input"
                  placeholder="e.g. student@gmail.com"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Department *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. CSE"
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Subject Code *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. CS8591"
                  value={newSubjectCode}
                  onChange={(e) => setNewSubjectCode(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label>Degree (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. B.E."
                  value={newDegree}
                  onChange={(e) => setNewDegree(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label>Batch (Optional)</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. 2022-2026"
                  value={newBatch}
                  onChange={(e) => setNewBatch(e.target.value)}
                />
              </div>

              <div className="confirm-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Add Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Excel Modal */}
      {showUploadModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal" style={{ textAlign: 'left', maxWidth: '480px' }}>
            <h4>📥 Bulk Upload Students via Excel</h4>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
              Upload an Excel file containing headers: <code>regno</code>, <code>name</code>, <code>gmail_username</code>, <code>dept</code>, <code>subject_code</code>, <code>degree</code>, <code>batch</code>.
            </p>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={downloadStudentsTemplate}
              style={{
                width: '100%',
                marginBottom: '18px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                fontWeight: '600'
              }}
            >
              📥 Download Sample Excel Template (.csv/.xlsx)
            </button>

            <form onSubmit={handleUploadExcel}>
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  required
                  style={{ color: '#ffffff' }}
                />
              </div>

              <div className="confirm-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUploadModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Uploading...' : 'Upload File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Edit Modal */}
      {editingStudent && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal" style={{ textAlign: 'left', maxWidth: '640px', width: '92%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#ffffff' }}>✏️ Edit Student Details</h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStudent}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {[
                  ['name', 'Student Name', 'e.g. John Doe'],
                  ['degree', 'Degree', 'e.g. B.E.'],
                  ['dept', 'Department', 'e.g. CSE'],
                  ['subject_code', 'Subject Code', 'e.g. CS8591'],
                  ['batch', 'Batch', 'e.g. 2022-2026']
                ].map(([field, label, placeholder]) => (
                  <div className="form-group" key={field}>
                    <label>{label}{['dept', 'subject_code'].includes(field) ? ' *' : ''}</label>
                    <input
                      type="text"
                      className="input"
                      placeholder={placeholder}
                      value={editForm[field]}
                      onChange={(e) => handleEditFormChange(field, e.target.value)}
                      required={['dept', 'subject_code'].includes(field)}
                    />
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', margin: '20px 0 14px', paddingTop: '16px' }}>
                <h4 style={{ margin: '0 0 12px' }}>Student Portal Credentials</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group">
                    <label>Register Number *</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. 100000000002"
                      value={editForm.regno}
                      onChange={(e) => handleEditFormChange('regno', e.target.value)}
                      required
                    />
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                      Primary identifier used for student login.
                    </p>
                  </div>
                  <div className="form-group">
                    <label>Set Student Password</label>
                    <input
                      type="password"
                      className="input"
                      placeholder="Enter new password (e.g. 934575)"
                      value={editForm.password}
                      onChange={(e) => handleEditFormChange('password', e.target.value)}
                      autoComplete="new-password"
                    />
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                      Leave blank to keep existing password.
                    </p>
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                  Students log in to the Student Portal using their Register Number and Password.
                </p>
              </div>

              <div className="confirm-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingStudent(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Saving...' : 'Save Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Student Details View Modal */}
      {viewingStudent && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal" style={{ textAlign: 'left', maxWidth: '640px', width: '92%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#ffffff' }}>🎓 Student Complete Profile</h3>
              <button
                onClick={() => setViewingStudent(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '18px', borderRadius: '12px', marginBottom: '20px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Student Name</div>
                  <div style={{ fontWeight: '700', color: '#ffffff', fontSize: '16px' }}>{viewingStudent.name || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Register Number</div>
                  <div style={{ fontWeight: '700', color: '#6366f1', fontSize: '16px' }}>{String(viewingStudent.regno).replace(/\.0$/, '')}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Portal Login ID</div>
                  <div style={{ color: '#10b981', fontWeight: '700' }}>
                    {String(viewingStudent.regno).replace(/\.0$/, '')}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Department</div>
                  <div style={{ color: '#ffffff', fontWeight: '600' }}>{viewingStudent.dept}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Batch</div>
                  <div style={{ color: '#ffffff', fontWeight: '600' }}>{viewingStudent.batch || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Degree</div>
                  <div style={{ color: '#ffffff' }}>{viewingStudent.degree || 'N/A'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Registered Subject</div>
                  <div style={{ color: '#10b981', fontWeight: '700' }}>GENERAL</div>
                </div>
              </div>
            </div>

            <h4 style={{ marginBottom: '12px', fontSize: '15px' }}>📍 Allocated Exam Room & Seat</h4>
            {viewLoading ? (
              <div style={{ color: 'var(--text-muted)', padding: '12px 0' }}>Loading seat allocation...</div>
            ) : viewAllocations.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', padding: '14px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', fontSize: '13px' }}>
                No active exam hall seating confirmed yet for this student.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table" style={{ width: '100%', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>Exam Date</th>
                      <th style={{ padding: '10px 12px' }}>Subject</th>
                      <th style={{ padding: '10px 12px' }}>Hall</th>
                      <th style={{ padding: '10px 12px' }}>Seat</th>
                      <th style={{ padding: '10px 12px' }}>Invigilator</th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewAllocations.map((a, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '10px 12px' }}>{a.exam_date} ({a.session})</td>
                        <td style={{ padding: '10px 12px', color: '#6366f1', fontWeight: '700' }}>{a.subject_code}</td>
                        <td style={{ padding: '10px 12px', color: '#818cf8', fontWeight: '800' }}>{a.hall_no}</td>
                        <td style={{ padding: '10px 12px', color: '#10b981', fontWeight: '800' }}>{a.seat_label}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{a.invigilator || 'Staff'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ textAlign: 'right', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => setViewingStudent(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
};
