
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
import Ads from './components/Ads';
import ThemeToggle from './components/ThemeToggle';
import { Play, BookOpen, Film, User as UserIcon, ShieldAlert, Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [activeWebtoon, setActiveWebtoon] = useState<Webtoon | null>(null);
  const [activeSeries, setActiveSeries] = useState<any>(null);
  const [seriesEpisodes, setSeriesEpisodes] = useState<any[]>([]);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    api.setStatusCallback(setIsOffline);
    api.setAuthExpiredCallback(() => {
      setUser(null);
      localStorage.removeItem('lorflux_session');
      localStorage.removeItem('lorflux_token');
      localStorage.removeItem('lorflux_refresh_token');
      setView(ViewMode.AUTH);
    });
    const saved = localStorage.getItem('lorflux_session');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        setUser(u);
        const token = localStorage.getItem('lorflux_token');
        if (token) api.setToken(token);
        const refreshToken = localStorage.getItem('lorflux_refresh_token');
        if (refreshToken) api.setRefreshToken(refreshToken);
        setView(ViewMode.HQCINE);
      } catch (e) { localStorage.removeItem('lorflux_session'); }
    }
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    const tok = (u as any).accessToken;
    if (tok) {
      localStorage.setItem('lorflux_token', tok);
      api.setToken(tok);
    }
    const rtok = (u as any).refreshToken;
    if (rtok) {
      localStorage.setItem('lorflux_refresh_token', rtok);
      api.setRefreshToken(rtok);
    }
    localStorage.setItem('lorflux_session', JSON.stringify(u));
    setView(ViewMode.HQCINE);
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
    setUser(null);
    localStorage.removeItem('lorflux_session');
    localStorage.removeItem('lorflux_token');
    localStorage.removeItem('lorflux_refresh_token');
    setView(ViewMode.AUTH);
  };

  if (view === ViewMode.AUTH) return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>
      <Auth onLogin={handleLogin} />
    </div>
  );

  return (
    <div className="h-screen w-full flex flex-col bg-[var(--bg-color)] text-[var(--text-color)] overflow-hidden font-inter select-none transition-colors duration-300">
      {isOffline && (
        <div className="bg-rose-600 text-white text-[10px] font-black uppercase py-1 text-center tracking-widest z-[5000]">
          MODO OFFLINE ATIVO
        </div>
      )}

      <main className="flex-1 overflow-hidden relative">
        {!user?.isPremium && (
          <div className="absolute top-0 left-0 right-0 z-[100] px-4">
             <Ads />
          </div>
        )}

        {view === ViewMode.HQCINE && (
          <HQCine
            user={user}
            onOpen={(ep, series) => {
              setActiveVideo({
                id: (ep._id || ep.id)?.toString(),
                titulo: ep.title,
                categoria: series.genre,
                descricao: ep.description,
                duracao: 15,
                arquivoUrl: ep.video_url,
                bunnyVideoId: ep.bunnyVideoId,
                audioTrack1Url: ep.audioTrack1Url,
                audioTrack2Url: ep.audioTrack2Url,
                thumbnailUrl: ep.thumbnail,
                isPremium: series.isPremium,
                criadoEm: new Date().toISOString(),
                type: 'hqcine'
              });
              setView(ViewMode.PLAYER);
            }}
          />
        )}

        {view === ViewMode.VCINE && (
          <VFilm
            user={user}
            onOpen={(ep, series) => {
              setActiveVideo({
                id: (ep._id || ep.id)?.toString(),
                titulo: ep.title,
                categoria: series.genre,
                descricao: ep.description,
                duracao: 10,
                arquivoUrl: ep.video_url,
                bunnyVideoId: ep.bunnyVideoId,
                audioTrack1Url: ep.audioTrack1Url,
                audioTrack2Url: ep.audioTrack2Url,
                thumbnailUrl: ep.thumbnail,
                isPremium: series.isPremium,
                criadoEm: new Date().toISOString(),
                type: 'vcine'
              });
              setView(ViewMode.PLAYER);
            }}
          />
        )}

        {view === ViewMode.HIQUA && (
          <HiQua
            user={user}
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
              <img src={user?.avatar || 'https://picsum.photos/seed/user/200'} className="w-32 h-32 rounded-[3.5rem] border-4 border-white/5 shadow-2xl" />
              {user?.isPremium && <div className="absolute -bottom-2 -right-2 bg-amber-500 p-2 rounded-full border-4 border-[#0A0A0B]"><Sparkles size={16} className="text-black" /></div>}
            </div>
            <h2 className="text-4xl font-black text-[var(--text-color)] mb-2 tracking-tighter">{user?.nome}</h2>
            <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest mb-12">{user?.email}</p>
            <div className="space-y-4">
              {!user?.isPremium && (
                <button onClick={async () => { try { const { url } = await api.createCheckoutSession(); window.location.href = url; } catch (e) { alert('Erro ao iniciar checkout. Tente novamente.'); } }} className="w-full py-5 bg-amber-500 text-black font-black rounded-3xl hover:scale-[1.02] transition-all">ASSINAR PREMIUM (R$ 3,99)</button>
              )}
              <button onClick={handleLogout} className="w-full py-5 bg-rose-600/10 text-rose-500 font-black rounded-3xl border border-rose-500/20 hover:bg-rose-600/20 transition-all">SAIR DA CONTA</button>
            </div>
          </div>
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

        {(view === ViewMode.ADMIN_DASHBOARD || view === ViewMode.ADMIN_CONTENT || view === ViewMode.ADMIN_USERS || view === ViewMode.ADMIN_PAYMENTS || view === ViewMode.ADMIN_ADS || view === ViewMode.ADMIN_SETTINGS) && (
          <AdminDashboard onLogout={handleLogout} currentSubView={view} setSubView={(v) => setView(v)} />
        )}
      </main>

      <nav className="h-28 bg-[var(--nav-bg,rgba(0,0,0,0.8))] backdrop-blur-3xl border-t border-[var(--border-color)] flex items-center justify-around px-4 pb-8 z-[900]">
        <NavBtn active={view === ViewMode.HQCINE} onClick={() => setView(ViewMode.HQCINE)} icon={<Play />} label="HQCine" />
        <NavBtn active={view === ViewMode.VCINE} onClick={() => setView(ViewMode.VCINE)} icon={<Film />} label="VCine" />
        <NavBtn active={view === ViewMode.HIQUA} onClick={() => setView(ViewMode.HIQUA)} icon={<BookOpen />} label="Hi-Qua" />
        <NavBtn active={view === ViewMode.PROFILE} onClick={() => setView(ViewMode.PROFILE)} icon={<UserIcon />} label="Conta" />
        <ThemeToggle />
        {(user as any)?.role === 'superadmin' && (
          <NavBtn active={view === ViewMode.ADMIN_DASHBOARD} onClick={() => setView(ViewMode.ADMIN_DASHBOARD)} icon={<ShieldAlert />} label="Admin" />
        )}
      </nav>
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
