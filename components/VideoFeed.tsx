
import React, { useState, useEffect, useRef } from 'react';
import { Series, Episode, User, Ad, ViewMode } from '../types';
import { api } from '../services/api';

interface BrowseProps {
  user: User | null;
  onOpenSeries: (series: Series) => void;
}

const SeriesBrowse: React.FC<BrowseProps> = ({ user, onOpenSeries }) => {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSeries().then(data => {
      setSeriesList(data);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="h-full w-full flex items-center justify-center bg-black"><div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>;

  return (
    <div className="h-full w-full bg-[#050505] overflow-y-auto scrollbar-hide font-inter pb-40">
      <header className="p-8 md:p-12">
        <h1 className="text-4xl font-black premium-text tracking-tighter mb-2">Cinema Loreflux</h1>
        <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest">Originals • Exclusivo</p>
      </header>

      <div className="px-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {seriesList.map(s => (
          <div key={s.id} onClick={() => onOpenSeries(s)} className="group cursor-pointer">
            <div className="aspect-[9/16] rounded-[2rem] overflow-hidden relative ring-1 ring-white/5 transition-all group-hover:scale-[0.98] group-hover:ring-rose-500/50">
              {/* Fix: Updated s.coverImage to s.cover_image to match Series interface */}
              <img src={s.cover_image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest block mb-1">{s.genre}</span>
                <h3 className="text-xl font-black text-white leading-tight">{s.title}</h3>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SeriesBrowse;
