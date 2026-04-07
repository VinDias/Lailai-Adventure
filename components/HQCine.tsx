
import React, { useState, useEffect } from 'react';
import { Series, User, Episode } from '../types';
import { api } from '../services/api';
import { Play } from 'lucide-react';
import ImageWithFallback from './ImageWithFallback';

const HQCine: React.FC<{ user: User | null, onOpen: (ep: Episode, s: Series) => void }> = ({ user, onOpen }) => {
  const [series, setSeries] = useState<Series[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedSeries, setSelectedSeries] = useState<Series | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  useEffect(() => {
    api.getSeries().then(data => setSeries(data.filter(s => s.content_type === 'hqcine')));
  }, []);

  const handleOpenSeries = async (s: Series) => {
    setSelectedSeries(s);
    const data = await api.getEpisodesBySeries(s._id);
    setEpisodes(data);
  };

  return (
    <div className="h-full w-full bg-[var(--bg-color)] overflow-y-auto pb-40 scrollbar-hide">
      <header className="p-8 pt-16 md:p-12 animate-apple">
        <h1 className="text-5xl font-black premium-text tracking-tighter mb-2">HQCINE</h1>
        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.5em] ml-1">Original Vertical Series</p>
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

      <section className="px-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {series.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()) || s.genre.toLowerCase().includes(filter.toLowerCase())).map(s => (
          <div key={s._id} onClick={() => handleOpenSeries(s)} className="group cursor-pointer">
            <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden relative ring-1 ring-white/5 transition-all group-hover:scale-[1.02] shadow-2xl">
              <ImageWithFallback src={s.cover_image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <h3 className="text-lg font-black text-white leading-tight drop-shadow-lg">{s.title}</h3>
              </div>
            </div>
          </div>
        ))}
      </section>

      {selectedSeries && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-3xl z-[1500] animate-apple p-8 overflow-y-auto">
          <button onClick={() => setSelectedSeries(null)} className="absolute top-8 right-8 text-white/40 hover:text-white transition-all">
            <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
          <div className="max-w-4xl mx-auto pt-20">
            <div className="flex flex-col md:flex-row gap-12 mb-16">
              <ImageWithFallback src={selectedSeries.cover_image} className="w-64 aspect-[9/16] rounded-[2.5rem] object-cover shadow-2xl border border-white/5" />
              <div className="flex-1">
                <h2 className="text-6xl font-black text-white mb-6 tracking-tighter italic">Original</h2>
                <h3 className="text-4xl font-black text-white mb-4">{selectedSeries.title}</h3>
                <p className="text-zinc-400 text-lg leading-relaxed mb-8">{selectedSeries.description}</p>
                {selectedSeries.isPremium && <div className="mb-4 inline-block bg-amber-500 text-black text-[10px] font-black px-4 py-1.5 rounded-full">PREMIUM</div>}
                <button className="px-12 py-5 bg-white text-black font-black rounded-2xl hover:bg-zinc-200 transition-all">ADICIONAR À LISTA</button>
              </div>
            </div>
            
            <div className="space-y-4">
              {episodes.map(ep => (
                <div key={ep._id || ep.id} onClick={() => onOpen(ep, selectedSeries)} className="p-6 bg-white/5 border border-white/5 rounded-3xl flex items-center gap-6 cursor-pointer hover:bg-white/10 transition-all">
                  <div className="w-20 h-28 bg-black rounded-2xl overflow-hidden shrink-0 relative">
                    <ImageWithFallback src={ep.thumbnail} className="w-full h-full object-cover opacity-60" />
                    <Play size={16} className="absolute inset-0 m-auto text-white" />
                  </div>
                  <div>
                    <span className="text-rose-500 font-black text-[10px] uppercase tracking-widest">Capítulo {ep.episode_number}</span>
                    <h4 className="text-white font-bold text-lg">{ep.title}</h4>
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

export default HQCine;
