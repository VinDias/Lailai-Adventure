
import React, { useState, useEffect } from 'react';
import { Comic, User } from '../types';
import { ICONS } from '../constants';

interface ComicFeedProps {
  comics: Comic[];
  user: User | null;
  onUpgrade: () => void;
}

const ComicFeed: React.FC<ComicFeedProps> = ({ comics, user, onUpgrade }) => {
  const [readingComic, setReadingComic] = useState<Comic | null>(null);

  // Scroll to top quando abre um conteúdo Hi-Qua
  useEffect(() => {
    if (readingComic) {
      window.scrollTo(0, 0);
    }
  }, [readingComic]);

  if (readingComic) {
    return (
      <div className="relative h-screen w-full bg-[#0A0A0B] overflow-hidden flex justify-center font-lailai animate-apple z-[600]">
        <div className="video-feed h-full w-full max-w-md overflow-y-scroll bg-black relative scroll-smooth">
          {/* Header de Leitura Suspenso */}
          <div className="sticky top-0 left-0 right-0 p-5 flex items-center justify-between glass-nav z-[100] border-b border-white/5">
            <button 
              onClick={() => setReadingComic(null)}
              className="flex items-center gap-2 text-white/50 hover:text-white transition-colors p-2 -ml-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M15 19l-7-7 7-7" strokeWidth={2.5}/></svg>
              <span className="font-bold text-xs uppercase tracking-widest">Hi-Qua</span>
            </button>
            <div className="text-[10px] font-black tracking-[0.2em] text-rose-500 uppercase truncate max-w-[140px] drop-shadow-md">
              {readingComic.title}
            </div>
          </div>

          <div className="pt-16 pb-12 bg-gradient-to-b from-rose-950/40 via-black to-black text-center px-10">
            <h2 className="text-4xl font-black tracking-tighter mb-3 text-white leading-none">{readingComic.title}</h2>
            <p className="text-rose-500 font-bold mb-6 text-sm tracking-wide">Por {readingComic.author}</p>
            <p className="text-zinc-500 text-[13px] leading-relaxed font-medium">{readingComic.description}</p>
          </div>

          {/* Lista de Painéis com Lazy Loading Real */}
          <div className="flex flex-col bg-black">
            {readingComic.panels.map((url, idx) => (
              <div key={idx} className="w-full relative min-h-[400px] bg-zinc-900/10">
                <img 
                  src={url} 
                  alt={`Painel ${idx + 1}`} 
                  className="w-full h-auto object-contain block"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute bottom-4 right-4 bg-black/40 backdrop-blur-xl px-2 py-1 rounded-lg text-[9px] font-black text-white/40 tracking-widest">
                  {String(idx + 1).padStart(2, '0')} — 22
                </div>
              </div>
            ))}
          </div>

          <div className="p-24 text-center bg-gradient-to-t from-zinc-950 to-black border-t border-white/5">
            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 text-zinc-600">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M5 13l4 4L19 7" strokeWidth={3}/></svg>
            </div>
            <p className="text-zinc-600 mb-8 font-bold text-xs uppercase tracking-[0.3em]">Conteúdo Concluído</p>
            <button 
              onClick={() => {
                setReadingComic(null);
                window.scrollTo(0,0);
              }}
              className="bg-white text-black font-black py-4 px-14 rounded-2xl transition-all shadow-2xl hover:scale-105 active:scale-95"
            >
              Voltar para Hi-Qua
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0A0A0B] overflow-y-auto p-6 md:p-20 font-lailai animate-apple pb-24">
      <header className="mb-16 md:mb-24">
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-4 premium-text">Hi-Qua</h1>
        <p className="text-[#86868B] text-lg md:text-xl max-w-md leading-snug font-medium">Histórias verticais em alta definição para o seu smartphone.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12">
        {comics.map((comic) => (
          <div 
            key={comic.id} 
            className="group cursor-pointer perspective-1000"
            onClick={() => setReadingComic(comic)}
          >
            <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden bg-zinc-900/50 mb-6 relative transition-all duration-500 group-hover:scale-[0.97] group-hover:-rotate-1 shadow-2xl ring-1 ring-white/5">
              <img 
                src={comic.thumbnail} 
                className="w-full h-full object-cover opacity-60 group-hover:opacity-90 transition-all duration-700" 
                alt={comic.title} 
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent" />
              <div className="absolute inset-0 p-8 flex flex-col justify-end">
                <span className="text-[10px] font-black text-rose-500 tracking-widest uppercase mb-2 drop-shadow-md">Exclusivo Hi-Qua</span>
                <h3 className="text-3xl font-bold tracking-tight mb-1 text-white leading-tight">{comic.title}</h3>
                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-6">Por {comic.author}</p>
                <div className="flex items-center gap-4 text-[10px] font-black text-white/30 uppercase tracking-widest">
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-rose-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                    {comic.likes}
                  </div>
                  <div className="w-1 h-1 rounded-full bg-white/10" />
                  <span>22 Painéis</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ComicFeed;
