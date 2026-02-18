
import React, { useState, useEffect } from 'react';
import { Webtoon, Panel, User } from '../types';

interface ReaderProps {
  webtoon: Webtoon;
  user: User | null;
  onClose: () => void;
}

const WebtoonReader: React.FC<ReaderProps> = ({ webtoon, user, onClose }) => {
  const [paineis, setPaineis] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulação de busca de painéis validados (800x1280)
    const mockPaineis = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`,
      webtoonId: webtoon.id,
      ordem: i,
      imagemUrl: `https://picsum.photos/seed/webtoon-${i}/800/1280`,
      largura: 800,
      altura: 1280
    }));
    
    setTimeout(() => {
      setPaineis(mockPaineis);
      setLoading(false);
    }, 1000);
  }, [webtoon.id]);

  return (
    <div className="fixed inset-0 z-[2000] bg-[#0A0A0B] overflow-y-auto scroll-smooth animate-apple">
      
      {/* Top Bar Reader */}
      <header className="fixed top-0 inset-x-0 h-20 bg-black/90 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 z-[2100]">
        <button onClick={onClose} className="p-3 text-white/50 hover:text-white transition-all">
          <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <div className="text-center">
          <h1 className="text-xs font-black text-white uppercase tracking-widest truncate max-w-[200px]">{webtoon.titulo}</h1>
          <p className="text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">HI-QUA READER • {webtoon.numeroPaineis} PAINÉIS</p>
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
