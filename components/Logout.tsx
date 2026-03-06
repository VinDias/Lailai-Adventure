
import React from 'react';

interface LogoutProps {
  onLogout: () => void;
  onCancel: () => void;
}

const Logout: React.FC<LogoutProps> = ({ onLogout, onCancel }) => {
  return (
    <div className="min-h-screen w-full bg-[#0A0A0B] flex items-center justify-center p-6 font-inter animate-apple">
      <div className="w-full max-w-sm bg-[#1C1C1E] rounded-[3rem] p-12 border border-white/5 text-center shadow-2xl relative overflow-hidden">
        {/* Detalhe de luz de fundo */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 blur-[60px] rounded-full" />
        
        <div className="w-24 h-24 bg-rose-600/10 rounded-[2rem] flex items-center justify-center mx-auto mb-10 text-rose-500">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </div>

        <h2 className="text-3xl font-extrabold mb-4 tracking-tight">Deseja sair?</h2>
        <p className="text-zinc-500 text-sm mb-12 leading-relaxed">
          Sua sessão será encerrada. Você precisará entrar novamente para acessar seus conteúdos salvos e Academia.
        </p>

        <div className="space-y-4">
          <button 
            onClick={onLogout}
            className="w-full bg-rose-600 hover:bg-rose-500 text-white font-black py-5 rounded-[1.5rem] transition-all shadow-xl shadow-rose-900/20 active:scale-95"
          >
            Sair agora
          </button>
          <button 
            onClick={onCancel}
            className="w-full bg-transparent text-zinc-500 font-bold py-4 hover:text-white transition-all active:scale-95"
          >
            Continuar assistindo
          </button>
        </div>
      </div>
    </div>
  );
};

export default Logout;
