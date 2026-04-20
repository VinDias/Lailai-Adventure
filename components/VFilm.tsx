
import React, { useState, useEffect } from 'react';
import { Series, User, Episode } from '../types';
import { api } from '../services/api';
import ImageWithFallback from './ImageWithFallback';

interface VFilmProps {
  user: User | null;
  onOpen: (ep: Episode, s: Series) => void;
  focusSeriesId?: string | null;
  onFocusConsumed?: () => void;
}

const VFilm: React.FC<VFilmProps> = ({ user, onOpen, focusSeriesId, onFocusConsumed }) => {
  const [series, setSeries] = useState<Series[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [content, setContent] = useState<{seasons: any[], episodes: Episode[]} | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSeries()
      .then(data => {
        setSeries(data.filter(s => s.content_type === 'vcine'));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleOpenSeries = async (s: Series) => {
    setSelectedSeries(s);
    try {
      const data = await api.getSeriesContent(s._id);
      setContent(data);
    } catch (e) {
      console.error("Error loading vfilm content", e);
    }
  };

  useEffect(() => {
    if (!focusSeriesId || series.length === 0) return;
    const target = series.find(s => s._id === focusSeriesId);
    if (target) {
      handleOpenSeries(target);
      onFocusConsumed?.();
    }
  }, [focusSeriesId, series]);

  if (loading) return <div className="h-full w-full flex items-center justify-center bg-[var(--bg-color)]"><div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>;

  return (
    <div className="h-full w-full bg-[var(--bg-color)] overflow-y-auto pb-40 scrollbar-hide">
      <header className="p-8 pt-16 md:p-12">
        <h1 className="text-5xl font-black premium-text tracking-tighter mb-2">VCINE</h1>
        <p className="text-zinc-500 text-xs font-bold uppercase tracking-[0.4em]">Original Vertical Cinema</p>
      </header>

      <div className="px-8 mb-6">
        <input
          type="text"
          placeholder="Buscar por título ou gênero..."
          className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl text-white text-sm focus:border-rose-500/50 transition-all outline-none"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
      </div>

      <section className="px-8">
        {series.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">Nenhum curta disponível</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {series.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()) || s.genre.toLowerCase().includes(filter.toLowerCase())).map(s => (
              <div key={s._id} onClick={() => handleOpenSeries(s)} className="group cursor-pointer">
                <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden relative ring-1 ring-white/5 transition-all group-hover:scale-[0.98] group-hover:ring-rose-500/50">
                  <ImageWithFallback src={s.cover_image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700" alt={s.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                     <h3 className="text-lg font-black text-white leading-tight">{s.title}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedSeries && content && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[1500] animate-apple p-8 overflow-y-auto">
           <button onClick={() => setSelectedSeries(null)} className="absolute top-8 right-8 text-white/40 hover:text-white transition-all"><svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
           <div className="max-w-4xl mx-auto pt-20">
              <div className="flex flex-col md:flex-row gap-12 mb-16">
                 <ImageWithFallback src={selectedSeries.cover_image} className="w-64 aspect-[9/16] rounded-[2.5rem] object-cover shadow-2xl" alt={selectedSeries.title} />
                 <div className="flex-1">
                    <h2 className="text-6xl font-black text-white mb-6 tracking-tighter">{selectedSeries.title}</h2>
                    <p className="text-zinc-400 text-lg leading-relaxed mb-8">{selectedSeries.description}</p>
                    <button className="px-12 py-5 bg-rose-600 text-white font-black rounded-2xl shadow-xl hover:bg-rose-500 transition-all">ADICIONAR À LISTA</button>
                 </div>
              </div>
              <div className="space-y-4">
                 <h3 className="text-xl font-black text-white mb-6">Filmes Curtos</h3>
                 {content.episodes.map(ep => (
                   <div key={ep._id || ep.id} onClick={() => onOpen(ep, selectedSeries)} className="p-6 bg-white/5 border border-white/5 rounded-3xl flex items-center gap-6 cursor-pointer hover:bg-white/10 transition-all">
                      <div className="w-20 h-28 bg-black rounded-2xl overflow-hidden shrink-0">
                         <ImageWithFallback src={ep.thumbnail} className="w-full h-full object-cover opacity-60" alt={ep.title} />
                      </div>
                      <div className="flex-1">
                         <span className="text-rose-500 font-black text-[10px] uppercase tracking-widest">Produção #{ep.episode_number}</span>
                         <h4 className="text-white font-bold text-lg">{ep.title}</h4>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-white fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
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

export default VFilm;
