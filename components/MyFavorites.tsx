
import React, { useState, useEffect } from 'react';
import { Series, User } from '../types';
import { api } from '../services/api';
import { X } from 'lucide-react';
import ImageWithFallback from './ImageWithFallback';

interface MyFavoritesProps {
  user: User | null;
  onOpenSeries: (seriesId: string, contentType?: string) => void;
}

const MyFavorites: React.FC<MyFavoritesProps> = ({ user, onOpenSeries }) => {
  const [favorites, setFavorites] = useState<{ seriesId: string; series: Series }[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    api.getFavorites()
      .then(data => {
        setFavorites(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleRemove = async (e: React.MouseEvent, seriesId: string) => {
    e.stopPropagation();
    if (removingId) return;
    setRemovingId(seriesId);
    try {
      await api.removeFavorite(seriesId);
      setFavorites(prev => prev.filter(f => String(f.seriesId) !== String(seriesId)));
    } catch {
      // mantém o item na lista em caso de erro
    }
    setRemovingId(null);
  };

  if (loading) return <div className="h-full w-full flex items-center justify-center bg-[var(--bg-color)]"><div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>;

  return (
    <div className="h-full w-full bg-[var(--bg-color)] overflow-y-auto pb-40 scrollbar-hide">
      <header className="p-8 pt-16 md:p-12 animate-apple">
        <h1 className="text-5xl font-black premium-text tracking-tighter mb-2">MEUS FAVORITOS</h1>
        <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.5em] ml-1">Minha Lista</p>
      </header>

      {favorites.length === 0 ? (
        <div className="py-20 px-8 text-center">
          <p className="text-zinc-600 font-bold uppercase tracking-widest text-xs">Você ainda não adicionou nada à lista</p>
        </div>
      ) : (
        <section className="px-8 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {favorites.map(({ series: s }) => (
            <div key={String(s._id)} onClick={() => onOpenSeries(String(s._id), s.content_type)} className="group cursor-pointer">
              <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden relative ring-1 ring-white/5 transition-all group-hover:scale-[1.02] shadow-2xl">
                <ImageWithFallback src={s.cover_image} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt={s.title} />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                <button
                  onClick={(e) => handleRemove(e, String(s._id))}
                  disabled={removingId === String(s._id)}
                  aria-label="Remover dos favoritos"
                  className="absolute top-4 right-4 p-2.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-white/60 hover:text-rose-500 hover:border-rose-500/40 transition-all disabled:opacity-50"
                >
                  <X size={16} strokeWidth={3} />
                </button>
                <div className="absolute bottom-6 left-6 right-6">
                  <h3 className="text-lg font-black text-white leading-tight drop-shadow-lg">{s.title}</h3>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export default MyFavorites;
