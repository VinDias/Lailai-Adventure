
import React, { useEffect, useState, useRef } from 'react';
import { Episode, Panel } from '../types';
import { api } from '../services/api';

const WebtoonReader: React.FC<{ episode: Episode; onClose: () => void }> = ({ episode, onClose }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getPanels(episode.id).then(data => {
      setPanels(data);
      setLoading(false);
    });
  }, [episode.id]);

  // Observer para rastrear progresso e salvar no DB
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const index = parseInt(entry.target.getAttribute('data-index') || '0');
            const progress = (index / panels.length) * 100;
            if (progress % 20 === 0) api.saveReadingProgress(episode.id, progress);
          }
        });
      },
      { threshold: 0.5 }
    );

    const elements = document.querySelectorAll('.hq-panel');
    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [panels, episode.id]);

  return (
    <div className="fixed inset-0 z-[5000] bg-[#0A0A0B] overflow-y-auto scrollbar-hide animate-apple">
      <header className="fixed top-0 inset-x-0 h-20 glass-nav border-b border-white/5 flex items-center justify-between px-8 z-[5100]">
        <button onClick={onClose} className="text-white/40 hover:text-white transition-all">
          <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <h4 className="text-[10px] font-black uppercase tracking-widest text-white/80">{episode.title}</h4>
        <div className="w-6" />
      </header>

      <div className="flex flex-col items-center pt-20">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="w-full max-w-2xl aspect-[800/1280] skeleton mb-1" />
          ))
        ) : (
          panels.map((panel, idx) => (
            <div 
              key={panel.id} 
              data-index={idx}
              className="hq-panel w-full max-w-2xl bg-zinc-900 aspect-[800/1280]"
            >
              <img 
                src={panel.image_url} 
                className="w-full h-auto block" 
                loading="lazy" 
                alt={`P${idx}`} 
              />
            </div>
          ))
        )}
      </div>

      <div className="p-20 text-center bg-black">
        <p className="text-zinc-700 font-bold text-xs uppercase tracking-[0.4em] mb-10">Fim do Capítulo</p>
        <button onClick={onClose} className="px-16 py-5 bg-white text-black font-black rounded-2xl hover:scale-105 transition-transform">CONCLUIR</button>
      </div>
    </div>
  );
};

export default WebtoonReader;
