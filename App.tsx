
import React, { useState, useEffect } from 'react';
import { ViewMode, User, Series, Episode, Panel, Ad } from './types';
import { api } from './services/api';
import { ICONS } from './constants';
import Auth from './components/Auth';
import HQCine from './components/HQCine';
import HiQua from './components/HiQua';
import VFilm from './components/VFilm';
import UserTab from './components/UserTab';
import SubscriptionTab from './components/SubscriptionTab';
import VerticalPlayer from './components/VerticalPlayer';
import WebtoonReader from './components/WebtoonReader';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [activeEpisode, setActiveEpisode] = useState<Episode | null>(null);
  const [activeSeries, setActiveSeries] = useState<Series | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('lailai_session');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
        setView(ViewMode.HQCINE);
      } catch (e) {
        localStorage.removeItem('lailai_session');
      }
    }
  }, []);

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('lailai_session', JSON.stringify(u));
    setView(ViewMode.HQCINE);
  };

  const handleOpenPlayer = (ep: Episode, series: Series) => {
    setActiveEpisode(ep);
    setActiveSeries(series);
    setView(ViewMode.PLAYER);
  };

  const handleOpenReader = (ep: Episode, series: Series) => {
    setActiveEpisode(ep);
    setActiveSeries(series);
    setView(ViewMode.READER);
  };

  if (view === ViewMode.AUTH) return <Auth onLogin={handleLogin} />;

  return (
    <div className="h-screen w-full flex flex-col bg-black overflow-hidden font-lailai">
      <main className="flex-1 relative overflow-hidden">
        {view === ViewMode.HQCINE && <HQCine user={user} onOpen={handleOpenPlayer} />}
        {view === ViewMode.HIQUA && <HiQua user={user} onOpen={handleOpenReader} />}
        {view === ViewMode.VFILM && <VFilm user={user} onOpen={handleOpenPlayer} />}
        {view === ViewMode.USER && <UserTab user={user} onLogout={() => { localStorage.clear(); setView(ViewMode.AUTH); }} />}
        {view === ViewMode.SUBSCRIPTION && <SubscriptionTab user={user!} onUpgrade={() => { 
          const updatedUser = { ...user!, isPremium: true };
          setUser(updatedUser); 
          localStorage.setItem('lailai_session', JSON.stringify(updatedUser));
          setView(ViewMode.USER); 
        }} />}
        
        {view === ViewMode.PLAYER && activeEpisode && (
          <VerticalPlayer 
            episode={activeEpisode} 
            user={user} 
            onClose={() => setView(activeSeries?.content_type === 'vfilm' ? ViewMode.VFILM : ViewMode.HQCINE)} 
          />
        )}

        {view === ViewMode.READER && activeEpisode && (
          <WebtoonReader 
            episode={activeEpisode} 
            onClose={() => setView(ViewMode.HIQUA)} 
          />
        )}
      </main>

      {/* Apple-style Bottom Tab Bar */}
      <nav className="h-24 bg-black/80 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around px-4 pb-6 z-[2000]">
        <NavBtn active={view === ViewMode.HQCINE} onClick={() => setView(ViewMode.HQCINE)} icon={ICONS.Home} label="HQCINE" />
        <NavBtn active={view === ViewMode.HIQUA} onClick={() => setView(ViewMode.HIQUA)} icon={ICONS.Comics} label="HI-QUA" />
        <NavBtn active={view === ViewMode.VFILM} onClick={() => setView(ViewMode.VFILM)} icon={ICONS.Play} label="V-Film" />
        <NavBtn active={view === ViewMode.USER} onClick={() => setView(ViewMode.USER)} icon={ICONS.User} label="Perfil" />
        {!user?.isPremium && (
          <NavBtn active={view === ViewMode.SUBSCRIPTION} onClick={() => setView(ViewMode.SUBSCRIPTION)} icon={ICONS.Premium} label="Assinar" />
        )}
      </nav>
    </div>
  );
};

const NavBtn: React.FC<{ active: boolean, onClick: () => void, icon: any, label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`flex flex-col items-center gap-1.5 transition-all ${active ? 'text-rose-500 scale-105' : 'text-zinc-600 hover:text-zinc-400'}`}>
    <div className={`${active ? 'premium-text' : ''}`}>{icon}</div>
    <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default App;
