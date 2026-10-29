import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Sidebar = ({ publicTenantName }) => {
  const { user, logout } = useAuth();
  
  const brandName = user?.tenant_name || publicTenantName || 'Hall Matrix';

  return (
    <div className="sidebar">
      <div className="brand">
        <div className="logo">HM</div>
        <span>{brandName}</span>
      </div>

      <nav>
        {user ? (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
              Dashboard
            </NavLink>
            <NavLink to="/students" className={({ isActive }) => isActive ? 'active' : ''}>
              🎓 Students
            </NavLink>
            <NavLink to="/subjects" className={({ isActive }) => isActive ? 'active' : ''}>
              📘 Subjects
            </NavLink>
            <NavLink to="/halls" className={({ isActive }) => isActive ? 'active' : ''}>
              🏫 Halls
            </NavLink>
            <NavLink to="/allocation" className={({ isActive }) => isActive ? 'active font-semibold' : ''}>
              🧮 Allocation
            </NavLink>
            <details className="menu-item" style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer' }}>👥 Employee</summary>
              <div className="submenu" style={{ display: 'flex', flexDirection: 'column', marginLeft: 6 }}>
                <NavLink to="/employee/add" className={({ isActive }) => isActive ? 'active' : ''}>
                  Add
                </NavLink>
                <NavLink to="/employee/list" className={({ isActive }) => isActive ? 'active' : ''}>
                  List
                </NavLink>
              </div>
            </details>
            <a href="#logout" className="logout" onClick={(e) => { e.preventDefault(); logout(); }}>
              Logout
            </a>
          </>
        ) : (
          <>
            <NavLink to="/student/login" className="active">
              🎓 Student Portal
            </NavLink>
            <Link to="/login" className="logout">
              🔑 Admin Login
            </Link>
          </>
        )}
      </nav>
    </div>
  );
};
