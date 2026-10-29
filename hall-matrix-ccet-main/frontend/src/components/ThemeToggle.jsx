import React from 'react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle = ({ variant = 'sidebar', className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  if (variant === 'floating') {
    return (
      <div className={`theme-toggle-floating ${className}`}>
        <button
          type="button"
          onClick={toggleTheme}
          className="theme-toggle-btn floating"
          aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
          title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
        >
          <span className="theme-icon" aria-hidden="true">
            {isDark ? '☀️' : '🌙'}
          </span>
          <span className="theme-text">
            {isDark ? 'Light' : 'Dark'}
          </span>
        </button>
      </div>
    );
  }

  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={`theme-toggle-btn header ${className}`}
        aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
        title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
      >
        <span className="theme-icon" aria-hidden="true">
          {isDark ? '☀️' : '🌙'}
        </span>
        <span className="theme-text">
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </span>
      </button>
    );
  }

  // Default 'sidebar' variant
  return (
    <div className={`theme-toggle-sidebar ${className}`}>
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-toggle-btn sidebar"
        aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
        title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
      >
        <span className="theme-icon" aria-hidden="true">
          {isDark ? '☀️' : '🌙'}
        </span>
        <span className="theme-text">
          {isDark ? 'Light Mode' : 'Dark Mode'}
        </span>
      </button>
    </div>
  );
};
