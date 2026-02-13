import React, { useState, useEffect } from 'react';
import { User, ViewMode } from './types';
import { MOCK_EPISODES, MOCK_COMICS, MOCK_LESSONS } from './services/mockData';
import { ICONS } from './constants';
import Auth from './components/Auth';
import VideoFeed from './components/VideoFeed';
import ComicFeed from './components/ComicFeed';
import Discover from './components/Discover';
import Premium from './components/Premium';
import Profile from './components/Profile';
import Logout from './components/Logout';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('lailai_session');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setView(ViewMode.FEED);
    }
    setIsAppReady(true);
  }, []);

  useEffect(() => {
    if (user && view !== ViewMode.AUTH) {
      const timer = setTimeout(() => setShowNotification(true), 2500);
      return () => clearTimeout(timer);
    }
  }, [user, view]);

  const handleLogin = (newUser: User) => {
    setUser(newUser);
    localStorage.setItem('lailai_session', JSON.stringify(newUser));
    setView(ViewMode.FEED);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('lailai_session');
    setView(ViewMode.AUTH);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('lailai_session', JSON.stringify(updatedUser));
  };

  if (!isAppReady) return null;

  if (view === ViewMode.AUTH) return <Auth onLogin={handleLogin} />;

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-[#0A0A0B] overflow-hidden font-lailai select-none">
      {showNotification && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[1000] w-[92%] max-w-[400px] ios-notification rounded-[2.2rem] p-5 flex items-center gap-4 cursor-pointer active:scale-95 transition-transform"
          onClick={() => { setView(ViewMode.DISCOVER); setShowNotification(false); }}
        >
          <div className="w-12 h-12 bg-white rounded-[1rem] flex items-center justify-center text-black font-black text-sm italic shadow-lg">LL</div>
          <div className="flex-1">
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">Academia</span>
              <span className="text-[10px] text-white/30">Agora</span>
            </div>
            <h4 className="text-[13px] font-bold text-white">Nova Masterclass</h4>
            <p className="text-[12px] text-white/60 leading-tight">O segredo das cores verticais.</p>
          </div>
          <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse self-center" />
        </div>
      )}

      <nav className="fixed bottom-0 w-full glass-nav border-t border-white/5 z-[500] md:relative md:w-24 md:h-full md:border-t-0 md:border-r flex md:flex-col items-center justify-between md:justify-center gap-1 md:gap-8 py-3 md:py-8 px-2 md:px-4 pb-[safe-area-inset-bottom]">
        <NavButton active={view === ViewMode.FEED} onClick={() => setView(ViewMode.FEED)} icon={ICONS.Home} label="HQCine" />
        <NavButton active={view === ViewMode.COMICS} onClick={() => setView(ViewMode.COMICS)} icon={ICONS.Comics} label="Hi-Qua" />
        <NavButton active={view === ViewMode.DISCOVER} onClick={() => setView(ViewMode.DISCOVER)} icon={ICONS.AI} label="Aulas" />
        <NavButton active={view === ViewMode.PROFILE} onClick={() => setView(ViewMode.PROFILE)} icon={ICONS.User} label="Perfil" />
        
        {!user?.isPremium && (
          <NavButton active={view === ViewMode.PREMIUM} onClick={() => setView(ViewMode.PREMIUM)} icon={ICONS.Premium} label="Cinema" className="text-amber-400" />
        )}

        <NavButton active={view === ViewMode.LOGOUT} onClick={() => setView(ViewMode.LOGOUT)} icon={ICONS.Logout} label="Sair" className="md:mt-auto" />
      </nav>

      <main className="flex-1 h-full overflow-hidden relative">
        <div className={`h-full w-full transition-opacity duration-500 ${isAppReady ? 'opacity-100' : 'opacity-0'}`}>
          {view === ViewMode.FEED && <VideoFeed episodes={MOCK_EPISODES} user={user} onUpgrade={() => setView(ViewMode.PREMIUM)} />}
          {view === ViewMode.COMICS && <ComicFeed comics={MOCK_COMICS} user={user} onUpgrade={() => setView(ViewMode.PREMIUM)} />}
          {view === ViewMode.DISCOVER && <Discover lessons={MOCK_LESSONS} />}
          {view === ViewMode.PROFILE && user && <Profile user={user} onUpdate={handleUpdateUser} onBack={() => setView(ViewMode.FEED)} />}
          {view === ViewMode.PREMIUM && <Premium onUpgradeComplete={() => { if(user) handleUpdateUser({...user, isPremium: true}); setView(ViewMode.FEED); }} onBack={() => setView(ViewMode.FEED)} />}
          {view === ViewMode.LOGOUT && <Logout onLogout={handleLogout} onCancel={() => setView(ViewMode.FEED)} />}
        </div>
      </main>
    </div>
  );
};

const NavButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string, className?: string }> = ({ active, onClick, icon, label, className }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center transition-all flex-1 md:flex-none p-1 md:p-0 ${className} ${active ? 'text-white' : 'text-[#86868B] hover:text-white/60'}`}
  >
    <div className={`p-2.5 rounded-2xl transition-all ${active ? 'bg-white/10 scale-105 shadow-lg' : 'bg-transparent hover:bg-white/5'}`}>
      {icon}
    </div>
    <span className={`text-[9px] font-black uppercase tracking-widest mt-1 transition-opacity ${active ? 'opacity-100' : 'opacity-40'}`}>
      {label}
    </span>
  </button>
);

export default App;