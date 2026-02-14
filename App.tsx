
import React, { useState, useEffect } from 'react';
import { User, ViewMode, Episode, Comic, Lesson, Ad } from './types';
import { MOCK_EPISODES, MOCK_COMICS, MOCK_LESSONS, MOCK_ADS } from './services/mockData';
import { ICONS } from './constants';
import Auth from './components/Auth';
import VideoFeed from './components/VideoFeed';
import ComicFeed from './components/ComicFeed';
import VeFilme from './components/Discover';
import Premium from './components/Premium';
import Profile from './components/Profile';
import Logout from './components/Logout';
import AdminDashboard from './components/AdminDashboard';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [isAppReady, setIsAppReady] = useState(false);

  const [episodes, setEpisodes] = useState<Episode[]>(MOCK_EPISODES);
  const [comics, setComics] = useState<Comic[]>(MOCK_COMICS);
  const [lessons, setLessons] = useState<Lesson[]>(MOCK_LESSONS);
  const [ads, setAds] = useState<Ad[]>(MOCK_ADS);

  useEffect(() => {
    const savedSession = localStorage.getItem('lailai_session');
    if (savedSession) {
      const parsedUser = JSON.parse(savedSession);
      setUser(parsedUser);
      setView(ViewMode.FEED);
    }
    
    const savedEps = localStorage.getItem('lailai_eps');
    const savedComs = localStorage.getItem('lailai_coms');
    const savedLesss = localStorage.getItem('lailai_lesss');
    const savedAds = localStorage.getItem('lailai_ads');

    if (savedEps) setEpisodes(JSON.parse(savedEps));
    if (savedComs) setComics(JSON.parse(savedComs));
    if (savedLesss) setLessons(JSON.parse(savedLesss));
    if (savedAds) setAds(JSON.parse(savedAds));
    
    setIsAppReady(true);
  }, []);

  useEffect(() => {
    if (user && view !== ViewMode.AUTH) {
      const timer = setTimeout(() => setShowNotification(true), 3500);
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

  const addEpisode = (ep: Episode) => {
    const newEps = [ep, ...episodes];
    setEpisodes(newEps);
    localStorage.setItem('lailai_eps', JSON.stringify(newEps));
  };

  const addComic = (comic: Comic) => {
    const newComics = [comic, ...comics];
    setComics(newComics);
    localStorage.setItem('lailai_coms', JSON.stringify(newComics));
  };

  const addLesson = (lesson: Lesson) => {
    const newLessons = [lesson, ...lessons];
    setLessons(newLessons);
    localStorage.setItem('lailai_lesss', JSON.stringify(newLessons));
  };

  const addAd = (newAd: Ad) => {
    const updatedAds = [newAd, ...ads];
    setAds(updatedAds);
    localStorage.setItem('lailai_ads', JSON.stringify(updatedAds));
  };

  const incrementAdView = (adId: number) => {
    const updatedAds = ads.map(ad => {
      if (ad.id === adId) {
        const newViews = ad.views + 1;
        return { ...ad, views: newViews, active: newViews < ad.maxViews };
      }
      return ad;
    });
    setAds(updatedAds);
    localStorage.setItem('lailai_ads', JSON.stringify(updatedAds));
  };

  if (!isAppReady) return null;
  if (view === ViewMode.AUTH) return <Auth onLogin={handleLogin} />;

  const isAdmin = user?.email === 'admin@lailai.com';

  return (
    <div className="h-screen w-full flex flex-col md:flex-row bg-[#0A0A0B] overflow-hidden font-lailai select-none">
      {showNotification && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[1000] w-[92%] max-w-[400px] ios-notification rounded-[2.2rem] p-5 flex items-center gap-4 cursor-pointer active:scale-95 transition-transform"
          onClick={() => { setView(ViewMode.DISCOVER); setShowNotification(false); }}
        >
          <div className="w-12 h-12 bg-white rounded-[1rem] flex items-center justify-center text-black font-black text-sm italic shadow-lg">LL</div>
          <div className="flex-1">
            <div className="flex justify-between items-center mb-0.5">
              <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest">VE-FILME</span>
              <span className="text-[10px] text-white/30">Agora</span>
            </div>
            <h4 className="text-[13px] font-bold text-white">Novo Ve-Filme</h4>
            <p className="text-[12px] text-white/60 leading-tight">Assista o novo curta da CineVibe Brasil.</p>
          </div>
          <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse self-center" />
        </div>
      )}

      <nav className="fixed bottom-0 w-full glass-nav border-t border-white/5 z-[500] md:relative md:w-24 md:h-full md:border-t-0 md:border-r flex md:flex-col items-center justify-between md:justify-center gap-1 md:gap-8 py-3 md:py-8 px-2 md:px-4 pb-[safe-area-inset-bottom]">
        <NavButton active={view === ViewMode.FEED} onClick={() => setView(ViewMode.FEED)} icon={ICONS.Home} label="HQCine" />
        <NavButton active={view === ViewMode.COMICS} onClick={() => setView(ViewMode.COMICS)} icon={ICONS.Comics} label="Hi-Qua" />
        <NavButton active={view === ViewMode.DISCOVER} onClick={() => setView(ViewMode.DISCOVER)} icon={ICONS.AI} label="Ve-Filme" />
        <NavButton active={view === ViewMode.PROFILE} onClick={() => setView(ViewMode.PROFILE)} icon={ICONS.User} label="Perfil" />
        
        {!user?.isPremium && (
          <NavButton active={view === ViewMode.PREMIUM} onClick={() => setView(ViewMode.PREMIUM)} icon={ICONS.Premium} label="Assinantes" className="text-amber-400" />
        )}

        {isAdmin && (
          <NavButton active={view === ViewMode.ADMIN} onClick={() => setView(ViewMode.ADMIN)} icon={<div className="font-black text-xs">AD</div>} label="Painel" className="text-emerald-400" />
        )}

        <NavButton active={view === ViewMode.LOGOUT} onClick={() => setView(ViewMode.LOGOUT)} icon={ICONS.Logout} label="Sair" className="md:mt-auto" />
      </nav>

      <main className="flex-1 h-full overflow-hidden relative">
        <div className="h-full w-full">
          {view === ViewMode.FEED && <VideoFeed episodes={episodes} user={user} ads={ads} onAdImpression={incrementAdView} onUpgrade={() => setView(ViewMode.PREMIUM)} onUpdateUser={handleUpdateUser} />}
          {view === ViewMode.COMICS && <ComicFeed comics={comics} user={user} onUpgrade={() => setView(ViewMode.PREMIUM)} onUpdateUser={handleUpdateUser} />}
          {view === ViewMode.DISCOVER && <VeFilme videos={lessons} user={user} onUpdateUser={handleUpdateUser} />}
          {view === ViewMode.PROFILE && user && <Profile user={user} onUpdate={handleUpdateUser} onBack={() => setView(ViewMode.FEED)} />}
          {view === ViewMode.PREMIUM && user && <Premium user={user} onUpgradeComplete={() => { if(user) handleUpdateUser({...user, isPremium: true}); setView(ViewMode.FEED); }} onAdPurchase={addAd} onBack={() => setView(ViewMode.FEED)} />}
          {view === ViewMode.LOGOUT && <Logout onLogout={handleLogout} onCancel={() => setView(ViewMode.FEED)} />}
          {view === ViewMode.ADMIN && <AdminDashboard onAddEpisode={addEpisode} onAddComic={addComic} onAddLesson={addLesson} />}
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
