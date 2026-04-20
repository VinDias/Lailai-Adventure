
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import ImageWithFallback from './ImageWithFallback';
import { Search, X, Play, Film, BookOpen } from 'lucide-react';

interface SeriesResult {
  _id: string;
  title: string;
  genre: string;
  cover_image?: string;
  content_type?: string;
}

interface EpisodeResult {
  _id: string;
  title: string;
  episode_number?: number;
  thumbnail?: string;
  seriesId?: string;
  seriesTitle?: string;
  content_type?: string;
}

interface SearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onSelectSeries: (seriesId: string, contentType?: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  hqcine: 'HQCINE',
  vcine: 'VCINE',
  hiqua: 'HI-QUA'
};

const TypeIcon: React.FC<{ type?: string; size?: number }> = ({ type, size = 14 }) => {
  if (type === 'hiqua') return <BookOpen size={size} />;
  if (type === 'vcine') return <Film size={size} />;
  return <Play size={size} />;
};

const SearchOverlay: React.FC<SearchOverlayProps> = ({ open, onClose, onSelectSeries }) => {
  const [query, setQuery] = useState('');
  const [series, setSeries] = useState<SeriesResult[]>([]);
  const [episodes, setEpisodes] = useState<EpisodeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSeries([]);
      setEpisodes([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSeries([]);
      setEpisodes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      const result = await api.searchContent(trimmed);
      setSeries(result.series || []);
      setEpisodes(result.episodes || []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const trimmed = query.trim();
  const hasQuery = trimmed.length >= 2;
  const hasResults = series.length > 0 || episodes.length > 0;

  const handleSelectSeries = (item: SeriesResult | EpisodeResult) => {
    const seriesId = (item as any).seriesId || item._id;
    const contentType = item.content_type;
    if (!seriesId) return;
    onSelectSeries(seriesId, contentType);
  };

  return (
    <div className="fixed inset-0 z-[4000] bg-black/90 backdrop-blur-2xl flex flex-col animate-apple" onClick={onClose}>
      <div
        className="w-full max-w-2xl mx-auto mt-20 px-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 bg-[var(--card-bg,#1c1c1e)] border border-[var(--border-color,rgba(255,255,255,0.1))] rounded-3xl px-6 py-4 shadow-2xl">
          <Search size={20} className="text-zinc-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar séries, episódios ou gêneros…"
            className="flex-1 bg-transparent outline-none text-[var(--text-color,white)] text-base placeholder:text-zinc-600"
          />
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 transition-all" aria-label="Fechar busca">
            <X size={18} className="text-zinc-400" />
          </button>
        </div>

        <div className="mt-6 max-h-[70vh] overflow-y-auto pb-12 scrollbar-hide">
          {!hasQuery && (
            <p className="text-center text-zinc-600 font-bold uppercase text-[10px] tracking-[0.4em] py-16">
              Digite pelo menos 2 caracteres
            </p>
          )}

          {hasQuery && loading && (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
            </div>
          )}

          {hasQuery && !loading && !hasResults && (
            <p className="text-center text-zinc-600 font-bold uppercase text-[10px] tracking-[0.4em] py-16">
              Nenhum resultado para "{trimmed}"
            </p>
          )}

          {hasQuery && !loading && series.length > 0 && (
            <section className="mb-8">
              <h3 className="text-zinc-500 font-black uppercase text-[10px] tracking-[0.4em] mb-3 px-1">
                Séries ({series.length})
              </h3>
              <div className="space-y-2">
                {series.map(s => (
                  <button
                    key={s._id}
                    onClick={() => handleSelectSeries(s)}
                    className="w-full flex items-center gap-4 p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all text-left"
                  >
                    <div className="w-14 h-20 rounded-xl overflow-hidden bg-black shrink-0">
                      <ImageWithFallback src={s.cover_image || ''} className="w-full h-full object-cover" alt={s.title} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[var(--text-color,white)] font-bold text-sm truncate">{s.title}</h4>
                      <p className="text-zinc-500 text-xs truncate">{s.genre}</p>
                    </div>
                    {s.content_type && (
                      <span className="flex items-center gap-1 text-rose-500 font-black text-[10px] uppercase tracking-widest shrink-0">
                        <TypeIcon type={s.content_type} /> {TYPE_LABEL[s.content_type] || s.content_type}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}

          {hasQuery && !loading && episodes.length > 0 && (
            <section>
              <h3 className="text-zinc-500 font-black uppercase text-[10px] tracking-[0.4em] mb-3 px-1">
                Episódios ({episodes.length})
              </h3>
              <div className="space-y-2">
                {episodes.map(ep => (
                  <button
                    key={ep._id}
                    onClick={() => handleSelectSeries(ep)}
                    className="w-full flex items-center gap-4 p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all text-left"
                  >
                    <div className="w-14 h-20 rounded-xl overflow-hidden bg-black shrink-0">
                      <ImageWithFallback src={ep.thumbnail || ''} className="w-full h-full object-cover" alt={ep.title} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[var(--text-color,white)] font-bold text-sm truncate">{ep.title}</h4>
                      <p className="text-zinc-500 text-xs truncate">
                        {ep.seriesTitle}{ep.episode_number ? ` • Cap. ${ep.episode_number}` : ''}
                      </p>
                    </div>
                    {ep.content_type && (
                      <span className="flex items-center gap-1 text-rose-500 font-black text-[10px] uppercase tracking-widest shrink-0">
                        <TypeIcon type={ep.content_type} /> {TYPE_LABEL[ep.content_type] || ep.content_type}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};

export default SearchOverlay;
