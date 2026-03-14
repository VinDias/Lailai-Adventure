
import React, { useState, useEffect } from 'react';
import { Webtoon, User } from '../types';
import API_URL from '../config/api';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { api } from '../services/api';

interface ReaderProps {
  webtoon: Webtoon;
  user: User | null;
  onClose: () => void;
}

interface TranslationLayer {
  language: string;
  imageUrl: string;
}

interface PanelItem {
  id: string | number;
  imagemUrl: string;
  ordem: number;
  translationLayers?: TranslationLayer[];
}

type Language = 'pt' | 'en' | 'es' | 'zh';
const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'pt', label: 'PT' },
  { code: 'en', label: 'EN' },
  { code: 'es', label: 'ES' },
  { code: 'zh', label: 'ZH' },
];

const WebtoonReader: React.FC<ReaderProps> = ({ webtoon, user, onClose }) => {
  const [paineis, setPaineis] = useState<PanelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('lorflux_language') as Language) || 'pt';
  });
  const [myVote, setMyVote] = useState<'like' | 'dislike' | null>(null);

  useEffect(() => {
    const episodeId = webtoon.episodeId || webtoon.id;
    loadPanels(episodeId);
  }, [webtoon.id]);

  useEffect(() => {
    if (!user || !webtoon.id) return;
    const episodeId = webtoon.episodeId || webtoon.id;
    api.getMyVote(episodeId).then(v => setMyVote(v?.type ?? null));
  }, [webtoon.id, user]);

  const loadPanels = async (episodeId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/content/episodes/${episodeId}`);
      if (res.ok) {
        const episode = await res.json();
        if (episode.panels && episode.panels.length > 0) {
          const mapped = episode.panels
            .sort((a: any, b: any) => a.order - b.order)
            .map((p: any, i: number) => ({
              id: p._id || i,
              imagemUrl: p.image_url,
              ordem: p.order ?? i,
              translationLayers: p.translationLayers || []
            }));
          setPaineis(mapped);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      // empty state
    }
    setPaineis([]);
    setLoading(false);
  };

  const changeLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('lorflux_language', lang);
  };

  const handleVote = async (type: 'like' | 'dislike') => {
    if (!user) return;
    const episodeId = webtoon.episodeId || webtoon.id;
    try {
      if (myVote === type) {
        await api.removeVote(episodeId);
        setMyVote(null);
      } else {
        await api.vote(episodeId, type);
        setMyVote(type);
      }
    } catch (e) {
      // silently ignore
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-[#0A0A0B] overflow-y-auto scroll-smooth animate-apple">

      <header className="fixed top-0 inset-x-0 h-20 bg-black/90 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 z-[2100]">
        <button onClick={onClose} className="p-3 text-white/50 hover:text-white transition-all">
          <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <div className="text-center">
          <h1 className="text-xs font-black text-white uppercase tracking-widest truncate max-w-[200px]">{webtoon.titulo}</h1>
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">HI-QUA READER • {paineis.length} PAINÉIS</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Seletor de idioma */}
          <div className="flex gap-1">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={`px-2 py-1 text-[10px] font-black rounded-lg transition-all ${language === lang.code ? 'bg-rose-600 text-white' : 'bg-white/10 text-zinc-400 hover:text-white'}`}
              >
                {lang.label}
              </button>
            ))}
          </div>
          {/* Like/Dislike */}
          {user && (
            <div className="flex gap-1 ml-2">
              <button
                onClick={() => handleVote('like')}
                className={`p-2 rounded-lg border transition-all ${myVote === 'like' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                aria-label="Curtir"
              >
                <ThumbsUp size={16} fill={myVote === 'like' ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => handleVote('dislike')}
                className={`p-2 rounded-lg border transition-all ${myVote === 'dislike' ? 'bg-zinc-600 border-zinc-500 text-white' : 'bg-white/5 border-white/10 text-white/50 hover:text-white'}`}
                aria-label="Não curtir"
              >
                <ThumbsDown size={16} fill={myVote === 'dislike' ? 'currentColor' : 'none'} />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-col items-center pt-20 gap-0">
        {loading ? (
          <div className="h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          </div>
        ) : paineis.length === 0 ? (
          <div className="h-screen flex items-center justify-center flex-col gap-4">
            <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhum painel disponível</p>
          </div>
        ) : (
          paineis.map(panel => {
            const translationLayer = panel.translationLayers?.find(l => l.language === language);
            return (
              <div key={panel.id} className="relative w-full max-w-[800px] leading-none overflow-hidden">
                <img
                  src={panel.imagemUrl}
                  className="w-full h-auto block"
                  loading="lazy"
                  alt={`Página ${panel.ordem + 1}`}
                />
                {translationLayer && (
                  <img
                    src={translationLayer.imageUrl}
                    className="absolute top-0 left-0 w-full h-auto pointer-events-none"
                    loading="lazy"
                    alt=""
                    aria-hidden="true"
                  />
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="p-20 text-center bg-black border-t border-white/5">
        <span className="text-zinc-800 font-black text-[10px] uppercase tracking-[0.6em] mb-12 block">Fim do Capítulo</span>
        <button onClick={onClose} className="px-20 py-5 bg-white text-black font-black rounded-2xl hover:scale-105 transition-all shadow-2xl">CONCLUIR</button>
      </div>
    </div>
  );
};

export default WebtoonReader;
