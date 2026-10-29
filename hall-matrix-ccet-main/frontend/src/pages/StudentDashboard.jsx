import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { api } from '../utils/api';

export const StudentDashboard = () => {
  const { checkSession } = useAuth();
  const [student, setStudent] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'subjects' | 'schedule'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const navigate = useNavigate();
  const { showToast } = useToast();

  useEffect(() => {
    fetchStudentData();
  }, []);

  const fetchStudentData = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      // 1. Try unified student dashboard endpoint
      try {
        const dashData = await api.get('/student/dashboard');
        if (dashData && dashData.success && dashData.student) {
          setStudent(dashData.student);
          setSubjects(dashData.subjects || []);
          
          const uniqueAllocs = [];
          const seen = new Set();
          (dashData.allocations || []).forEach((item) => {
            const key = item.id || `${item.exam_date}_${item.session}_${item.subject_code}_${item.hall_no}_${item.seat_label}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueAllocs.push(item);
            }
          });
          setAllocations(uniqueAllocs);
          if (isManualRefresh) showToast('Schedule updated successfully', 'success');
          return;
        }
      } catch (dashErr) {
        console.warn('Unified dashboard fallback to individual endpoints:', dashErr);
      }

      // 2. Fallback to /auth/student-me
      const meData = await api.get('/auth/student-me');
      if (!meData || !meData.student) {
        navigate('/student/login');
        return;
      }
      setStudent(meData.student);

      // 3. Fallback to /student/my-allocations (graceful error handling - never kick student out!)
      try {
        const allocData = await api.get('/student/my-allocations');
        if (allocData && allocData.allocations) {
          const uniqueAllocs = [];
          const seen = new Set();
          (allocData.allocations || []).forEach((item) => {
            const key = item.id || `${item.exam_date}_${item.session}_${item.subject_code}_${item.hall_no}_${item.seat_label}`;
            if (!seen.has(key)) {
              seen.add(key);
              uniqueAllocs.push(item);
            }
          });
          setAllocations(uniqueAllocs);
        } else {
          setAllocations([]);
        }
      } catch (allocErr) {
        console.warn('Could not fetch allocations, showing empty schedule state:', allocErr);
        setAllocations([]);
      }

      if (isManualRefresh) showToast('Schedule updated', 'info');
    } catch (err) {
      console.error('Fatal student profile error:', err);
      showToast('Session expired or student not found. Please log in again.', 'error');
      navigate('/student/login');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleLogout = async () => {
    try {
      try {
        Object.keys(sessionStorage).forEach((k) => {
          if (k.startsWith('matrixAiChatState_')) {
            sessionStorage.removeItem(k);
          }
        });
      } catch (e) {
        // ignore
      }

      await api.post('/auth/student-logout');
      if (checkSession) await checkSession();
      showToast('Logged out of Student Portal', 'info');
      navigate('/student/login');
    } catch (err) {
      showToast('Logout failed', 'error');
    }
  };

  const copyRegNo = () => {
    if (!student?.regno) return;
    navigator.clipboard.writeText(student.regno);
    setCopied(true);
    showToast('Register Number copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintHallTicket = () => {
    window.print();
  };

  const getInitials = (name) => {
    if (!name) return 'ST';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        background: 'var(--bg-app)',
        color: 'var(--text-muted)',
        gap: '16px'
      }}>
        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: '4px solid rgba(16, 185, 129, 0.2)',
          borderTopColor: '#10b981',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{ fontSize: '16px', fontWeight: '600', color: 'var(--text-main)' }}>
          Loading your Student Portal...
        </div>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Retrieving academic profile and records</span>
      </div>
    );
  }

  return (
    <div className="student-portal-wrapper" style={{ minHeight: '100vh', background: 'var(--bg-app)', color: 'var(--text-main)', padding: '24px' }}>
      
      {/* Print-Only Hall Ticket Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .printable-hall-ticket, .printable-hall-ticket * {
            visibility: visible;
          }
          .printable-hall-ticket {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Top Navbar */}
      <header className="no-print" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '16px 28px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(20px)',
        borderRadius: '16px',
        border: '1px solid var(--card-border)',
        marginBottom: '28px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            fontWeight: '800',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
          }}>
            🎓
          </div>
          <div>
            <h2 style={{ fontSize: '18px', margin: 0, color: '#ffffff', fontWeight: '700' }}>
              {student?.tenant_name || 'Chettinad College of Engineering & Technology'}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '13px', color: '#10b981', fontWeight: '600' }}>Official Student Portal</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>•</span>
              <span style={{
                fontSize: '11px',
                padding: '1px 8px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                fontWeight: '700'
              }}>
                🟢 Active Session
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={() => fetchStudentData(true)}
            disabled={refreshing}
            className="btn"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              color: 'var(--text-main)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {refreshing ? '🔄 Syncing...' : '🔄 Refresh'}
          </button>
          <button
            onClick={handleLogout}
            className="btn"
            style={{
              background: 'rgba(244, 63, 94, 0.15)',
              color: '#f43f5e',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              padding: '8px 18px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            🚪 Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '1080px', margin: '0 auto' }}>

        {/* HERO STUDENT ID & PROFILE CARD (Always open and visible whether exams are scheduled or not) */}
        <div className="card" style={{
          marginBottom: '24px',
          padding: '28px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(6, 182, 212, 0.12) 100%)',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute',
            top: '-20px',
            right: '-20px',
            width: '140px',
            height: '140px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%)',
            pointerEvents: 'none'
          }} />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
            {/* Left: Avatar & Identity */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div style={{
                width: '74px',
                height: '74px',
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '28px',
                fontWeight: '800',
                color: '#ffffff',
                boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                border: '3px solid rgba(255, 255, 255, 0.2)'
              }}>
                {getInitials(student?.name)}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '11px',
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: '#10b981',
                    fontWeight: '800',
                    background: 'rgba(16, 185, 129, 0.18)',
                    padding: '3px 10px',
                    borderRadius: '8px'
                  }}>
                    🎓 Student Profile
                  </span>
                  <span style={{
                    fontSize: '11px',
                    color: '#06b6d4',
                    background: 'rgba(6, 182, 212, 0.18)',
                    padding: '3px 10px',
                    borderRadius: '8px',
                    fontWeight: '700'
                  }}>
                    {student?.degree || 'BE'} • {student?.dept || 'Engineering'}
                  </span>
                </div>

                <h1 style={{ fontSize: '28px', margin: '8px 0 4px 0', color: '#ffffff', fontWeight: '800' }}>
                  {student?.name || `Student ${student?.regno}`}
                </h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Reg No:</span>
                    <span style={{ fontSize: '15px', fontWeight: '700', color: '#10b981', letterSpacing: '0.5px' }}>
                      {student?.regno}
                    </span>
                    <button
                      onClick={copyRegNo}
                      title="Copy Register Number"
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: 'none',
                        color: copied ? '#10b981' : 'var(--text-muted)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      {copied ? '✓ Copied' : '📋 Copy'}
                    </button>
                  </div>

                  <span style={{ color: 'var(--text-muted)' }}>•</span>
                  <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Batch: <strong style={{ color: '#ffffff' }}>{student?.batch || 'N/A'}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Quick Stat Badges */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{
                background: 'rgba(0, 0, 0, 0.25)',
                padding: '12px 20px',
                borderRadius: '12px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                minWidth: '110px'
              }}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#06b6d4' }}>
                  {student?.academic_year || '3rd Year'}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {student?.semester || 'Semester 5'}
                </div>
              </div>

              <div style={{
                background: 'rgba(0, 0, 0, 0.25)',
                padding: '12px 20px',
                borderRadius: '12px',
                textAlign: 'center',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                minWidth: '110px'
              }}>
                <div style={{ fontSize: '20px', fontWeight: '800', color: '#10b981' }}>
                  {allocations.length}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Exams Scheduled
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ALLOCATED EXAM HALL & SEATING ASSIGNMENT (MUST SHOW WHEN AVAILABLE) */}
        {allocations && allocations.length > 0 ? (
          <div className="card printable-hall-ticket" style={{
            marginBottom: '24px',
            padding: '24px',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(16, 185, 129, 0.15) 100%)',
            border: '2px solid rgba(16, 185, 129, 0.45)',
            boxShadow: '0 8px 32px rgba(16, 185, 129, 0.18)',
            borderRadius: '16px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '22px'
                }}>
                  🎯
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', color: '#ffffff', fontWeight: '800' }}>
                    Allocated Examination Seating Details
                  </h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '700' }}>● Confirmed Hall Allocation</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>•</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{allocations.length} Exam(s) Assigned</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handlePrintHallTicket}
                className="btn no-print"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)'
                }}
              >
                <span>🖨️</span> Print Hall Ticket
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '16px' }}>
              {allocations.map((a, idx) => (
                <div key={idx} style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '14px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Course / Subject</span>
                      <div style={{ fontSize: '18px', fontWeight: '800', color: '#818cf8' }}>{a.subject_code}</div>
                    </div>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '8px',
                      fontSize: '11px',
                      fontWeight: '700',
                      background: String(a.session || '').toUpperCase().includes('FN') ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                      color: String(a.session || '').toUpperCase().includes('FN') ? '#3b82f6' : '#f59e0b'
                    }}>
                      {a.session || 'AN'} Session
                    </span>
                  </div>

                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#ffffff' }}>
                    {a.subject_name || 'Curriculum Course Examination'}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                    <div style={{
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      textAlign: 'center'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: '600' }}>EXAM HALL</span>
                      <strong style={{ fontSize: '22px', color: '#818cf8', fontWeight: '900', display: 'block', marginTop: '2px' }}>{a.hall_no}</strong>
                      {a.hall_block && <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginTop: '2px' }}>Block: {a.hall_block}</span>}
                    </div>

                    <div style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: '12px',
                      padding: '12px 14px',
                      textAlign: 'center'
                    }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', fontWeight: '600' }}>ALLOCATED SEAT</span>
                      <strong style={{ fontSize: '22px', color: '#10b981', fontWeight: '900', display: 'block', marginTop: '2px' }}>{a.seat_label}</strong>
                      <span style={{ fontSize: '11px', color: '#10b981', display: 'block', marginTop: '2px', fontWeight: '600' }}>Assigned Desk</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', flexWrap: 'wrap', gap: '6px' }}>
                    <span>📅 Date: <strong style={{ color: '#ffffff' }}>{a.exam_date}</strong></span>
                    <span>👨‍🏫 Invigilator: <strong style={{ color: '#ffffff' }}>{a.invigilator || 'Faculty Member'}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="card" style={{
            marginBottom: '24px',
            padding: '18px 24px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px dashed rgba(255, 255, 255, 0.15)',
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>📋</span>
              <div>
                <strong style={{ fontSize: '14px', color: '#ffffff' }}>No Active Exam Hall Allocated Currently</strong>
                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                  Once the examination cell schedules an exam seating layout for your department, your Hall & Seat will show here.
                </p>
              </div>
            </div>
            <button
              onClick={() => fetchStudentData(true)}
              disabled={refreshing}
              className="btn"
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.06)',
                color: 'var(--text-main)',
                border: '1px solid rgba(255, 255, 255, 0.12)'
              }}
            >
              {refreshing ? 'Checking...' : '🔄 Check Schedule'}
            </button>
          </div>
        )}

        {/* NAVIGATION TABS */}
        <div className="no-print" style={{
          display: 'flex',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.04)',
          padding: '6px',
          borderRadius: '14px',
          border: '1px solid var(--card-border)',
          marginBottom: '24px',
          overflowX: 'auto'
        }}>
          <button
            onClick={() => setActiveTab('profile')}
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'profile' ? 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' : 'transparent',
              color: activeTab === 'profile' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: activeTab === 'profile' ? '700' : '600',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            👤 Personal & Academic Details
          </button>

          <button
            onClick={() => setActiveTab('subjects')}
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'subjects' ? 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' : 'transparent',
              color: activeTab === 'subjects' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: activeTab === 'subjects' ? '700' : '600',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            📚 Enrolled Subjects ({subjects.length > 0 ? subjects.length : 1})
          </button>

          <button
            onClick={() => setActiveTab('schedule')}
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: '10px',
              border: 'none',
              background: activeTab === 'schedule' ? 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' : 'transparent',
              color: activeTab === 'schedule' ? '#ffffff' : 'var(--text-muted)',
              fontWeight: activeTab === 'schedule' ? '700' : '600',
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap'
            }}
          >
            📅 Exam Schedule & Seating ({allocations.length})
          </button>
        </div>

        {/* ========================================================================= */}
        {/* TAB 1: PERSONAL & ACADEMIC DETAILS                                       */}
        {/* ========================================================================= */}
        {activeTab === 'profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Student Personal Credentials Card */}
            <div className="card" style={{ padding: '26px' }}>
              <h3 style={{ fontSize: '17px', margin: '0 0 18px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>🪪</span> Student Personal Credentials
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Full Student Name</span>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>{student?.name || 'N/A'}</div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Register Number (12-Digit)</span>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#10b981' }}>{student?.regno || 'N/A'}</div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Portal Username / Email</span>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-main)' }}>{student?.username || `${student?.regno}@student.ccet.edu.in`}</div>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Student Status</span>
                  <div style={{ fontSize: '15px', fontWeight: '700', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>●</span> Active Regular Student
                  </div>
                </div>
              </div>
            </div>

            {/* Academic & Programme Details Card */}
            <div className="card" style={{ padding: '26px' }}>
              <h3 style={{ fontSize: '17px', margin: '0 0 18px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>🏛️</span> Academic & Department Details
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Degree / Programme</span>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>{student?.degree || 'BE'}</div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Bachelor of Engineering</span>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Department / Branch</span>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#06b6d4' }}>{student?.dept || 'N/A'}</div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Assigned Department</span>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Academic Batch</span>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>{student?.batch || '2023-2027'}</div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Graduation Cycle</span>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '14px 18px', borderRadius: '12px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Year of Study & Semester</span>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#f59e0b' }}>
                    {student?.academic_year || '3rd Year'} • {student?.semester || 'Semester 5'}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Academic Term 2026-2027</span>
                </div>
              </div>
            </div>

            {/* Faculty Advisor / Tutor & Institution Card */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: '20px'
            }}>
              {/* Tutor Card */}
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '16px', margin: '0 0 14px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>👨‍🏫</span> Assigned Class Tutor / Faculty Advisor
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
                  <div style={{
                    width: '46px',
                    height: '46px',
                    borderRadius: '12px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    color: '#818cf8',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '20px',
                    fontWeight: '700'
                  }}>
                    🎓
                  </div>
                  <div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff' }}>
                      {student?.tutor?.name || 'Class Tutor / Faculty Advisor'}
                    </div>
                    <div style={{ fontSize: '13px', color: '#818cf8', fontWeight: '600' }}>
                      {student?.tutor?.role || 'Class Tutor'} • Dept of {student?.dept}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.03)', padding: '10px 14px', borderRadius: '8px' }}>
                  📧 Contact Email: <strong style={{ color: '#ffffff' }}>{student?.tutor?.email || `advisor.${String(student?.dept).toLowerCase()}@ccet.edu.in`}</strong>
                </div>
              </div>

              {/* Institution Card */}
              <div className="card" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '16px', margin: '0 0 14px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🏫</span> Institution Information
                </h3>
                <div style={{ fontSize: '16px', fontWeight: '700', color: '#ffffff', marginBottom: '6px' }}>
                  {student?.tenant_name || 'Chettinad College of Engineering & Technology'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Affiliated to Anna University • Approved by AICTE
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-muted)' }}>
                    Campus ID: <strong style={{ color: '#ffffff' }}>{student?.tenant_id || 'ccet'}</strong>
                  </span>
                  <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    Portal Verification: <strong>Verified Student</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: ENROLLED SUBJECTS & COURSEWORK                                    */}
        {/* ========================================================================= */}
        {activeTab === 'subjects' && (
          <div className="card" style={{ padding: '26px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '18px', margin: '0 0 4px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>📘</span> Enrolled Subjects & Curriculum
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                  Active registered courses for {student?.dept} (Batch {student?.batch || '2023-2027'})
                </p>
              </div>

              {student?.subject_code && (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '6px 14px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Primary Exam Course:</span>
                  <span style={{ fontSize: '13px', fontWeight: '800', color: '#10b981' }}>{student?.subject_code}</span>
                </div>
              )}
            </div>

            {subjects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📖</div>
                <h4 style={{ fontSize: '16px', color: '#ffffff', marginBottom: '6px' }}>
                  Registered Primary Subject: {student?.subject_code || 'General'}
                </h4>
                <p style={{ fontSize: '13px', margin: 0 }}>
                  Full curriculum roster for your department is managed by your department coordinator.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255, 255, 255, 0.04)', textAlign: 'left' }}>
                      <th style={{ padding: '14px 16px' }}>#</th>
                      <th style={{ padding: '14px 16px' }}>Subject Code</th>
                      <th style={{ padding: '14px 16px' }}>Subject Name</th>
                      <th style={{ padding: '14px 16px' }}>Department</th>
                      <th style={{ padding: '14px 16px' }}>Batch</th>
                      <th style={{ padding: '14px 16px' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((sub, idx) => {
                      const isPrimary = sub.subject_code === student?.subject_code;
                      return (
                        <tr key={idx} style={{
                          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                          background: isPrimary ? 'rgba(16, 185, 129, 0.06)' : 'transparent'
                        }}>
                          <td style={{ padding: '16px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              fontWeight: '800',
                              color: isPrimary ? '#10b981' : '#6366f1',
                              fontSize: '15px'
                            }}>
                              {sub.subject_code}
                            </span>
                          </td>
                          <td style={{ padding: '16px', fontWeight: '600', color: '#ffffff' }}>
                            {sub.subject_name || 'Core Curriculum Course'}
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            {sub.dept || student?.dept}
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            {sub.batch || student?.batch || 'All'}
                          </td>
                          <td style={{ padding: '16px' }}>
                            {isPrimary ? (
                              <span style={{
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                background: 'rgba(16, 185, 129, 0.2)',
                                color: '#10b981',
                                fontWeight: '800'
                              }}>
                                ⭐ Primary Registered
                              </span>
                            ) : (
                              <span style={{
                                fontSize: '11px',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                background: 'rgba(255, 255, 255, 0.05)',
                                color: 'var(--text-muted)',
                                fontWeight: '600'
                              }}>
                                Enrolled
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: EXAM SCHEDULE & SEATING ARRANGEMENT                                */}
        {/* (CRITICAL: Shows confirmed allocations OR clean reassuring status if none)*/}
        {/* ========================================================================= */}
        {activeTab === 'schedule' && (
          <div className="card printable-hall-ticket" style={{ padding: '26px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
              marginBottom: '22px'
            }}>
              <div>
                <h3 style={{ fontSize: '18px', margin: '0 0 4px 0', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>📅</span> Examination Seating Schedule
                </h3>
                <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                  Confirmed exam hall locations and assigned seat numbers
                </p>
              </div>

              {allocations.length > 0 && (
                <button
                  onClick={handlePrintHallTicket}
                  className="btn no-print"
                  style={{
                    background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
                    color: '#ffffff',
                    border: 'none',
                    padding: '9px 20px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <span>🖨️</span> Print Hall Ticket
                </button>
              )}
            </div>

            {/* CASE A: No Exam Scheduled Yet */}
            {allocations.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '44px 24px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '14px',
                border: '1px dashed rgba(255, 255, 255, 0.12)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '14px' }}>📋</div>
                <h3 style={{ fontSize: '19px', color: '#ffffff', margin: '0 0 8px 0', fontWeight: '700' }}>
                  No Active Exams Scheduled Currently
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-muted)', maxWidth: '540px', margin: '0 auto 18px auto', lineHeight: '1.6' }}>
                  Your examination cell has not published seating arrangements for Register Number{' '}
                  <strong style={{ color: '#10b981' }}>{student?.regno}</strong> at this time.
                </p>

                <div style={{
                  display: 'inline-block',
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  padding: '12px 20px',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: '#10b981',
                  marginBottom: '20px'
                }}>
                  ✨ All your student credentials and enrolled subjects remain verified and active.
                </div>

                <div>
                  <button
                    onClick={() => fetchStudentData(true)}
                    disabled={refreshing}
                    className="btn"
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-main)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      padding: '10px 22px',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {refreshing ? 'Checking Schedule...' : '🔄 Check / Refresh Schedule Status'}
                  </button>
                </div>
              </div>
            ) : (
              /* CASE B: Exams ARE Scheduled */
              <div>
                <div className="table-responsive">
                  <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255, 255, 255, 0.04)', textAlign: 'left' }}>
                        <th style={{ padding: '14px 16px' }}>Date & Session</th>
                        <th style={{ padding: '14px 16px' }}>Subject Code & Name</th>
                        <th style={{ padding: '14px 16px' }}>Exam Hall</th>
                        <th style={{ padding: '14px 16px' }}>Allocated Seat</th>
                        <th style={{ padding: '14px 16px' }}>Invigilator</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allocations.map((a, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                          <td style={{ padding: '16px' }}>
                            <div style={{ fontWeight: '700', color: '#ffffff', fontSize: '15px' }}>{a.exam_date}</div>
                            <span style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: a.session === 'FN' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: a.session === 'FN' ? '#3b82f6' : '#f59e0b',
                              fontWeight: '700',
                              display: 'inline-block',
                              marginTop: '4px'
                            }}>
                              {a.session === 'FN' ? 'Forenoon (09:30 AM - 12:30 PM)' : 'Afternoon (01:30 PM - 04:30 PM)'}
                            </span>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <div style={{ fontWeight: '700', color: '#6366f1', fontSize: '15px' }}>{a.subject_code}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {a.subject_name || 'Curriculum Examination'}
                            </div>
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              background: 'rgba(99, 102, 241, 0.15)',
                              color: '#818cf8',
                              padding: '6px 14px',
                              borderRadius: '8px',
                              fontWeight: '800',
                              fontSize: '15px',
                              display: 'inline-block'
                            }}>
                              {a.hall_no}
                            </span>
                            {a.hall_block && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                Block: {a.hall_block}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '16px' }}>
                            <span style={{
                              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(6, 182, 212, 0.25) 100%)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.4)',
                              padding: '6px 16px',
                              borderRadius: '8px',
                              fontWeight: '900',
                              fontSize: '17px',
                              display: 'inline-block'
                            }}>
                              {a.seat_label}
                            </span>
                          </td>
                          <td style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>
                            <div style={{ color: '#ffffff', fontWeight: '600' }}>{a.invigilator || 'Assigned Faculty'}</div>
                            <span style={{ fontSize: '11px' }}>Exam Hall Duty</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Important Exam Day Instructions Card */}
                <div className="no-print" style={{
                  marginTop: '24px',
                  padding: '18px 22px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <h4 style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>⚠️</span> Important Examination Guidelines for Students
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.6' }}>
                    <li>Students must occupy their allocated seat at least <strong>15 minutes before</strong> the exam commences.</li>
                    <li>Always bring your <strong>College ID Card</strong> and this official Hall Ticket printout to the examination hall.</li>
                    <li>Possession of mobile phones, smartwatches, or any unauthorized materials inside the hall is strictly prohibited.</li>
                    <li>Verify your Subject Code on the question paper with your registration slip before writing.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}

      </div>

    </div>
  );
};

export default StudentDashboard;
