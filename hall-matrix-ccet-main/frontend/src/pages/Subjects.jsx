import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { downloadSubjectsTemplate } from '../utils/templateGenerator';

export const Subjects = () => {
  const [subjects, setSubjects] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [dept, setDept] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [batch, setBatch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filters and pagination
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [pageSize, setPageSize] = useState('All'); // Shows all subjects on the page by default
  const [currentPage, setCurrentPage] = useState(1);

  const { showToast } = useToast();

  const fetchSubjects = async () => {
    try {
      const data = await api.get('/subjects');
      setSubjects(data.subjects || []);
    } catch (err) {
      showToast(err.message || 'Failed to load subjects', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const data = await api.get('/departments');
      setDepartments(data.departments || []);
    } catch {
      // Non-blocking
    }
  };

  useEffect(() => {
    fetchSubjects();
    fetchDepartments();
  }, []);

  // Compute unique departments and batches present in subjects
  const availableDepts = useMemo(() => {
    const set = new Set();
    subjects.forEach((s) => {
      if (s.dept) set.add(s.dept.trim());
    });
    return Array.from(set).sort();
  }, [subjects]);

  const availableBatches = useMemo(() => {
    const set = new Set();
    subjects.forEach((s) => {
      if (s.batch) set.add(s.batch.trim());
    });
    return Array.from(set).sort();
  }, [subjects]);

  // Filtered list
  const filteredSubjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subjects.filter((sub) => {
      if (filterDept && (sub.dept || '').toLowerCase() !== filterDept.toLowerCase()) {
        return false;
      }
      if (filterBatch && (sub.batch || '').toLowerCase() !== filterBatch.toLowerCase()) {
        return false;
      }
      if (q) {
        const inCode = (sub.subject_code || '').toLowerCase().includes(q);
        const inName = (sub.subject_name || '').toLowerCase().includes(q);
        const inDept = (sub.dept || '').toLowerCase().includes(q);
        const inBatch = (sub.batch || '').toLowerCase().includes(q);
        if (!inCode && !inName && !inDept && !inBatch) return false;
      }
      return true;
    });
  }, [subjects, search, filterDept, filterBatch]);

  // Paginated list
  const totalPages = pageSize === 'All' ? 1 : Math.max(1, Math.ceil(filteredSubjects.length / Number(pageSize)));
  const paginatedSubjects = useMemo(() => {
    if (pageSize === 'All') return filteredSubjects;
    const size = Number(pageSize);
    const start = (currentPage - 1) * size;
    return filteredSubjects.slice(start, start + size);
  }, [filteredSubjects, pageSize, currentPage]);

  const handleToggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredSubjects.map((s) => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected subject(s)?`)) return;

    setSubmitting(true);
    try {
      const res = await api.post('/subjects/bulk-delete', { ids: selectedIds });
      if (res.success) {
        showToast(`Deleted ${res.deletedCount || selectedIds.length} subject(s)`, 'success');
        setSelectedIds([]);
        fetchSubjects();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete subjects', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (subjects.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ALL ${subjects.length} subjects in the catalog?`)) return;

    setSubmitting(true);
    try {
      const res = await api.post('/subjects/bulk-delete', { ids: subjects.map((s) => s.id) });
      if (res.success) {
        showToast(`Deleted all ${res.deletedCount || subjects.length} subjects`, 'success');
        setSelectedIds([]);
        fetchSubjects();
      }
    } catch (err) {
      showToast(err.message || 'Failed to delete all subjects', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!subjectCode || !subjectName) {
      showToast('Please fill subject code and name', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/subjects/add', {
        subject_code: subjectCode.trim(),
        subject_name: subjectName.trim(),
        dept: dept.trim() || null,
        batch: batch.trim() || null
      });
      showToast('Subject added successfully', 'success');
      setDept('');
      setSubjectCode('');
      setSubjectName('');
      setBatch('');
      fetchSubjects();
    } catch (err) {
      showToast(err.message || 'Failed to add subject', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this subject?')) return;

    try {
      await api.post(`/subjects/delete/${id}`);
      showToast('Subject deleted successfully', 'success');
      fetchSubjects();
    } catch (err) {
      showToast(err.message || 'Failed to delete subject', 'error');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      showToast('Please choose an Excel file', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    setSubmitting(true);
    try {
      const res = await api.postFormData('/subjects/upload', formData);
      showToast(res.message || 'Subjects list uploaded successfully', 'success');
      setFile(null);
      e.target.reset();
      fetchSubjects();
    } catch (err) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="page-header">
        <h2>Subject Catalog</h2>
        <Link to="/dashboard" className="btn btn-secondary">
          ← Back to Dashboard
        </Link>
      </div>

      {/* Add Subject */}
      <div className="card">
        <h3>➕ Add Subject</h3>
        <form onSubmit={handleAdd} className="form-inline" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
            <input
              type="text"
              placeholder="Department (e.g. CSE)"
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              disabled={submitting}
              list="dept-list-options"
            />
            {departments.length > 0 && (
              <datalist id="dept-list-options">
                {departments.map((d) => (
                  <option key={d.id || d.name} value={d.name} />
                ))}
              </datalist>
            )}
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
            <input
              type="text"
              placeholder="Subject Code (e.g. CS101)"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          <div className="form-group" style={{ flex: 2, minWidth: '220px' }}>
            <input
              type="text"
              placeholder="Subject Name (e.g. Computer Science I)"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              required
              disabled={submitting}
            />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
            <input
              type="text"
              placeholder="Assign Batch (e.g. 2022-2026)"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              disabled={submitting}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Subject'}
          </button>
        </form>
      </div>

      {/* Excel Upload */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <h3 style={{ margin: 0 }}>📊 Upload Subjects (Excel)</h3>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={downloadSubjectsTemplate}
            style={{
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#818cf8',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              fontSize: '13px',
              padding: '6px 14px'
            }}
          >
            📥 Download Sample Template (.csv/.xlsx)
          </button>
        </div>
        <form onSubmit={handleUpload} className="file-upload-form">
          <div className="file-input-wrapper">
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={(e) => setFile(e.target.files[0])}
              required
              disabled={submitting}
            />
            <div className="file-input-label">
              📁 {file ? file.name : 'Choose Excel Sheet (.xlsx)'}
            </div>
          </div>
          <button type="submit" className="btn btn-success" disabled={submitting}>
            {submitting ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              🔍 Search Subjects
            </label>
            <input
              type="text"
              className="input"
              placeholder="Search code, name, dept, batch..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              Filter by Department
            </label>
            <select
              className="input"
              value={filterDept}
              onChange={(e) => { setFilterDept(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%' }}
            >
              <option value="">All Departments ({subjects.length})</option>
              {availableDepts.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              Filter by Batch
            </label>
            <select
              className="input"
              value={filterBatch}
              onChange={(e) => { setFilterBatch(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%' }}
            >
              <option value="">All Batches</option>
              {availableBatches.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              View Display Count
            </label>
            <select
              className="input"
              value={pageSize}
              onChange={(e) => { setPageSize(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%' }}
            >
              <option value="All">All Subjects ({filteredSubjects.length})</option>
              <option value="50">50 per page</option>
              <option value="100">100 per page</option>
              <option value="250">250 per page</option>
              <option value="500">500 per page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Grid of existing entries */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ margin: 0 }}>📘 Registered Subjects</h3>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Showing {paginatedSubjects.length} of {filteredSubjects.length} subjects {filteredSubjects.length !== subjects.length && `(filtered from ${subjects.length} total)`}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedIds.length > 0 && (
              <button
                className="btn"
                onClick={handleBulkDelete}
                disabled={submitting}
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
            {subjects.length > 0 && selectedIds.length === 0 && (
              <button
                className="btn btn-secondary"
                onClick={handleDeleteAll}
                disabled={submitting}
                style={{
                  fontSize: '12px',
                  padding: '6px 14px',
                  color: '#f43f5e',
                  borderColor: 'rgba(244, 63, 94, 0.3)'
                }}
              >
                🗑️ Clear All ({subjects.length})
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
            Loading subjects catalog...
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}>
                      <input
                        type="checkbox"
                        onChange={handleSelectAllFiltered}
                        checked={filteredSubjects.length > 0 && filteredSubjects.every((s) => selectedIds.includes(s.id))}
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </th>
                    <th style={{ width: '15%' }}>Department</th>
                    <th style={{ width: '18%' }}>Subject Code</th>
                    <th>Subject Name</th>
                    <th style={{ width: '18%' }}>Assigned Batch</th>
                    <th style={{ width: '120px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedSubjects.length > 0 ? (
                    paginatedSubjects.map((sub) => (
                      <tr key={sub.id} style={{ background: selectedIds.includes(sub.id) ? 'rgba(99, 102, 241, 0.08)' : 'transparent' }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(sub.id)}
                            onChange={() => handleToggleSelect(sub.id)}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        <td>
                          <span style={{
                            background: 'rgba(99, 102, 241, 0.15)',
                            color: '#818cf8',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {sub.dept || 'All Depts'}
                          </span>
                        </td>
                        <td style={{ fontWeight: '700', color: '#6366f1' }}>{sub.subject_code}</td>
                        <td>{sub.subject_name}</td>
                        <td>
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#10b981',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {sub.batch || 'All Batches'}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => handleDelete(sub.id)}
                            className="btn btn-danger"
                            style={{ padding: '6px 12px', fontSize: '13px' }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                        {subjects.length === 0
                          ? 'No subjects registered yet. Add a subject or upload an Excel sheet.'
                          : 'No subjects match the search/filter criteria.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls if not showing All */}
            {pageSize !== 'All' && totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
                <button
                  className="btn btn-secondary"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  ← Prev
                </button>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '0 8px' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-secondary"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  style={{ padding: '6px 14px', fontSize: '13px' }}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};
