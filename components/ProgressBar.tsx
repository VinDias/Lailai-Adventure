import React from 'react';

/** Barra fina de progresso — some quando a obra ainda não foi começada. */
const ProgressBar: React.FC<{ percent: number }> = ({ percent }) => {
  if (!percent || percent <= 0) return null;
  const largura = Math.min(100, Math.max(0, percent * 100));

  return (
    // Achado da revisão: o trilho usava --border-color, que no tema escuro é
    // branco a 5% de opacidade — quase invisível justamente no tema padrão do
    // app. zinc-500/30 mantém contraste razoável nos dois temas.
    <div
      data-testid="progress-bar"
      className="w-full h-1 bg-zinc-500/30 rounded-full overflow-hidden"
      aria-hidden="true"
    >
      <div className="h-full bg-rose-500 rounded-full" style={{ width: `${largura}%` }} />
    </div>
  );
};

export default ProgressBar;
