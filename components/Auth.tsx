import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import BrandLogo from './BrandLogo';

interface AuthProps {
  onLogin: (user: User) => void;
}

const inputClass = "w-full bg-[rgba(128,128,128,0.1)] border border-[rgba(128,128,128,0.1)] rounded-2xl px-5 py-4 focus:outline-none focus:border-rose-500 transition-all text-[var(--text-color)] placeholder-zinc-600";

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = isLogin
        ? await api.login({ email, password })
        : await api.register({ email, password, nome });
      onLogin(user);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('409') || msg.toLowerCase().includes('já está cadastrado')) setError('Este e-mail já está cadastrado.');
      else if (msg.includes('401') || msg.toLowerCase().includes('senha')) setError('E-mail ou senha incorretos.');
      else setError(msg || 'Erro ao processar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(v => !v);
    setError('');
    setEmail('');
    setPassword('');
    setNome('');
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[var(--bg-color)] transition-colors duration-300">
      <div className="w-full max-w-sm animate-apple">
        <div className="text-center mb-10">
          <BrandLogo />
          <h1 className="text-4xl font-semibold mt-4 text-[var(--text-color)] tracking-tight">Lorflux</h1>
          <p className="text-sm opacity-60 mt-2 text-[var(--text-color)]">Cinematic Comics. O futuro é aqui.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <input
              type="text"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
              placeholder="Seu nome"
              className={inputClass}
            />
          )}
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            placeholder="E-mail"
            className={inputClass}
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="Senha"
            className={inputClass}
          />

          {error && (
            <p className="text-rose-500 text-xs font-bold text-center px-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-rose-600 text-white font-extrabold py-4 rounded-2xl transition-all hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-2 shadow-lg shadow-rose-900/20"
          >
            {loading
              ? <div className="w-5 h-5 border-2 border-black/30 border-t-white rounded-full animate-spin" />
              : isLogin ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>

        <div className="mt-10 text-center">
          <button
            onClick={switchMode}
            className="text-zinc-500 hover:text-rose-500 font-bold transition-colors text-sm"
          >
            {isLogin ? 'Não tem conta? Criar agora' : 'Já tenho uma conta'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
