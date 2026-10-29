import React, { createContext, useState, useEffect } from 'react';
import { api } from '../utils/api';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkSession = async () => {
    try {
      const isStudentPortal = window.location.pathname.startsWith('/student/') &&
        window.location.pathname !== '/student/login';
      const data = isStudentPortal
        ? await api.get('/auth/student-me')
        : await api.get('/auth/me');
      if (data.student) {
        setUser({ ...data.student, isStudent: true, role: 'student' });
      } else if (data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const login = async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    if (data.user) {
      setUser(data.user);
    }
    return data;
  };

  const tutorLogin = async (username, password) => {
    const data = await api.post('/auth/tutor-login', { username, password });
    if (data.user || data.tutor) {
      setUser(data.user || data.tutor);
    }
    return data;
  };

  const setStudentSession = (student) => {
    if (student) {
      setUser({ ...student, isStudent: true, role: 'student' });
    }
  };

  const logout = async () => {
    const isTutor = user?.isTutor || user?.role?.toLowerCase().includes('tutor');
    const isStudent = user?.isStudent || user?.role?.toLowerCase().includes('student') || user?.regno;
    try {
      // Clear AI chat session states on logout to guarantee complete privacy
      try {
        Object.keys(sessionStorage).forEach((k) => {
          if (k.startsWith('matrixAiChatState_')) {
            sessionStorage.removeItem(k);
          }
        });
      } catch (e) {
        // ignore storage errors
      }

      if (isTutor) {
        await api.post('/auth/tutor-logout');
      } else if (isStudent) {
        await api.post('/auth/student-logout');
      } else {
        await api.post('/auth/logout');
      }
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      setUser(null);
      window.location.href = isTutor ? '/tutor/login' : (isStudent ? '/student/login' : '/login');
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, tutorLogin, setStudentSession, logout, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
};
