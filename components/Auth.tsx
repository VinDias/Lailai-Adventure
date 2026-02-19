import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import BrandLogo from './BrandLogo';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await api.login({ email, password });
      onLogin(user);
    } catch (err: any) {
      alert(err.message || "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[var(--bg-color)] transition-colors duration-300">
      <style>{`
        .logo-container {
          text-align: center;
          margin-bottom: 30px;
        }

        .brand-name {
          font-size: 42px;
          font-weight: 600;
          margin: 0;
          color: var(--text-color);
          letter-spacing: -1px;
        }

        .brand-tagline {
          font-size: 14px;
          opacity: 0.7;
          margin-top: 6px;
          color: var(--text-color);
        }
      `}</style>

      <div className="w-full max-w-sm animate-apple">
        <div className="logo-container">
          <BrandLogo />
          <h1 className="brand-name">LaiLai</h1>
          <p className="brand-tagline">
            O Futuro É Aqui. Entretenimento Vertical.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="E-mail"
            className="w-full bg-[rgba(128,128,128,0.1)] border border-[rgba(128,128,128,0.1)] rounded-2xl px-5 py-4 focus:outline-none focus:border-rose-500 transition-all text-[var(--text-color)] placeholder-zinc-600"
          />
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Senha"
            className="w-full bg-[rgba(128,128,128,0.1)] border border-[rgba(128,128,128,0.1)] rounded-2xl px-5 py-4 focus:outline-none focus:border-rose-500 transition-all text-[var(--text-color)] placeholder-zinc-600"
          />
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-rose-600 text-white font-extrabold py-4 rounded-2xl transition-all hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-4 shadow-lg shadow-rose-900/20"
          >
            {loading ? <div className="w-5 h-5 border-2 border-black/30 border-t-white rounded-full animate-spin" /> : "Entrar"}
          </button>
        </form>

        <div className="mt-12 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-zinc-500 hover:text-rose-500 font-bold transition-colors text-sm"
          >
            {isLogin ? "Criar Conta" : "Já Tenho Uma Conta"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;