import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AiChatBox } from './components/AiChatBox';
import { useAuth } from './hooks/useAuth';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Dashboard } from './pages/Dashboard';
import { Degrees } from './pages/Degrees';
import { Departments } from './pages/Departments';
import { Batches } from './pages/Batches';
import { BatchStudents } from './pages/BatchStudents';
import { AllStudents } from './pages/AllStudents';
import { Subjects } from './pages/Subjects';
import { Halls } from './pages/Halls';
import { Allocation } from './pages/Allocation';
import { AllocationPreview } from './pages/AllocationPreview';
import { StudentView } from './pages/StudentView';
import { StudentLogin } from './pages/StudentLogin';
import { StudentDashboard } from './pages/StudentDashboard';
import { AddEmployee } from './pages/AddEmployee';
import { EmployeeList } from './pages/EmployeeList';
import { TutorLogin } from './pages/TutorLogin';
import { TutorDashboard } from './pages/TutorDashboard';

// Loading Spinner Component
const FullLoadingSpinner = ({ text = "Loading Session Matrix..." }) => (
  <div style={{
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    background: 'var(--bg-app)',
    color: 'var(--text-muted)',
    fontSize: '18px'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid rgba(255,255,255,0.1)',
        borderTopColor: 'var(--accent-indigo)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        margin: '0 auto 15px'
      }} />
      {text}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  </div>
);

// Admin Protected Route wrapper component
const AdminProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <FullLoadingSpinner text="Authenticating Admin Session..." />;
  if (!user) return <Navigate to="/login" replace />;

  const isTutor = user.isTutor || String(user.role || '').toLowerCase().includes('tutor');
  if (isTutor) {
    return <Navigate to="/tutor/dashboard" replace />;
  }

  return children;
};

// Tutor Protected Route wrapper component
const TutorProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <FullLoadingSpinner text="Authenticating Tutor Portal..." />;
  if (!user) return <Navigate to="/tutor/login" replace />;

  const isTutor = user.isTutor || String(user.role || '').toLowerCase().includes('tutor');
  if (!isTutor) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Public route helper for registration
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (user) {
    const isTutor = user.isTutor || String(user.role || '').toLowerCase().includes('tutor');
    return <Navigate to={isTutor ? "/tutor/dashboard" : "/dashboard"} replace />;
  }

  return children;
};

function App() {
  return (
    <>
      <Routes>
        {/* Public Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        } />

        {/* Student Portal Routes */}
        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/dashboard" element={<StudentDashboard />} />

        {/* Tutor Portal Routes */}
        <Route path="/tutor/login" element={<TutorLogin />} />
        <Route path="/tutor/dashboard" element={
          <TutorProtectedRoute>
            <TutorDashboard />
          </TutorProtectedRoute>
        } />

        {/* Private Admin Dashboard Routes */}
        <Route path="/dashboard" element={
          <AdminProtectedRoute>
            <Dashboard />
          </AdminProtectedRoute>
        } />
        <Route path="/students" element={
          <AdminProtectedRoute>
            <AllStudents />
          </AdminProtectedRoute>
        } />
        <Route path="/students/hierarchy" element={
          <AdminProtectedRoute>
            <Degrees />
          </AdminProtectedRoute>
        } />
        <Route path="/students/degree/:degreeName" element={
          <AdminProtectedRoute>
            <Departments />
          </AdminProtectedRoute>
        } />
        <Route path="/students/degree/:degreeName/dept/:deptName" element={
          <AdminProtectedRoute>
            <Batches />
          </AdminProtectedRoute>
        } />
        <Route path="/students/degree/:degreeName/dept/:deptName/batch/:batchName" element={
          <AdminProtectedRoute>
            <BatchStudents />
          </AdminProtectedRoute>
        } />
        <Route path="/students/all" element={<Navigate to="/students" replace />} />
        <Route path="/admin/dashboard/students" element={<Navigate to="/students" replace />} />
        <Route path="/admin/dashboard/student/edit" element={<Navigate to="/students" replace />} />
        <Route path="/subjects" element={
          <AdminProtectedRoute>
            <Subjects />
          </AdminProtectedRoute>
        } />
        <Route path="/admin/dashboard/subjects" element={<Navigate to="/subjects" replace />} />
        <Route path="/halls" element={
          <AdminProtectedRoute>
            <Halls />
          </AdminProtectedRoute>
        } />
        <Route path="/allocation" element={
          <AdminProtectedRoute>
            <Allocation />
          </AdminProtectedRoute>
        } />
        <Route path="/employee/add" element={
          <AdminProtectedRoute>
            <AddEmployee />
          </AdminProtectedRoute>
        } />
        <Route path="/employee/list" element={
          <AdminProtectedRoute>
            <EmployeeList />
          </AdminProtectedRoute>
        } />
        <Route path="/allocation/preview" element={
          <AdminProtectedRoute>
            <AllocationPreview />
          </AdminProtectedRoute>
        } />

        {/* Public Student Seating search portal */}
        <Route path="/t/:tenant_id/student-view" element={<StudentView />} />

        {/* Redirect wildcards */}
        <Route path="/" element={<Navigate to="/student/login" replace />} />
        <Route path="*" element={<Navigate to="/student/login" replace />} />
      </Routes>
      <AiChatBox />
    </>
  );
}

export default App;
