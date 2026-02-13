
import React, { useState } from 'react';
import { User } from '../types';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [consentMode, setConsentMode] = useState<null | 'google' | 'microsoft'>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      const mockUser: User = {
        id: Date.now(),
        email: email,
        name: email.split('@')[0],
        isPremium: false,
        avatar: `https://picsum.photos/seed/${email}/200`
      };
      onLogin(mockUser);
      setLoading(false);
    }, 1200);
  };

  const handleSocialLogin = (provider: 'google' | 'microsoft') => {
    setConsentMode(provider);
  };

  const confirmConsent = () => {
    setLoading(true);
    setTimeout(() => {
      const providerEmail = consentMode === 'google' ? 'usuario@gmail.com' : 'usuario@hotmail.com';
      const mockUser: User = {
        id: Date.now(),
        email: providerEmail,
        name: 'Usuário ' + (consentMode === 'google' ? 'Google' : 'Hotmail'),
        isPremium: false,
        avatar: `https://picsum.photos/seed/${providerEmail}/200`
      };
      onLogin(mockUser);
      setLoading(false);
    }, 1000);
  };

  if (consentMode) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6 bg-black font-lailai animate-apple">
        <div className="w-full max-w-sm bg-[#1C1C1E] rounded-[2.5rem] p-10 border border-white/5 text-center shadow-2xl">
          <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-6 text-2xl">
            {consentMode === 'google' ? 'G' : 'M'}
          </div>
          <h2 className="text-2xl font-bold mb-4">Vincular Conta</h2>
          <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
            Você concorda em vincular sua conta do <strong>{consentMode === 'google' ? 'Gmail' : 'Hotmail'}</strong> ao LaiLai para um acesso rápido?
          </p>
          <div className="space-y-3">
            <button 
              onClick={confirmConsent}
              className="w-full bg-white text-black font-black py-4 rounded-2xl transition-all hover:bg-zinc-200"
            >
              Sim, eu concordo
            </button>
            <button 
              onClick={() => setConsentMode(null)}
              className="w-full bg-transparent text-zinc-500 font-bold py-3 hover:text-white transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-black font-lailai">
      <div className="w-full max-sm animate-apple">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-white rounded-[1.25rem] mx-auto flex items-center justify-center mb-8 shadow-2xl">
            <span className="text-2xl font-black text-black italic">LL</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-3 text-white">LaiLai</h1>
          <p className="text-zinc-500 font-medium">Arte vertical para a era moderna.</p>
        </div>

        <div className="space-y-3 mb-8">
           <button 
            onClick={() => handleSocialLogin('google')}
            className="w-full bg-[#1C1C1E] border border-white/5 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#2C2C2E] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.908 3.152-1.928 4.176-1.288 1.288-3.312 2.696-7.392 2.696-6.48 0-11.584-5.232-11.584-11.712s5.104-11.712 11.584-11.712c3.504 0 6.176 1.392 8.056 3.184l2.312-2.312c-2.184-2.088-5.072-3.712-10.368-3.712-9.44 0-17.28 7.68-17.28 17.12s7.84 17.12 17.28 17.12c5.112 0 8.976-1.688 12.232-5.072 3.328-3.328 4.392-7.992 4.392-11.664 0-.744-.064-1.464-.184-2.136h-16.44z" />
            </svg>
            Entrar com Gmail
          </button>
          <button 
            onClick={() => handleSocialLogin('microsoft')}
            className="w-full bg-[#1C1C1E] border border-white/5 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#2C2C2E] transition-all"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
            </svg>
            Entrar com Hotmail
          </button>
        </div>

        <div className="flex items-center gap-4 mb-8">
          <div className="h-px flex-1 bg-white/5" />
          <span className="text-[10px] font-bold text-zinc-700 uppercase tracking-widest">Ou com e-mail</span>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="E-mail"
              className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-5 py-4 focus:outline-none focus:border-zinc-700 transition-all text-white placeholder-zinc-600"
            />
          </div>
          <div className="space-y-2">
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Senha"
              className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-5 py-4 focus:outline-none focus:border-zinc-700 transition-all text-white placeholder-zinc-600"
            />
          </div>
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-extrabold py-4 rounded-2xl transition-all hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-4"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              isLogin ? "Entrar" : "Criar Conta"
            )}
          </button>
        </form>

        <div className="mt-12 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-zinc-500 hover:text-white font-bold transition-colors text-sm"
          >
            {isLogin ? "Não tem uma conta? Crie uma" : "Já tem uma conta? Entre agora"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
