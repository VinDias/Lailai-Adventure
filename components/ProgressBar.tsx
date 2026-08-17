import React from 'react';

/** Barra fina de progresso — some quando a obra ainda não foi começada. */
const ProgressBar: React.FC<{ percent: number }> = ({ percent }) => {
  if (!percent || percent <= 0) return null;
  const largura = Math.min(100, Math.max(0, percent * 100));

  return (
    <div className="w-full h-1 bg-[var(--border-color)] rounded-full overflow-hidden" aria-hidden="true">
      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${largura}%` }} />
    </div>
  );
};

export default ProgressBar;
