
import React, { useState, useEffect } from 'react';
import { ViewMode, User, Video, Webtoon } from './types';
import { api } from './services/api';
import Auth from './components/Auth';
import VerticalPlayer from './components/VerticalPlayer';
import WebtoonReader from './components/WebtoonReader';
// Fix: Added missing AdminDashboard import
import AdminDashboard from './components/AdminDashboard';
import { Home, BookOpen, User as UserIcon, ShieldAlert, Play } from 'lucide-react';

const App: React.FC = () => {
  const [view, setView] = useState<ViewMode>(ViewMode.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);
  const [activeWebtoon, setActiveWebtoon] = useState<Webtoon | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    api.setStatusCallback(setIsOffline);
    const saved = localStorage.getItem('lailai_pro_session');
    if (saved) {
      try {
        setUser(JSON.parse(saved));
        setView(ViewMode.HOME_VIDEOS);
      } catch (e) { localStorage.removeItem('lailai_pro_session'); }
    }
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const seriesData = await api.getSeries();
      const mappedVideos = seriesData.map((s: any) => ({
        id: s.id.toString(),
        titulo: s.title || s.titulo,
        categoria: s.genre || s.categoria || 'Original',
        descricao: s.description || s.descricao || '',
        duracao: s.duracao || 15,
        arquivoUrl: s.arquivoUrl || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        thumbnailUrl: s.thumbnail_url || s.cover_image,
        isPremium: !!s.isPremium,
        criadoEm: s.criado_em || new Date().toISOString()
      }));
      setVideos(mappedVideos);
    } catch (error) { console.error(error); }
  };

  const handleLogin = (u: User) => {
    setUser(u);
    localStorage.setItem('lailai_pro_session', JSON.stringify(u));
    setView(ViewMode.HOME_VIDEOS);
    loadContent();
  };

  if (view === ViewMode.AUTH) return <Auth onLogin={handleLogin} />;

  return (
    <div className="h-screen w-full flex flex-col bg-[#0A0A0B] overflow-hidden font-inter select-none">
      
      {isOffline && (
        <div className="bg-rose-600 text-white text-[10px] font-black uppercase py-1 text-center tracking-widest z-[5000]">
          Servidor Offline • Simulando Conteúdo
        </div>
      )}

      <main className="flex-1 overflow-y-auto pb-32 scrollbar-hide">
        {view === ViewMode.HOME_VIDEOS && (
          <div className="p-8 animate-apple max-w-[1600px] mx-auto">
            <header className="mb-12 flex justify-between items-end">
              <div>
                <h1 className="text-6xl font-black premium-text tracking-tighter mb-2 italic">LAILAI</h1>
                <p className="text-zinc-600 text-[11px] font-black uppercase tracking-[0.5em] ml-1">Premium Vertical Streaming</p>
              </div>
              <div className="hidden md:flex gap-4 mb-2">
                 <span className="px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black text-zinc-400 uppercase tracking-widest">Mastered H.264</span>
              </div>
            </header>
            
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-10">
              {videos.map(v => (
                <div key={v.id} onClick={() => { setActiveVideo(v); setView(ViewMode.PLAYER); }} className="group cursor-pointer">
                  <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden relative border border-white/5 transition-all duration-500 group-hover:scale-[1.03] group-hover:border-rose-500/50 shadow-2xl">
                    <img 
                      src={v.thumbnailUrl} 
                      loading="lazy"
                      className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-all duration-1000 group-hover:scale-110" 
                    />
                    
                    {/* Overlay Gradiente Profissional */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity" />
                    
                    {/* Botão Play no Hover */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                       <div className="w-16 h-16 bg-white/20 backdrop-blur-3xl rounded-full flex items-center justify-center border border-white/20">
                          <Play className="text-white fill-white w-6 h-6 ml-1" />
                       </div>
                    </div>

                    {/* Badges */}
                    <div className="absolute top-6 left-6 flex flex-col gap-2">
                       {v.isPremium && (
                         <span className="bg-amber-500 text-black text-[9px] font-black px-3 py-1 rounded-lg shadow-lg">PREMIUM</span>
                       )}
                       <span className="bg-black/60 backdrop-blur-md text-white text-[9px] font-black px-3 py-1 rounded-lg border border-white/10 uppercase tracking-tighter">H.264</span>
                    </div>

                    {/* Metadata Card */}
                    <div className="absolute bottom-8 left-8 right-8">
                      <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest mb-1 block drop-shadow-lg">{v.categoria}</span>
                      <h3 className="text-2xl font-black text-white leading-tight tracking-tighter mb-2 drop-shadow-2xl">{v.titulo}</h3>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400">
                         <span>{v.duracao} MIN</span>
                         <span className="w-1 h-1 rounded-full bg-zinc-700" />
                         <span className="uppercase">{v.criadoEm.split('-')[0]}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === ViewMode.HOME_WEBTOONS && (
          <div className="p-8 animate-apple text-center py-40">
             <BookOpen className="w-12 h-12 text-rose-500 mx-auto mb-6" />
             <h2 className="text-4xl font-black text-white mb-2 tracking-tighter uppercase">HI-QUA Webtoons</h2>
             <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.4em]">Scroll infinito em altíssima fidelidade</p>
             
             {/* Renderizar thumbnails 160x151 aqui futuramente */}
          </div>
        )}

        {view === ViewMode.PROFILE && (
          <div className="p-8 animate-apple max-w-xl mx-auto pt-20 text-center">
             <img src={user?.avatar || 'https://picsum.photos/seed/user/200'} className="w-32 h-32 rounded-[3.5rem] mx-auto mb-8 border-4 border-white/5 shadow-2xl" />
             <h2 className="text-4xl font-black text-white mb-2 tracking-tighter">{user?.nome}</h2>
             <p className="text-zinc-500 font-bold uppercase text-[10px] tracking-widest mb-8">{user?.email}</p>
             <button onClick={() => { localStorage.clear(); setView(ViewMode.AUTH); }} className="px-12 py-5 bg-rose-600/10 text-rose-500 font-black rounded-3xl border border-rose-500/20 w-full hover:bg-rose-600/20 transition-all tracking-widest">ENCERRAR SESSÃO</button>
          </div>
        )}

        {view === ViewMode.ADMIN && <AdminDashboard />}
      </main>

      {view === ViewMode.PLAYER && activeVideo && (
        <VerticalPlayer video={activeVideo} user={user} onClose={() => setView(ViewMode.HOME_VIDEOS)} />
      )}
      
      {view === ViewMode.READER && activeWebtoon && (
        <WebtoonReader webtoon={activeWebtoon} user={user} onClose={() => setView(ViewMode.HOME_WEBTOONS)} />
      )}

      <nav className="fixed bottom-0 inset-x-0 h-28 bg-black/80 backdrop-blur-3xl border-t border-white/5 flex items-center justify-around px-4 pb-8 z-[900]">
        <NavBtn active={view === ViewMode.HOME_VIDEOS} onClick={() => setView(ViewMode.HOME_VIDEOS)} icon={<Home />} label="Cinema" />
        <NavBtn active={view === ViewMode.HOME_WEBTOONS} onClick={() => setView(ViewMode.HOME_WEBTOONS)} icon={<BookOpen />} label="Hi-Qua" />
        <NavBtn active={view === ViewMode.ADMIN} onClick={() => setView(ViewMode.ADMIN)} icon={<ShieldAlert />} label="Estúdio" />
        <NavBtn active={view === ViewMode.PROFILE} onClick={() => setView(ViewMode.PROFILE)} icon={<UserIcon />} label="Conta" />
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
