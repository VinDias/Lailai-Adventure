
import React, { useState, useEffect } from 'react';
import { Webtoon, User } from '../types';
import API_URL from '../config/api';

interface ReaderProps {
  webtoon: Webtoon;
  user: User | null;
  onClose: () => void;
}

interface PanelItem {
  id: string | number;
  imagemUrl: string;
  ordem: number;
}

const WebtoonReader: React.FC<ReaderProps> = ({ webtoon, user, onClose }) => {
  const [paineis, setPaineis] = useState<PanelItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const episodeId = webtoon.episodeId || webtoon.id;
    loadPanels(episodeId);
  }, [webtoon.id]);

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
              ordem: p.order ?? i
            }));
          setPaineis(mapped);
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      // fallback abaixo
    }

    // Fallback com picsum enquanto não há painéis reais cadastrados
    const fallback = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      imagemUrl: `https://picsum.photos/seed/webtoon-${episodeId}-${i}/800/1280`,
      ordem: i
    }));
    setPaineis(fallback);
    setLoading(false);
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
        <div className="w-10" />
      </header>

      <div className="flex flex-col items-center pt-20">
        {loading ? (
          <div className="h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          </div>
        ) : (
          paineis.map(panel => (
            <img
              key={panel.id}
              src={panel.imagemUrl}
              className="w-full max-w-[800px] h-auto block"
              loading="lazy"
              alt={`Página ${panel.ordem + 1}`}
            />
          ))
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
