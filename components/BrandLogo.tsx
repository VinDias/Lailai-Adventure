
import React from 'react';

export default function BrandLogo() {
  return (
    <div style={{ 
      textAlign: "center", 
      background: "#ffffff", 
      padding: "20px", 
      borderRadius: "24px", 
      marginBottom: "20px",
      display: "inline-block",
      boxShadow: "0 10px 30px rgba(0,0,0,0.1)"
    }}>
      <div
        style={{
          fontSize: "72px",
          fontWeight: "900",
          letterSpacing: "-2px",
          fontFamily: "'Helvetica Neue', 'Arial Black', sans-serif",
          color: "#000",
          textTransform: "uppercase",
          lineHeight: "1"
        }}
      >
        L
      </div>
    </div>
  );
}
