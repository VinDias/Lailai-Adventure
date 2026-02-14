
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

  // Officially colored Google "G"
  const GoogleG = () => (
    <svg className="w-6 h-6" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );

  if (consentMode) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6 bg-black font-lailai animate-apple">
        <div className="w-full max-w-sm bg-[#1C1C1E] rounded-[2.5rem] p-10 border border-white/5 text-center shadow-2xl">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6">
            {consentMode === 'google' ? <GoogleG /> : <span className="text-2xl font-bold">M</span>}
          </div>
          <h2 className="text-2xl font-bold mb-4">Vincular Conta</h2>
          <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
            Você concorda em vincular sua conta do <strong>{consentMode === 'google' ? 'Google' : 'Hotmail'}</strong> ao LaiLai para um acesso rápido?
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
            <GoogleG />
            Entrar com Google
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
