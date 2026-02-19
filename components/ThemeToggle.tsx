
import React from 'react';
import useTheme from "../hooks/useTheme";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <button
      onClick={toggleTheme}
      style={{
        position: "absolute",
        top: "15px",
        right: "15px",
        padding: "8px 14px",
        borderRadius: "20px",
        border: "1px solid rgba(128,128,128,0.2)",
        cursor: "pointer",
        zIndex: 5000,
        backgroundColor: theme === 'light' ? '#f0f0f0' : '#1c1c1e',
        color: theme === 'light' ? '#000' : '#fff',
        fontSize: '18px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        transition: 'all 0.3s ease'
      }}
      aria-label="Alternar Tema"
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}
