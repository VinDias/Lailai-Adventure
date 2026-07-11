import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { api } from '../services/api';
import BrandLogo from './BrandLogo';
import { useSettings } from '../contexts/SettingsContext';
import { useT } from '../contexts/I18nContext';
import { loadGoogleSignIn } from '../utils/googleSignIn';

interface AuthProps {
  onLogin: (user: User) => void;
  onOpenPolicy?: (tab?: 'privacy' | 'terms') => void;
}

type Mode = 'login' | 'register' | 'forgot' | 'reset';

const inputClass = "w-full bg-[rgba(128,128,128,0.1)] border border-[rgba(128,128,128,0.1)] rounded-2xl px-5 py-4 focus:outline-none focus:border-rose-500 transition-all text-[var(--text-color)] placeholder-zinc-600";

const Auth: React.FC<AuthProps> = ({ onLogin, onOpenPolicy }) => {
  const t = useT();
  const { platform_tagline, google_client_id } = useSettings();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nome, setNome] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const googleBtnRef = useRef<HTMLDivElement>(null);

  // Botão "Entrar com Google" (GIS): só quando o client id está configurado.
  // O aceite dos Termos é apresentado como aviso junto ao botão (LGPD).
  useEffect(() => {
    if (!google_client_id || (mode !== 'login' && mode !== 'register')) return;
    let cancelled = false;

    loadGoogleSignIn()
      .then(() => {
        if (cancelled || !googleBtnRef.current) return;
        const gis = (window as any).google?.accounts?.id;
        if (!gis) return;
        gis.initialize({
          client_id: google_client_id,
          callback: async (resp: { credential: string }) => {
            setError('');
            setLoading(true);
            try {
              const user = await api.googleLogin(resp.credential);
              onLogin(user);
            } catch (err: any) {
              setError(err.message || t('auth.errorGoogle'));
            } finally {
              setLoading(false);
            }
          },
        });
        gis.renderButton(googleBtnRef.current, {
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          locale: 'pt-BR',
        });
      })
      .catch(() => { /* sem rede para o script do Google — segue só com e-mail/senha */ });

    return () => { cancelled = true; };
  }, [google_client_id, mode]);

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
    setEmail(''); setPassword(''); setNome(''); setNewPassword(''); setAcceptedTerms(false);
    setMode(next);
  };

  const handleLoginRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    if (mode === 'register' && !acceptedTerms) {
      setError(t('auth.errorTerms'));
      return;
    }
    setLoading(true);
    try {
      const user = mode === 'login'
        ? await api.login({ email, password })
        : await api.register({ email, password, nome, acceptedTerms });
      onLogin(user);
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('409') || msg.toLowerCase().includes('já está cadastrado')) setError(t('auth.errorEmailTaken'));
      else if (msg.includes('401') || msg.toLowerCase().includes('senha')) setError(t('auth.errorCredentials'));
      else setError(msg || t('auth.errorGeneric'));
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
    if (newPassword.length < 8) { setError('A senha deve ter no mínimo 8 caracteres.'); return; }
    setLoading(true);
    try {
      await api.resetPassword(resetToken, newPassword);
      setSuccess(t('auth.resetSuccess'));
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
      <p className="text-sm opacity-60 mt-2 text-[var(--text-color)]">{platform_tagline}</p>
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
            required minLength={8} placeholder={t('auth.newPasswordPlaceholder')} className={inputClass} />
          {feedback}
          <button type="submit" disabled={loading}
            className="w-full bg-rose-600 text-white font-extrabold py-4 rounded-2xl transition-all hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-2">
            {loading ? spinner : t('auth.resetPassword')}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => switchMode('login')} className="text-zinc-500 hover:text-rose-500 font-bold transition-colors text-sm">
            {t('auth.backToLogin')}
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
        <p className="text-sm text-zinc-400 text-center mb-6">{t('auth.forgotHint')}</p>
        <form onSubmit={handleForgot} className="space-y-3">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            required placeholder={t('auth.emailPlaceholder')} className={inputClass} />
          {feedback}
          <button type="submit" disabled={loading || !!success}
            className="w-full bg-rose-600 text-white font-extrabold py-4 rounded-2xl transition-all hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-2">
            {loading ? spinner : t('auth.sendLink')}
          </button>
        </form>
        <div className="mt-6 text-center">
          <button onClick={() => switchMode('login')} className="text-zinc-500 hover:text-rose-500 font-bold transition-colors text-sm">
            {t('auth.backToLogin')}
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
              required placeholder={t('auth.namePlaceholder')} className={inputClass} />
          )}
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            required placeholder={t('auth.emailPlaceholder')} className={inputClass} />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            required minLength={8} placeholder={t('auth.passwordPlaceholder')} className={inputClass} />

          {mode === 'register' && (
            <label className="flex items-start gap-3 px-1 py-1 text-xs text-zinc-400 leading-relaxed cursor-pointer">
              <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 accent-rose-600 w-4 h-4 shrink-0" />
              <span>
                {t('auth.acceptPrefix')}{' '}
                <button type="button" onClick={() => onOpenPolicy?.('terms')} className="text-rose-400 underline font-bold">{t('auth.terms')}</button>
                {' '}{t('auth.and')}{' '}
                <button type="button" onClick={() => onOpenPolicy?.('privacy')} className="text-rose-400 underline font-bold">{t('auth.privacy')}</button>.
              </span>
            </label>
          )}

          {feedback}

          <button type="submit" disabled={loading}
            className="w-full bg-rose-600 text-white font-extrabold py-4 rounded-2xl transition-all hover:bg-rose-500 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-2 shadow-lg shadow-rose-900/20">
            {loading ? spinner : mode === 'login' ? t('auth.login') : t('auth.createAccount')}
          </button>
        </form>

        {/* Entrar com Google — só aparece com google_client_id configurado */}
        {google_client_id && (
          <div data-testid="google-signin" className="mt-6 flex flex-col items-center gap-3">
            <div className="w-full flex items-center gap-3">
              <div className="flex-1 h-px bg-[var(--border-color)]" />
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('auth.or')}</span>
              <div className="flex-1 h-px bg-[var(--border-color)]" />
            </div>
            <div ref={googleBtnRef} className="flex justify-center min-h-[44px]" />
            <p className="text-[10px] text-zinc-500 text-center leading-relaxed px-2">
              {t('auth.googleTermsNote')}{' '}
              <button type="button" onClick={() => onOpenPolicy?.('terms')} className="text-rose-400 underline font-bold">{t('auth.terms')}</button>
              {' '}{t('auth.and')}{' '}
              <button type="button" onClick={() => onOpenPolicy?.('privacy')} className="text-rose-400 underline font-bold">{t('auth.privacy')}</button>.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-col items-center gap-3">
          {mode === 'login' && (
            <button onClick={() => switchMode('forgot')} className="text-zinc-600 hover:text-rose-500 font-bold transition-colors text-xs">
              {t('auth.forgotPassword')}
            </button>
          )}
          <button onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="text-zinc-500 hover:text-rose-500 font-bold transition-colors text-sm">
            {mode === 'login' ? t('auth.noAccount') : t('auth.haveAccount')}
          </button>
          <div className="text-[10px] text-zinc-600 mt-2 flex gap-3">
            <button type="button" onClick={() => onOpenPolicy?.('privacy')} className="hover:text-rose-500 transition-colors">{t('auth.privacyLabel')}</button>
            <span>·</span>
            <button type="button" onClick={() => onOpenPolicy?.('terms')} className="hover:text-rose-500 transition-colors">{t('auth.termsLabel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
