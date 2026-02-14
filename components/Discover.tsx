
import React, { useState, useEffect } from 'react';
import { Series } from '../types';
import { api } from '../services/api';

const Discover: React.FC = () => {
  const [series, setSeries] = useState<Series[]>([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    api.getSeries().then(setSeries);
  }, []);

  const filtered = series.filter(s => 
    s.title.toLowerCase().includes(filter.toLowerCase()) || 
    s.genre.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="h-full w-full bg-[#0A0A0B] overflow-y-auto p-8 pb-32">
      <h1 className="text-3xl font-black mb-8 premium-text">DESCUBRA</h1>
      
      <div className="mb-12 relative">
         <input 
            type="text" 
            placeholder="Buscar por título ou gênero..." 
            className="w-full bg-white/5 border border-white/10 p-5 rounded-2xl text-white focus:border-rose-500/50 transition-all outline-none"
            value={filter}
            onChange={e => setFilter(e.target.value)}
         />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        {filtered.map(s => (
          <div key={s.id} className="group">
             <div className="aspect-[9/16] rounded-3xl overflow-hidden mb-4 relative ring-1 ring-white/5 group-hover:ring-rose-500/50 transition-all">
                <img src={s.cover_image} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                   <p className="text-[8px] font-black text-rose-500 uppercase">{s.genre}</p>
                   <h4 className="text-sm font-bold text-white truncate">{s.title}</h4>
                </div>
             </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Discover;
