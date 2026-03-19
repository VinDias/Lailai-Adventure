import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import BrandLogo from './BrandLogo';

interface AuthProps {
  onLogin: (user: User) => void;
}

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const inputClass = "w-full bg-[rgba(128,128,128,0.1)] border border-[rgba(128,128,128,0.1)] rounded-2xl px-5 py-4 focus:outline-none focus:border-rose-500 transition-all text-[var(--text-color)] placeholder-zinc-600";

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  // Detecta token de reset na URL (ex: /redefinir-senha?token=xxx)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setResetToken(token);
      setMode('reset');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const reset = () => { setError(''); setSuccess(''); };

  const switchMode = (next: Mode) => {
    reset();
    setEmail(''); setPassword(''); setNome(''); setNewPassword('');
    setMode(next);
  };

  const handleLoginRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setLoading(true);
    try {
      const user = mode === 'login'
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

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    setLoading(true);
    try {
      const res = await api.forgotPassword(email);
      setSuccess(res.message);
    } catch {
      setError('Erro ao enviar e-mail. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    if (newPassword.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); return; }
    setLoading(true);
    try {
      await api.resetPassword(resetToken, newPassword);
      setSuccess('Senha redefinida com sucesso! Faça login.');
      setTimeout(() => switchMode('login'), 2000);
    } catch (err: any) {
      setError(err.message || 'Link inválido ou expirado.');
    } finally {
      setLoading(false);
    }
  };

  const header = (
    <div className="text-center mb-10">
      <BrandLogo />
      <h1 className="text-4xl font-semibold mt-4 text-[var(--text-color)] tracking-tight">Lorflux</h1>
      <p className="text-sm opacity-60 mt-2 text-[var(--text-color)]">Cinematic Comics. O futuro é aqui.</p>
    </div>
  );

  const feedback = (
    <>
      {error   && <p className="text-rose-500 text-xs font-bold text-center px-2">{error}</p>}
      {success && <p className="text-emerald-400 text-xs font-bold text-center px-2">{success}</p>}
    </>
  );

  const spinner = <div className="w-5 h-5 border-2 border-black/30 border-t-white rounded-full animate-spin" />;

  // ── Redefinir senha ────────────────────────────────────────────────────────
  if (mode === 'reset') return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[var(--bg-color)] transition-colors duration-300">
      <div className="w-full max-w-sm animate-apple">
        {header}
        <form onSubmit={handleReset} className="space-y-3">
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
            required minLength={6} placeholder="Nova senha" className={inputClass} />
          {feedback}
          <button type="submit" disabled={loading}
            className="w-full bg-rose-600 text-white font-extrabold py-4 rounded-2xl transition-all hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-2">
            {loading ? spinner : 'Redefinir Senha'}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => switchMode('login')} className="text-zinc-500 hover:text-rose-500 font-bold transition-colors text-sm">
            Voltar ao login
          </button>
        </div>
      </div>
    </div>
  );

  // ── Esqueci minha senha ────────────────────────────────────────────────────
  if (mode === 'forgot') return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[var(--bg-color)] transition-colors duration-300">
      <div className="w-full max-w-sm animate-apple">
        {header}
        <p className="text-sm text-zinc-400 text-center mb-6">Informe seu e-mail e enviaremos um link para redefinir sua senha.</p>
        <form onSubmit={handleForgot} className="space-y-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            required placeholder="E-mail" className={inputClass} />
          {feedback}
          <button type="submit" disabled={loading || !!success}
            className="w-full bg-rose-600 text-white font-extrabold py-4 rounded-2xl transition-all hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-2">
            {loading ? spinner : 'Enviar link'}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => switchMode('login')} className="text-zinc-500 hover:text-rose-500 font-bold transition-colors text-sm">
            Voltar ao login
          </button>
        </div>
      </div>
    </div>
  );

  // ── Login / Cadastro ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-[var(--bg-color)] transition-colors duration-300">
      <div className="w-full max-w-sm animate-apple">
        {header}
        <form onSubmit={handleLoginRegister} className="space-y-3">
          {mode === 'register' && (
            <input type="text" value={nome} onChange={e => setNome(e.target.value)}
              required placeholder="Seu nome" className={inputClass} />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            required placeholder="E-mail" className={inputClass} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            required minLength={6} placeholder="Senha" className={inputClass} />

          {feedback}

          <button type="submit" disabled={loading}
            className="w-full bg-rose-600 text-white font-extrabold py-4 rounded-2xl transition-all hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-2 shadow-lg shadow-rose-900/20">
            {loading ? spinner : mode === 'login' ? 'Entrar' : 'Criar Conta'}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-3">
          {mode === 'login' && (
            <button onClick={() => switchMode('forgot')} className="text-zinc-600 hover:text-rose-500 font-bold transition-colors text-xs">
              Esqueci minha senha
            </button>
          )}
          <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-zinc-500 hover:text-rose-500 font-bold transition-colors text-sm">
            {mode === 'login' ? 'Não tem conta? Criar agora' : 'Já tenho uma conta'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
