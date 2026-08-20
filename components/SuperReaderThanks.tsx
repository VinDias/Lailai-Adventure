import React from 'react';
import { useT } from '../contexts/I18nContext';

interface SuperReaderThanksProps {
  onClose: () => void;
}

/**
 * Cartão de agradecimento pós-checkout do Super Reader (Fase 4, Bloco 3).
 * App.tsx mostra este componente quando o boot detecta `?superreader=success`
 * (ver utils/superReaderReturn.ts) — mesmo trecho que consome o deep link de
 * push. Visual e z-index (1600, acima do modal de detalhe de série em
 * z-[1500] e abaixo do leitor em 2000) copiados de components/PushPrompt.tsx.
 */
const SuperReaderThanks: React.FC<SuperReaderThanksProps> = ({ onClose }) => {
  const t = useT();

  return (
    <div
      data-testid="superreader-thanks"
      className="fixed left-0 right-0 z-[1600] p-4 animate-apple"
      style={{ bottom: 'calc(7rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="max-w-md mx-auto bg-[#141416] border border-white/10 rounded-3xl p-5 shadow-2xl">
        <p className="text-sm font-black text-white mb-1">{t('superReader.thanksTitle')}</p>
        <p className="text-sm text-zinc-400 leading-relaxed mb-4">{t('superReader.thanksBody')}</p>
        <button
          onClick={onClose}
          className="w-full py-3 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl text-xs uppercase tracking-widest transition-all"
        >
          {t('superReader.close')}
        </button>
      </div>
    </div>
  );
};

export default SuperReaderThanks;
