import React from 'react';
import { User as UserIcon, LogIn } from 'lucide-react';
import { useT } from '../contexts/I18nContext';

interface GuestAccountPromptProps {
  onLogin: () => void;
}

/**
 * Convite de conta mostrado na aba Conta (ViewMode.PROFILE) para quem está
 * no modo visitante (acesso sem conta). Substitui o perfil real — avatar,
 * Premium, favoritos, SuperReaderBadge, PushAccountToggle — nada disso faz
 * sentido sem conta; ver App.tsx (view === ViewMode.PROFILE && !user).
 * O seletor de idioma e os links de privacidade/termos continuam sendo
 * renderizados pelo App, fora deste componente — este é só o convite.
 */
const GuestAccountPrompt: React.FC<GuestAccountPromptProps> = ({ onLogin }) => {
  const t = useT();

  return (
    <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center">
      <div className="w-20 h-20 mx-auto mb-6 rounded-[2rem] bg-rose-600/15 border border-rose-500/30 flex items-center justify-center text-rose-500">
        <UserIcon size={32} />
      </div>
      <h2 className="text-2xl font-black text-[var(--text-color)] tracking-tight mb-3">
        {t('guest.title')}
      </h2>
      <p className="text-sm text-zinc-400 leading-relaxed mb-8">
        {t('guest.body')}
      </p>
      <button
        onClick={onLogin}
        className="w-full py-5 bg-rose-600 text-white font-black rounded-3xl hover:bg-rose-500 transition-all flex items-center justify-center gap-3"
      >
        <LogIn size={18} /> {t('guest.cta')}
      </button>
    </div>
  );
};

export default GuestAccountPrompt;
