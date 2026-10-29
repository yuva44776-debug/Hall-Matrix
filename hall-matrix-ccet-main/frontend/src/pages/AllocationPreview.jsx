import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { api } from '../utils/api';
import { useToast } from '../hooks/useToast';

export const AllocationPreview = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const state = location.state || {};
  const { preview, examDate, session } = state;

  useEffect(() => {
    if (!preview || preview.length === 0) {
      showToast('No active allocation preview found. Please configure and generate.', 'info');
      navigate('/allocation');
    }
  }, [preview, navigate, showToast]);

  if (!preview || preview.length === 0) {
    return null;
  }

  // Group allocations by hall_no
  const halls = {};
  preview.forEach((p) => {
    if (!p || !p.hall_no || !p.seat_label) return;
    if (!halls[p.hall_no]) halls[p.hall_no] = [];
    halls[p.hall_no].push(p);
  });

  const rowLetters = ['A', 'B', 'C', 'D'];
  const colNumbers = [1, 2, 3, 4, 5, 6];

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      // Send the preview state in body (the backend will process and insert)
      await api.post('/allocation/confirm', { preview });
      showToast('Allocation confirmed and saved successfully!', 'success');
      navigate('/dashboard');
    } catch (err) {
      showToast(err.message || 'Failed to confirm allocation', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      <div className="page-header">
        <div>
          <h2>Allocation Preview</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '4px', fontSize: '14px' }}>
            Date: {examDate} | Session: {session}
          </p>
        </div>
        <Link to="/allocation" className="btn btn-secondary">
          ← Reconfigure
        </Link>
      </div>

      {Object.keys(halls).map((hallNo) => {
        const seats = halls[hallNo];
        
        // Map seats by label for constant time lookup
        const seatMap = {};
        seats.forEach((s) => {
          seatMap[s.seat_label] = s;
        });

        return (
          <div className="hall-card" key={hallNo} style={{ marginBottom: '32px' }}>
            <div className="hall-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span>🏫 Hall: {hallNo} <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 'normal' }}>({seats.length}/24 Seats Occupied)</span></span>
              <span className="invigilator">Invigilator: {seats[0]?.invigilator || 'Unassigned'}</span>
            </div>

            {/* 6 Column Grid Header */}
            <div className="seat-grid-6cols" style={{ marginBottom: '12px' }}>
              {colNumbers.map((c) => (
                <div className="seat-col-header" key={c}>
                  C{c}
                </div>
              ))}
            </div>

            {/* Render 4 Rows: Row A, Row B, Row C, Row D */}
            {rowLetters.map((r) => (
              <div key={r} style={{ marginBottom: '12px' }}>
                <div className="seat-row-label">
                  <span>ROW {r}</span>
                </div>
                <div className="seat-grid-6cols">
                  {colNumbers.map((c) => {
                    const seatKey = r + c;
                    const s = seatMap[seatKey];
                    
                    return (
                      <div className="seat-box" key={seatKey} style={{
                        borderColor: s ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        background: s ? 'rgba(15, 23, 42, 0.65)' : 'rgba(10, 15, 30, 0.2)'
                      }}>
                        {s ? (
                          <>
                            <div className="seat-no">{seatKey}</div>
                            <div className="seat-regno">
                              {String(s.regno).replace(/\.0$/, '')}
                            </div>
                            <div className="seat-dept">Dept: {s.dept}</div>
                            <div className="seat-sub" title={s.subject_name || s.subject_code}>{s.subject_code}</div>
                          </>
                        ) : (
                          <div className="seat-empty">{seatKey} (Empty)</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div style={{ textAlign: 'center', marginTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={handleConfirm}
          className="btn btn-primary"
          style={{ padding: '16px 36px', fontSize: '18px', minWidth: '320px', background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)', border: 'none', boxShadow: '0 8px 24px rgba(16, 185, 129, 0.3)' }}
          disabled={submitting}
        >
          {submitting ? 'Saving to Student Portals...' : '💾 Confirm & Save Schedule to Student Portals'}
        </button>
        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          ✨ Once saved, students can enter their Register Number on the Student Portal to view their Hall No & Seat Assignment.
        </span>
      </div>
    </div>
  );
};
