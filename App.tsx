
import React, { useState, useEffect } from 'react';
import { ViewMode, User, Video, Webtoon } from './types';
import { api } from './services/api';
import Auth from './components/Auth';
import VerticalPlayer from './components/VerticalPlayer';
import WebtoonReader from './components/WebtoonReader';
import AdminDashboard from './components/Admin/AdminDashboard';
import HQCine from './components/HQCine';
import VFilm from './components/VFilm';
import HiQua from './components/HiQua';
import MyFavorites from './components/MyFavorites';
import Onboarding, { hasSeenOnboarding } from './components/Onboarding';
import ThemeToggle from './components/ThemeToggle';
import ImageWithFallback from './components/ImageWithFallback';
import SearchOverlay from './components/SearchOverlay';
import ConsentBanner from './components/ConsentBanner';
import LegalPolicy from './components/LegalPolicy';
import PrivacyCenter from './components/PrivacyCenter';
import { Play, BookOpen, Film, User as UserIcon, ShieldAlert, Sparkles, Search, Heart, Star, Pencil } from 'lucide-react';
import { getLocalizedPrice } from './utils/localizedPrice';
import { initConsent } from './utils/consent';
import { useI18n, useT } from './contexts/I18nContext';
import { LANG_OPTIONS } from './i18n/translations';

const App: React.FC = () => {
  const t = useT();
  const { lang, setLang } = useI18n();
  const [view, setView] = useState<ViewMode>(ViewMode.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [activeWebtoon, setActiveWebtoon] = useState<Webtoon | null>(null);
  const [activeSeries, setActiveSeries] = useState<any>(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState<any[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingSeriesFocus, setPendingSeriesFocus] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<'privacy' | 'terms'>('privacy');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { avatar } = await api.uploadAvatar(file);
      setUser(prev => (prev ? { ...prev, avatar } : prev));
    } catch (err: any) {
      alert(err?.message || t('account.photoError'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const openPolicy = (tab: 'privacy' | 'terms' = 'privacy') => { setLegalTab(tab); setLegalOpen(true); };

  // URLs públicas /privacidade e /termos abrem o modal legal (funciona
  // deslogado) — exigência da tela de consentimento OAuth do Google, que
  // pede uma URL acessível da política de privacidade.
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/privacidade') openPolicy('privacy');
    else if (path === '/termos') openPolicy('terms');
  }, []);

  // Limpeza de tokens legados que ficavam no localStorage (agora usamos cookies httpOnly).
  const purgeLegacyTokens = () => {
    localStorage.removeItem('lorflux_session');
    localStorage.removeItem('lorflux_token');
    localStorage.removeItem('lorflux_refresh_token');
  };

  useEffect(() => {
    initConsent();
    purgeLegacyTokens();
    api.setStatusCallback(setIsOffline);
    api.setAuthExpiredCallback(() => {
      setUser(null);
      setView(ViewMode.AUTH);
    });

    // Restaura a sessão usando o cookie httpOnly de refresh — sem tokens no localStorage.
    (async () => {
      try {
        const restored = await api.bootstrapSession();
        if (restored) {
          setUser(restored);
          setView(ViewMode.HQCINE);
          if (!hasSeenOnboarding()) setShowOnboarding(true);
        }
      } catch { /* segue para tela de login */ }
      finally { setBooting(false); }
    })();
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    const tok = (u as any).accessToken;
    if (tok) api.setToken(tok);
    const rtok = (u as any).refreshToken;
    if (rtok) api.setRefreshToken(rtok);
    setView(ViewMode.HQCINE);
    if (!hasSeenOnboarding()) setShowOnboarding(true);
  };

  const openWebtoonEpisode = (ep: any, series: any) => {
    const epId = ep._id || ep.id?.toString();
    setActiveWebtoon({
      id: epId,
      episodeId: epId,
      titulo: ep.title,
      categoria: series.genre,
      descricao: ep.description,
      numeroPaineis: ep.panels?.length ?? 0,
      isPremium: ep.isPremium ?? series.isPremium,
      thumbnailUrl: ep.thumbnail,
      criadoEm: new Date().toISOString()
    });
    setView(ViewMode.READER);
  };

  const handleLogout = () => {
    api.logout();
    purgeLegacyTokens();
    setUser(null);
    setView(ViewMode.AUTH);
  };

  const handleAccountDeleted = () => {
    api.setToken('');
    purgeLegacyTokens();
    setUser(null);
    setView(ViewMode.AUTH);
  };

  // Evita "flash" da tela de login enquanto a sessão é restaurada via cookie.
  if (booting) return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[var(--bg-color)]">
      <div className="w-8 h-8 border-2 border-zinc-700 border-t-rose-500 rounded-full animate-spin" />
    </div>
  );

  if (view === ViewMode.AUTH) return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <Auth onLogin={handleLogin} onOpenPolicy={openPolicy} />
      <ConsentBanner onOpenPolicy={() => openPolicy('privacy')} />
      <LegalPolicy open={legalOpen} onClose={() => setLegalOpen(false)} initialTab={legalTab} />
    </div>
  );

  const handleSearchSelect = (seriesId: string, contentType?: string) => {
    if (contentType === 'hiqua') setView(ViewMode.HIQUA);
    else if (contentType === 'vcine') setView(ViewMode.VCINE);
    else if (contentType === 'hqcine') setView(ViewMode.HQCINE);
    setPendingSeriesFocus(seriesId);
    setSearchOpen(false);
  };

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--bg-color)] text-[var(--text-color)] overflow-hidden font-inter select-none transition-colors duration-300">
      {isOffline && (
        <div className="bg-rose-600 text-white text-[10px] font-black uppercase py-1 text-center tracking-widest z-[5000]">
          {t('common.offline')}
        </div>
      )}

      <button
        onClick={() => setSearchOpen(true)}
        aria-label="Buscar"
        className="fixed top-4 right-4 z-[800] p-3 rounded-full bg-black/50 backdrop-blur-md border border-white/10 text-white/70 hover:text-white hover:bg-black/70 transition-all"
        style={{ top: 'max(env(safe-area-inset-top, 0px), 16px)' }}
      >
        <Search size={18} />
      </button>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSelectSeries={handleSearchSelect} />

      {/* O banner flutuante no topo foi removido a pedido do cliente: sobrepunha o
          conteúdo e ficava pequeno/cortado. A publicidade para usuário free fica nos
          banners de feed (HQCine/VCine/Hi-Qua) e nos interstitials de vídeo/leitura. */}
      <main className="flex-1 overflow-hidden relative">
        {view === ViewMode.HQCINE && (
          <HQCine
            user={user}
            focusSeriesId={pendingSeriesFocus}
            onFocusConsumed={() => setPendingSeriesFocus(null)}
            onOpen={(ep, series) => {
              setActiveVideo({
                id: (ep._id || ep.id)?.toString(),
                titulo: ep.title,
                categoria: series.genre,
                descricao: ep.description,
                duracao: 15,
                arquivoUrl: ep.video_url,
                bunnyVideoId: ep.bunnyVideoId,
                thumbnailUrl: ep.thumbnail,
                isPremium: series.isPremium,
                criadoEm: new Date().toISOString(),
                type: 'hqcine',
                hlsAudioLabels: ep.hlsAudioLabels
              });
              setView(ViewMode.PLAYER);
            }}
          />
        )}

        {view === ViewMode.VCINE && (
          <VFilm
            user={user}
            focusSeriesId={pendingSeriesFocus}
            onFocusConsumed={() => setPendingSeriesFocus(null)}
            onOpen={(ep, series) => {
              setActiveVideo({
                id: (ep._id || ep.id)?.toString(),
                titulo: ep.title,
                categoria: series.genre,
                descricao: ep.description,
                duracao: 10,
                arquivoUrl: ep.video_url,
                bunnyVideoId: ep.bunnyVideoId,
                thumbnailUrl: ep.thumbnail,
                isPremium: series.isPremium,
                criadoEm: new Date().toISOString(),
                type: 'vcine',
                hlsAudioLabels: ep.hlsAudioLabels
              });
              setView(ViewMode.PLAYER);
            }}
          />
        )}

        {view === ViewMode.HIQUA && (
          <HiQua
            user={user}
            focusSeriesId={pendingSeriesFocus}
            onFocusConsumed={() => setPendingSeriesFocus(null)}
            onOpen={(ep, series, episodes) => {
              setActiveSeries(series);
              setSeriesEpisodes(episodes);
              openWebtoonEpisode(ep, series);
            }}
          />
        )}

        {view === ViewMode.PROFILE && (
          <div className="p-8 animate-apple max-w-xl mx-auto pt-20 text-center">
            <div className="relative inline-block mb-8">
              <div className={`w-32 h-32 rounded-[3.5rem] border-4 border-white/5 shadow-2xl overflow-hidden ${uploadingAvatar ? 'opacity-50' : ''}`}>
                <ImageWithFallback src={user?.avatar} className="w-full h-full object-cover" alt={user?.nome || 'Avatar'} />
              </div>
              {user?.isPremium && <div className="absolute -bottom-2 -right-2 bg-amber-500 p-2 rounded-full border-4 border-[#0A0A0B]"><Sparkles size={16} className="text-black" /></div>}
              {/* Troca de foto de perfil */}
              <button
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label={t('account.changePhoto')}
                className="absolute -top-1 -right-1 p-2.5 bg-rose-600 rounded-full border-4 border-[var(--bg-color)] text-white hover:bg-rose-500 transition-all disabled:opacity-60"
              >
                {uploadingAvatar
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Pencil size={14} />}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <h2 className="text-4xl font-black text-[var(--text-color)] mb-2 tracking-tighter">{user?.nome}</h2>
            <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest mb-12">{user?.email}</p>
            <div className="space-y-4">
              {!user?.isPremium && (
                <button onClick={async () => { try { const { url } = await api.createCheckoutSession(); window.location.href = url; } catch (e) { alert('Erro ao iniciar checkout. Tente novamente.'); } }} className="w-full py-5 bg-amber-500 text-black font-black rounded-3xl hover:scale-[1.02] transition-all">{t('account.subscribePremium')} ({getLocalizedPrice()})</button>
              )}
              <button onClick={() => setView(ViewMode.FAVORITES)} className="w-full py-5 bg-white/5 text-[var(--text-color)] font-black rounded-3xl border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-3"><Heart size={18} /> {t('account.myFavorites')}</button>
              <button
                onClick={() => window.open('https://play.google.com/store/apps/details?id=com.lorflux.twa', '_blank', 'noopener,noreferrer')}
                className="w-full py-5 bg-white/5 text-[var(--text-color)] font-black rounded-3xl border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-3"
              >
                <Star size={18} /> {t('account.rateApp')}
              </button>
              <button onClick={handleLogout} className="w-full py-5 bg-rose-600/10 text-rose-500 font-black rounded-3xl border border-rose-500/20 hover:bg-rose-600/20 transition-all">{t('account.logout')}</button>

              {/* Seletor de idioma da interface (compartilhado com os balões do leitor) */}
              <div className="pt-4">
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">{t('account.language')}</p>
                <div className="flex justify-center gap-2">
                  {LANG_OPTIONS.map(opt => (
                    <button
                      key={opt.code}
                      onClick={() => setLang(opt.code)}
                      className={`px-5 py-2.5 rounded-2xl text-xs font-black transition-all ${lang === opt.code ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400 border border-white/10 hover:text-white'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <PrivacyCenter user={user} onOpenPolicy={openPolicy} onDeleted={handleAccountDeleted} />
          </div>
        )}

        {view === ViewMode.FAVORITES && (
          <MyFavorites user={user} onOpenSeries={handleSearchSelect} />
        )}

        {view === ViewMode.PLAYER && activeVideo && (
          <VerticalPlayer video={activeVideo} user={user} onClose={() => setView(activeVideo.type === 'hqcine' ? ViewMode.HQCINE : ViewMode.VCINE)} />
        )}

        {view === ViewMode.READER && activeWebtoon && (() => {
          const currentIdx = seriesEpisodes.findIndex(e => (e._id || e.id?.toString()) === activeWebtoon.id);
          const prevEp = currentIdx > 0 ? seriesEpisodes[currentIdx - 1] : null;
          const nextEp = currentIdx < seriesEpisodes.length - 1 ? seriesEpisodes[currentIdx + 1] : null;
          return (
            <WebtoonReader
              webtoon={activeWebtoon}
              user={user}
              onClose={() => setView(ViewMode.HIQUA)}
              prevEpisode={prevEp}
              nextEpisode={nextEp}
              onNavigate={(ep) => openWebtoonEpisode(ep, activeSeries)}
            />
          );
        })()}

        {(view === ViewMode.ADMIN_DASHBOARD || view === ViewMode.ADMIN_CONTENT || view === ViewMode.ADMIN_USERS || view === ViewMode.ADMIN_PAYMENTS || view === ViewMode.ADMIN_ADS || view === ViewMode.ADMIN_SETTINGS || view === ViewMode.ADMIN_ROYALTIES) && (
          <AdminDashboard onLogout={handleLogout} currentSubView={view} setSubView={(v) => setView(v)} />
        )}
      </main>

      <nav className="h-28 bg-[var(--nav-bg,rgba(0,0,0,0.8))] backdrop-blur-3xl border-t border-[var(--border-color)] flex items-center justify-around px-4 pb-8 z-[900]">
        <NavBtn active={view === ViewMode.HQCINE} onClick={() => setView(ViewMode.HQCINE)} icon={<Play />} label="HQCine" />
        <NavBtn active={view === ViewMode.VCINE} onClick={() => setView(ViewMode.VCINE)} icon={<Film />} label="VCine" />
        <NavBtn active={view === ViewMode.HIQUA} onClick={() => setView(ViewMode.HIQUA)} icon={<BookOpen />} label="Hi-Qua" />
        <NavBtn active={view === ViewMode.PROFILE || view === ViewMode.FAVORITES} onClick={() => setView(ViewMode.PROFILE)} icon={<UserIcon />} label={t('nav.account')} />
        <ThemeToggle />
        {(user as any)?.role === 'superadmin' && (
          <NavBtn active={view === ViewMode.ADMIN_DASHBOARD} onClick={() => setView(ViewMode.ADMIN_DASHBOARD)} icon={<ShieldAlert />} label="Admin" />
        )}
      </nav>

      {showOnboarding && <Onboarding onFinish={() => setShowOnboarding(false)} />}
      <ConsentBanner onOpenPolicy={() => openPolicy('privacy')} />
      <LegalPolicy open={legalOpen} onClose={() => setLegalOpen(false)} initialTab={legalTab} />
    </div>
  );
};

const NavBtn = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 transition-all duration-300 ${active ? 'text-rose-500 scale-110' : 'text-zinc-600 hover:text-zinc-400'}`}>
    <div className={`${active ? 'drop-shadow-[0_0_12px_rgba(225,29,72,0.6)]' : ''}`}>{icon}</div>
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default App;
