import React, { useState } from 'react';

// Placeholder SVG inline — logo Lorflux centralizado em fundo escuro
const FALLBACK_SVG = (
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <rect width="200" height="200" fill="#0a0a0b" />
    {/* Logo mark */}
    <g transform="translate(55, 55) scale(0.088)">
      <rect x="128" y="128" width="768" height="768" rx="180"
        fill="none" stroke="#3f3f46" strokeWidth="24" />
      <path d="M360 300 H440 V620 H760 V700 H360 Z" fill="#3f3f46" />
      <g stroke="#0a0a0b" strokeWidth="12" strokeLinecap="round">
        <line x1="360" y1="340" x2="400" y2="340" />
        <line x1="360" y1="420" x2="400" y2="420" />
        <line x1="360" y1="500" x2="400" y2="500" />
        <line x1="360" y1="580" x2="400" y2="580" />
        <line x1="360" y1="380" x2="385" y2="380" />
        <line x1="360" y1="460" x2="385" y2="460" />
        <line x1="360" y1="540" x2="385" y2="540" />
        <line x1="420" y1="700" x2="420" y2="660" />
        <line x1="520" y1="700" x2="520" y2="660" />
        <line x1="620" y1="700" x2="620" y2="660" />
        <line x1="720" y1="700" x2="720" y2="660" />
        <line x1="470" y1="700" x2="470" y2="675" />
        <line x1="570" y1="700" x2="570" y2="675" />
        <line x1="670" y1="700" x2="670" y2="675" />
      </g>
    </g>
  </svg>
);

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
}

export default function ImageWithFallback({ src, alt, className, ...props }: Props) {
  const [failed, setFailed] = useState(!src);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-zinc-950 ${className ?? ''}`}>
        {FALLBACK_SVG}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
      {...props}
    />
  );
}
