import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import { useAuth } from '../hooks/useAuth';

export const AiChatBox = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const isStudentPortal = pathname.startsWith('/student/') && pathname !== '/student/login';
  const isStudent = isStudentPortal || !!(user && (user.isStudent || String(user.role || '').toLowerCase().includes('student') || user.regno));
  const isTutor = !isStudent && !!(user && (user.isTutor || String(user.role || '').toLowerCase().includes('tutor')));

  const getUserKey = (currentUser) => {
    if (!currentUser) return 'guest';
    if (currentUser.isStudent || currentUser.role === 'student' || currentUser.regno) {
      return `student_${currentUser.regno || currentUser.id || 'anonymous'}`;
    }
    if (currentUser.isTutor || String(currentUser.role || '').toLowerCase().includes('tutor')) {
      return `tutor_${currentUser.id || currentUser.username || 'anonymous'}`;
    }
    return `admin_${currentUser.id || currentUser.username || 'user'}`;
  };

  const getWelcomeText = (currentUser) => {
    if (currentUser && (currentUser.isStudent || currentUser.role === 'student' || currentUser.regno)) {
      return `👋 Hello **${currentUser.name || currentUser.regno}**! I am your **Matrix AI Assistant** for **${currentUser.dept || 'your department'}** (${currentUser.batch || 'Batch'}).\n\nAsk me *"Where is my hall?"* or *"What is my seat number?"* to find your exam hall and seat details!`;
    }
    if (currentUser && (currentUser.isTutor || String(currentUser.role || '').toLowerCase().includes('tutor'))) {
      const deptLabel = currentUser.degree ? `${currentUser.degree} ${currentUser.branch || currentUser.dept || ''}` : (currentUser.dept || currentUser.branch || 'your department');
      const batchLabel = currentUser.batch || 'your batch';
      return `👋 Hello **${currentUser.name || 'Tutor'}**!\n\nI am your **Matrix AI Assistant** for **${deptLabel} (${batchLabel})**.\n\nYou can ask me:\n• *"What exam is my batch writing today?"*\n• *"What is the exam timetable for my batch?"*\n• *"Which exam do my students have today?"*`;
    }
    if (currentUser) {
      return `Hello **${currentUser.name || currentUser.username || 'Admin'}**! I am your **Matrix AI Assistant**.\n\nHow can I help you today with exam hall seating allocations, invigilator rosters, or schedule lookup?`;
    }
    return 'Hello! I am the **Matrix AI Assistant** for Hall Matrix. How can I help you today with exam hall seating, invigilator rosters, or schedule lookup?';
  };

  const createInitialMessages = (currentUser) => [
    {
      id: 'welcome',
      sender: 'ai',
      text: getWelcomeText(currentUser),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ];

  const loadSavedState = (targetKey, currentUser) => {
    try {
      const stored = sessionStorage.getItem(`matrixAiChatState_${targetKey}`);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      return {
        isOpen: parsed.isOpen === true,
        messages: Array.isArray(parsed.messages) && parsed.messages.length > 0 ? parsed.messages : createInitialMessages(currentUser),
        input: typeof parsed.input === 'string' ? parsed.input : ''
      };
    } catch (err) {
      return null;
    }
  };

  const currentKey = getUserKey(user);
  const [activeUserKey, setActiveUserKey] = useState(currentKey);
  const activeUserKeyRef = useRef(currentKey);
  activeUserKeyRef.current = currentKey;

  const initialLoaded = loadSavedState(currentKey, user);
  const [isOpen, setIsOpen] = useState(initialLoaded ? initialLoaded.isOpen : false);
  const [messages, setMessages] = useState(initialLoaded ? initialLoaded.messages : createInitialMessages(user));
  const [input, setInput] = useState(initialLoaded ? initialLoaded.input : '');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  // Clean up legacy shared key on mount
  useEffect(() => {
    try {
      sessionStorage.removeItem('matrixAiChatState_v1');
    } catch (e) {
      // ignore
    }
  }, []);

  // Switch before paint so one account never sees another account's messages.
  useLayoutEffect(() => {
    const nextKey = currentKey;
    if (activeUserKey !== nextKey) {
      const nextLoaded = nextKey === 'guest' ? null : loadSavedState(nextKey, user);
      if (nextLoaded) {
        setMessages(nextLoaded.messages);
        setInput(nextLoaded.input || '');
        setIsOpen(nextLoaded.isOpen);
      } else {
        setMessages(createInitialMessages(user));
        setInput('');
        setIsOpen(false);
      }
      setLoading(false);
      setActiveUserKey(nextKey);
    }
  }, [currentKey, user, activeUserKey]);

  // Persist current user's chat state isolated to their specific user key
  useEffect(() => {
    if (!activeUserKey || activeUserKey !== currentKey || currentKey === 'guest') return;
    try {
      sessionStorage.setItem(
        `matrixAiChatState_${activeUserKey}`,
        JSON.stringify({ messages, input, isOpen })
      );
    } catch (err) {
      // ignore storage errors
    }
  }, [messages, input, isOpen, activeUserKey, currentKey]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const toggleChat = () => {
    setIsOpen((prev) => !prev);
  };

  const clearChat = () => {
    const freshMessages = createInitialMessages(user);
    setMessages(freshMessages);
    setInput('');
    setIsOpen(true);
    try {
      sessionStorage.removeItem(`matrixAiChatState_${activeUserKey}`);
      sessionStorage.removeItem('matrixAiChatState_v1');
    } catch (err) {
      // ignore storage errors
    }
  };

  const tutorPrompts = [
    '📚 What exam is my batch writing today?',
    '📅 What is the exam timetable for my batch?',
    '👥 My Batch Students'
  ];

  const studentPrompts = [
    '🎓 Where is my hall?',
    '🪑 What is my seat number?',
    '📅 When is my next exam?',
    '📋 My Exam Schedule'
  ];

  const adminPrompts = [
    '📊 Show total students and halls',
    '🏆 Which hall has the highest number of students?',
    '🧮 Show total students across all halls',
    '📅 Who are today invigilators?',
    '🧮 What is today allocation status?'
  ];

  const defaultPrompts = [
    '🎓 Where is my hall?',
    '📅 Inaiku enna exam?',
    '📊 Show total students and halls'
  ];

  const quickPrompts = isTutor ? tutorPrompts : (isStudent ? studentPrompts : (user ? adminPrompts : defaultPrompts));

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (textToSend) => {
    const text = textToSend || input;
    if (!text.trim() || loading) return;
    const requestUserKey = currentKey;

    const userMsg = {
      id: Date.now().toString(),
      sender: 'user',
      text: text.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const data = await api.post(isStudentPortal ? '/ai/student-chat' : '/ai/chat', { message: text });

      if (activeUserKeyRef.current !== requestUserKey) return;
      if (data && data.reply) {
        setMessages((prev) => [
          ...prev,
          {
            id: (Date.now() + 1).toString(),
            sender: 'ai',
            text: data.reply,
            type: data.type,
            hallCounts: data.hallCounts,
            allocationSession: data.session,
            student: data.student,
            allocations: data.allocations,
            schedule: data.schedule,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        throw new Error(data.error || 'No response from AI');
      }
    } catch (error) {
      if (activeUserKeyRef.current !== requestUserKey) return;
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'ai',
          text: error instanceof Error && error.message
            ? `⚠️ ${error.message}`
            : '⚠️ I encountered an issue connecting to the system server. Please try again.',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      if (activeUserKeyRef.current === requestUserKey) setLoading(false);
    }
  };

  const renderFormattedText = (text) => {
    if (!text) return null;

    const renderInline = (segment, keyPrefix) => {
      const parts = segment.split(/(\*\*.*?\*\*|`.*?`)/g);
      return parts.map((part, pIdx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={`${keyPrefix}-${pIdx}`} style={{ color: '#ffffff' }}>{part.slice(2, -2)}</strong>;
        } else if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={`${keyPrefix}-${pIdx}`}
              style={{
                background: 'rgba(99, 102, 241, 0.2)',
                color: '#818cf8',
                padding: '2px 6px',
                borderRadius: '4px',
                fontSize: '0.85em',
                fontFamily: 'monospace'
              }}
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        return part;
      });
    };

    const lines = text.split('\n');
    const elements = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if this line is part of a markdown table (starts and ends with '|')
      if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
        const tableLines = [];
        while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }

        if (tableLines.length >= 2) {
          const parseRow = (rowStr) =>
            rowStr
              .slice(1, -1)
              .split('|')
              .map((c) => c.trim());

          const headerCells = parseRow(tableLines[0]);
          let startIndex = 1;
          if (tableLines.length > 1 && tableLines[1].includes('---')) {
            startIndex = 2;
          }
          const bodyRows = tableLines.slice(startIndex).map(parseRow);

          elements.push(
            <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '10px 0' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '11px',
                  background: 'rgba(15, 23, 42, 0.7)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <thead>
                  <tr style={{ background: 'rgba(99, 102, 241, 0.2)' }}>
                    {headerCells.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        style={{
                          padding: '6px 8px',
                          textAlign: 'left',
                          color: '#c7d2fe',
                          fontWeight: '600',
                          borderBottom: '1px solid rgba(255, 255, 255, 0.15)'
                        }}
                      >
                        {renderInline(h, `th-${hIdx}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bodyRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        borderBottom: rIdx < bodyRows.length - 1 ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
                        background: rIdx % 2 === 1 ? 'rgba(255, 255, 255, 0.02)' : 'transparent'
                      }}
                    >
                      {row.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            padding: '6px 8px',
                            color: '#e2e8f0',
                            whiteSpace: cIdx === 0 ? 'nowrap' : 'normal'
                          }}
                        >
                          {renderInline(cell, `td-${rIdx}-${cIdx}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
          continue;
        }
      }

      // Normal paragraph line
      elements.push(
        <p key={`p-${i}`} style={{ margin: '0 0 6px 0', lineHeight: '1.55' }}>
          {renderInline(line, `line-${i}`)}
        </p>
      );
      i++;
    }

    return elements;
  };

  return (
    <div className="ai-chatbox-wrapper">
      {/* Floating Trigger Button (displayed when chat is closed) */}
      {!isOpen && (
        <button
          type="button"
          className="ai-chat-trigger"
          onClick={toggleChat}
          title="Open Matrix AI Assistant"
        >
          <div className="ai-trigger-pulse" />
          <svg className="ai-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
          <span className="ai-trigger-label">Matrix AI</span>
        </button>
      )}

      {/* Floating Chat Modal */}
      {isOpen && (
        <div className="ai-chat-window">
          {/* Header */}
          <div className="ai-chat-header">
            <div className="ai-header-info">
              <div className="ai-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a2 2 0 012 2v2a2 2 0 01-2 2 2 2 0 01-2-2V4a2 2 0 012-2zM4.93 10.93a10 10 0 0114.14 0M7.76 13.76a6 6 0 018.48 0M12 18v3m-3 0h6" />
                </svg>
              </div>
              <div>
                <h4 className="ai-title">Matrix AI Assistant</h4>
                <div className="ai-status">
                  <span className="online-dot" /> Online • Hall Matrix Intelligence
                </div>
              </div>
            </div>
            <div className="ai-header-actions">
              <button
                type="button"
                className="ai-clear-btn"
                onClick={clearChat}
                title="Refresh Chat (Start new conversation)"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Refresh</span>
              </button>
              <button
                type="button"
                className="ai-close-btn"
                onClick={() => setIsOpen(false)}
                title="Close Matrix AI"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div className="ai-chat-body">
            {messages.map((msg) => (
              <div key={msg.id} className={`ai-message-row ${msg.sender}`}>
                <div className="ai-message-bubble">
                  {renderFormattedText(msg.text)}

                  {msg.type === 'hall_count_analysis' && msg.hallCounts?.length > 0 && (
                    <div className="ai-hall-counts">
                      {msg.allocationSession && (
                        <div className="ai-hall-counts-session">
                          Exam allocation: {msg.allocationSession.exam_date} · {msg.allocationSession.session}
                        </div>
                      )}
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">Examination Hall</th>
                            <th scope="col">Student Count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {msg.hallCounts.map((hall) => (
                            <tr key={hall.hallNo}>
                              <td>{hall.hallNo}</td>
                              <td>{hall.studentCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Interactive Student Hall & Seating Card */}
                  {msg.type === 'student_hall_allocation' && (
                    <div style={{
                      marginTop: '12px',
                      background: 'rgba(15, 23, 42, 0.75)',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      borderRadius: '12px',
                      padding: '14px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      backdropFilter: 'blur(10px)'
                    }}>
                      {msg.allocations && msg.allocations.length > 0 ? (
                        <>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '10px',
                            marginBottom: '12px'
                          }}>
                            <div style={{
                              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(5, 150, 105, 0.15))',
                              border: '1px solid rgba(16, 185, 129, 0.45)',
                              borderRadius: '10px',
                              padding: '10px 12px',
                              textAlign: 'center'
                            }}>
                              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#6ee7b7', fontWeight: '700', letterSpacing: '0.5px' }}>
                                🏛️ Hall Number
                              </div>
                              <div style={{ fontSize: '20px', fontWeight: '800', color: '#ffffff', margin: '3px 0' }}>
                                {msg.allocations[0].hall_no}
                              </div>
                              {msg.allocations[0].block && (
                                <div style={{ fontSize: '11px', color: '#a7f3d0' }}>Block {msg.allocations[0].block}</div>
                              )}
                            </div>

                            <div style={{
                              background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.25), rgba(14, 116, 144, 0.15))',
                              border: '1px solid rgba(6, 182, 212, 0.45)',
                              borderRadius: '10px',
                              padding: '10px 12px',
                              textAlign: 'center'
                            }}>
                              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#67e8f9', fontWeight: '700', letterSpacing: '0.5px' }}>
                                🪑 Seat Number
                              </div>
                              <div style={{ fontSize: '20px', fontWeight: '800', color: '#ffffff', margin: '3px 0' }}>
                                {msg.allocations[0].seat_label}
                              </div>
                              <div style={{ fontSize: '11px', color: '#a5f3fc' }}>{msg.allocations[0].session} Session</div>
                            </div>
                          </div>

                          {/* Student Profile Analysis Tags */}
                          {msg.student && (
                            <div style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '6px',
                              marginBottom: '12px'
                            }}>
                              <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#cbd5e1' }}>
                                Reg: <strong style={{ color: '#ffffff' }}>{msg.student.regno}</strong>
                              </span>
                              <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#cbd5e1' }}>
                                Dept: <strong style={{ color: '#ffffff' }}>{msg.student.dept}</strong>
                              </span>
                              <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#cbd5e1' }}>
                                Batch: <strong style={{ color: '#ffffff' }}>{msg.student.batch}</strong>
                              </span>
                              <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '6px', color: '#a5b4fc' }}>
                                Subject: <strong style={{ color: '#ffffff' }}>{msg.student.subject_code}</strong>
                              </span>
                            </div>
                          )}

                          <button
                            onClick={() => {
                              setIsOpen(false);
                              navigate('/student/dashboard');
                            }}
                            style={{
                              width: '100%',
                              padding: '9px 14px',
                              background: 'linear-gradient(135deg, #10b981, #059669)',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '8px',
                              fontWeight: '700',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px',
                              transition: 'transform 0.15s ease'
                            }}
                          >
                            🎓 View Complete Schedule in Student Portal
                          </button>
                        </>
                      ) : (
                        <>
                          {msg.student && (
                            <div style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '6px',
                              marginBottom: '12px'
                            }}>
                              <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#cbd5e1' }}>
                                Reg: <strong style={{ color: '#ffffff' }}>{msg.student.regno}</strong>
                              </span>
                              <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#cbd5e1' }}>
                                Dept: <strong style={{ color: '#ffffff' }}>{msg.student.dept}</strong>
                              </span>
                              <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '6px', color: '#cbd5e1' }}>
                                Batch: <strong style={{ color: '#ffffff' }}>{msg.student.batch}</strong>
                              </span>
                              <span style={{ fontSize: '11px', padding: '4px 8px', background: 'rgba(99, 102, 241, 0.2)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '6px', color: '#a5b4fc' }}>
                                Subject: <strong style={{ color: '#ffffff' }}>{msg.student.subject_code}</strong>
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => {
                              setIsOpen(false);
                              navigate('/student/dashboard');
                            }}
                            style={{
                              width: '100%',
                              padding: '9px 14px',
                              background: 'rgba(255, 255, 255, 0.08)',
                              color: '#e2e8f0',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              borderRadius: '8px',
                              fontWeight: '600',
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            🎓 Go to Student Portal Dashboard
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {/* Interactive Student Portal Prompt Button */}
                  {msg.type === 'student_portal_prompt' && (
                    <div style={{ marginTop: '12px' }}>
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate('/student/login');
                        }}
                        style={{
                          width: '100%',
                          padding: '9px 14px',
                          background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: '700',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        🔑 Open Student Login Portal
                      </button>
                    </div>
                  )}

                  {/* Interactive Student Profile Card Button */}
                  {msg.type === 'student_profile' && msg.student && (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate('/student/dashboard', { state: { student: msg.student } });
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 14px',
                          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: '600',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        👁️ Open Full Student Profile
                      </button>
                    </div>
                  )}

                  {/* Interactive Exam Schedule Card Button */}
                  {msg.type === 'exam_schedule' && (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate('/allocation');
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 14px',
                          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: '600',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        🧮 Go to Allocation Manager
                      </button>
                    </div>
                  )}

                  {/* Interactive Tutor Dashboard Card Button */}
                  {(msg.type === 'tutor_today_exam' || msg.type === 'tutor_timetable') && (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        onClick={() => {
                          setIsOpen(false);
                          navigate('/tutor/dashboard');
                        }}
                        style={{
                          width: '100%',
                          padding: '8px 14px',
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: '600',
                          fontSize: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        📋 View My Students in Tutor Dashboard
                      </button>
                    </div>
                  )}

                  <span className="ai-msg-time">{msg.timestamp}</span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="ai-message-row ai">
                <div className="ai-message-bubble ai-typing">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestion Chips */}
          <div className="ai-chips-container">
            {quickPrompts.map((chip, idx) => (
              <button
                key={idx}
                className="ai-chip"
                onClick={() => handleSendMessage(chip.replace(/^[^\w]+/, '').trim())}
                disabled={loading}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Input Footer */}
          <form
            className="ai-chat-footer"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <input
              type="text"
              className="ai-input"
              placeholder="Ask Matrix AI anything..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
            />
            <button
              type="submit"
              className="ai-send-btn"
              disabled={!input.trim() || loading}
              title="Send Message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3 21l18-9L3 3l3 9zm0 0h8" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
