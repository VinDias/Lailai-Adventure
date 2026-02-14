
import React, { useEffect, useState, useRef } from 'react';
import { Episode, Panel } from '../types';
import { api } from '../services/api';

const WebtoonReader: React.FC<{ episode: Episode; onClose: () => void }> = ({ episode, onClose }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPanels = async () => {
      try {
        const data = await api.getPanels(episode.id);
        setPanels(data);
      } catch (e) {
        console.error("Erro ao carregar painéis");
      } finally {
        setLoading(false);
      }
    };
    loadPanels();
  }, [episode.id]);

  useEffect(() => {
    if (panels.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const index = parseInt(entry.target.getAttribute('data-index') || '0');
          const progress = Math.round((index / (panels.length - 1)) * 100);
          if (progress % 20 === 0) api.saveReadingProgress(episode.id, progress).catch(() => {});
        }
      });
    }, { threshold: 0.1 });

    const elements = document.querySelectorAll('.hq-panel');
    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [panels, episode.id]);

  return (
    <div className="fixed inset-0 z-[5000] bg-[#0A0A0B] overflow-y-auto scroll-smooth animate-apple">
      <header className="fixed top-0 inset-x-0 h-20 bg-black/80 backdrop-blur-3xl border-b border-white/5 flex items-center justify-between px-8 z-[5100]">
        <button onClick={onClose} className="p-2 text-white/40 hover:text-white transition-all active:scale-90">
          <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
        <span className="text-[10px] font-black uppercase tracking-widest text-white/80 truncate max-w-[200px]">{episode.title}</span>
        <div className="w-10" />
      </header>

      <div className="flex flex-col items-center pt-20">
        {loading ? (
          <div className="w-full h-screen flex items-center justify-center">
             <div className="w-8 h-8 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
          </div>
        ) : panels.length === 0 ? (
          <div className="py-40 text-zinc-700 font-bold uppercase tracking-widest text-xs">Conteúdo indisponível localmente</div>
        ) : (
          panels.map((panel, idx) => (
            <div key={panel.id || idx} data-index={idx} className="hq-panel w-full max-w-2xl bg-zinc-950 min-h-[400px]">
              <img 
                src={panel.image_url} 
                className="w-full h-auto block" 
                loading="lazy" 
                alt={`Painel ${idx + 1}`} 
              />
            </div>
          ))
        )}
      </div>

      <div className="p-24 text-center bg-black border-t border-white/5">
        <p className="text-zinc-800 font-black text-[10px] uppercase tracking-[0.5em] mb-12">Fim do Capítulo</p>
        <button onClick={onClose} className="px-16 py-5 bg-white text-black font-black rounded-2xl hover:scale-105 transition-all shadow-xl active:scale-95">CONCLUIR</button>
      </div>
    </div>
  );
};

export default WebtoonReader;
