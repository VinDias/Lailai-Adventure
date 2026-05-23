import React, { useEffect, useState } from 'react';
import { getConsent, setConsent } from '../utils/consent';

interface ConsentBannerProps {
  onOpenPolicy: () => void;
}

/**
 * Banner de consentimento de cookies (LGPD).
 * Aparece até o usuário decidir. "Aceitar" habilita cookies de publicidade
 * (AdSense); "Rejeitar" mantém apenas cookies essenciais de sessão.
 */
const ConsentBanner: React.FC<ConsentBannerProps> = ({ onOpenPolicy }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const decide = (status: 'accepted' | 'rejected') => {
    setConsent(status);
    setVisible(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[5500] p-4 animate-apple" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}>
      <div className="max-w-2xl mx-auto bg-[#141416] border border-white/10 rounded-3xl p-5 shadow-2xl">
        <p className="text-sm text-zinc-300 leading-relaxed mb-4">
          Usamos cookies essenciais para o funcionamento da plataforma e, com o seu
          consentimento, cookies de publicidade. Você pode aceitar, rejeitar ou ler mais na{' '}
          <button onClick={onOpenPolicy} className="text-rose-400 underline font-bold">Política de Privacidade</button>.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => decide('accepted')}
            className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all"
          >Aceitar todos</button>
          <button
            onClick={() => decide('rejected')}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-zinc-200 font-black rounded-2xl text-xs uppercase tracking-widest transition-all border border-white/10"
          >Rejeitar não essenciais</button>
        </div>
      </div>
    </div>
  );
};

export default ConsentBanner;
