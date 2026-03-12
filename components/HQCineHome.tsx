
import React, { useState, useEffect } from 'react';
import { Series, Chapter, Panel, User } from '../types';
import { api } from '../services/api';

const HQCineHome: React.FC<{ user: User | null }> = ({ user }) => {
  const [series, setSeries] = useState<Series[]>([]);
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getSeries().then(setSeries);
  }, []);

  const openSeries = async (s: Series) => {
    setSelectedSeries(s);
    try {
      const episodes = await api.getEpisodesBySeries(s._id);
      // Mapeia episódios para capítulos para manter compatibilidade com interface HQCine
      setChapters(episodes.map(ep => ({
        id: ep.id,
        series_id: s._id,
        chapter_number: ep.episode_number,
        title: ep.title
      })));
    } catch (err) {
      console.error(err);
    }
  };

  const openChapter = async (ch: Chapter) => {
    setLoading(true);
    setActiveChapter(ch);
    try {
      const data = await api.getChapterPanels(ch.id);
      setPanels(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (activeChapter) {
    return (
      <div className="absolute inset-0 bg-black z-[2000] overflow-y-auto scrollbar-hide animate-apple">
        <button onClick={() => setActiveChapter(null)} className="fixed top-8 left-8 z-[3000] p-4 bg-black/50 backdrop-blur-lg rounded-full border border-white/10 text-white shadow-2xl">
          <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <div className="flex flex-col items-center">
          {loading ? (
            <div className="h-screen w-full flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
            </div>
          ) : (
            panels.map(p => (
              <img key={p.id} src={p.image_url} className="w-full max-w-2xl h-auto block" loading="lazy" />
            ))
          )}
          <div className="h-64 flex flex-col items-center justify-center p-20 text-center">
            <h3 className="text-zinc-500 font-bold uppercase tracking-widest text-sm">Fim do Capítulo</h3>
            <button onClick={() => setActiveChapter(null)} className="mt-8 px-12 py-4 bg-white text-black font-black rounded-2xl hover:scale-105 transition-transform">VOLTAR</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#050505] overflow-y-auto pb-32">
      <header className="p-8 md:p-12 animate-apple">
        <h1 className="text-5xl font-black premium-text tracking-tighter mb-2">HQCINE</h1>
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.3em]">Vertical Stories & Series</p>
      </header>

      <section className="px-8 mb-12">
        <h2 className="text-zinc-400 font-black uppercase text-xs tracking-widest mb-6 border-l-4 border-rose-500 pl-4">Destaques da Semana</h2>
        <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide">
          {series.map(s => (
            <div key={s._id} onClick={() => openSeries(s)} className="shrink-0 w-48 md:w-64 group cursor-pointer animate-apple">
              <div className="aspect-[9/16] rounded-[2rem] overflow-hidden relative ring-1 ring-white/5 transition-all group-hover:scale-[0.98] group-hover:ring-rose-500/50">
                <img src={s.cover_image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                <div className="absolute bottom-6 left-6 right-6">
                   <p className="text-[10px] font-black text-rose-500 uppercase mb-1">{s.genre}</p>
                   <h3 className="text-lg font-black text-white leading-tight">{s.title}</h3>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedSeries && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[1500] p-8 overflow-y-auto animate-apple">
          <button onClick={() => setSelectedSeries(null)} className="absolute top-8 right-8 text-white/50 hover:text-white transition-all"><svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
          <div className="max-w-4xl mx-auto pt-20 pb-32">
            <div className="flex flex-col md:flex-row gap-12 mb-16">
              <img src={selectedSeries.cover_image} className="w-64 aspect-[9/16] rounded-[3rem] object-cover shadow-2xl border border-white/5" />
              <div className="flex-1">
                 <h2 className="text-6xl font-black text-white mb-6 tracking-tighter">{selectedSeries.title}</h2>
                 <p className="text-zinc-400 text-lg leading-relaxed mb-8">{selectedSeries.description}</p>
                 <div className="flex gap-4">
                   <button className="px-12 py-5 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all">SEGUIR SÉRIE</button>
                 </div>
              </div>
            </div>
            
            <h3 className="text-xl font-black text-white mb-8 border-b border-white/10 pb-4">Capítulos Disponíveis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {chapters.map((ch: any) => (
                <div key={ch.id} onClick={() => openChapter(ch)} className="p-6 bg-white/5 border border-white/5 rounded-3xl flex justify-between items-center cursor-pointer hover:bg-white/10 transition-all">
                  <div>
                    <span className="text-rose-500 font-black text-[10px] uppercase tracking-widest block mb-1">Cap {ch.chapter_number}</span>
                    <h4 className="text-white font-bold text-lg">{ch.title || `Capítulo ${ch.chapter_number}`}</h4>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                    <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M9 5l7 7-7 7"/></svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HQCineHome;
