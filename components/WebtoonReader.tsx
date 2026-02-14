
import React, { useState, useEffect, useRef } from 'react';
import { Episode, Panel } from '../types';
import { api } from '../services/api';

const WebtoonReader: React.FC<{ episode: Episode; onClose: () => void }> = ({ episode, onClose }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Busca os painéis limitados a 50 no backend
    api.getPanels(episode.id).then(data => {
      setPanels(data.slice(0, 50)); // Garantia no frontend também
    });

    const handleScroll = () => {
      if (!containerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const currentProgress = (scrollTop / (scrollHeight - clientHeight)) * 100;
      setProgress(currentProgress);
      
      // Salva progresso no backend a cada 20%
      if (Math.floor(currentProgress) % 20 === 0) {
        api.saveReadingProgress(episode.id, currentProgress);
      }
    };

    const container = containerRef.current;
    container?.addEventListener('scroll', handleScroll);
    return () => container?.removeEventListener('scroll', handleScroll);
  }, [episode.id]);

  return (
    <div ref={containerRef} className="fixed inset-0 z-[5000] bg-[#0A0A0B] overflow-y-auto scrollbar-hide animate-apple">
      {/* Header Fixo Minimalista */}
      <header className="fixed top-0 left-0 right-0 h-20 bg-black/60 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-8 z-[5100]">
        <button onClick={onClose} className="text-white/40 hover:text-white transition-all"><svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
        <div className="text-center">
          <h4 className="text-white font-black text-[10px] uppercase tracking-widest">{episode.title}</h4>
          <div className="w-32 h-0.5 bg-white/10 mt-1 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="w-6" />
      </header>

      {/* Grid de Painéis com Lazy Loading Real */}
      <div className="flex flex-col items-center pt-20">
        {panels.map((panel, index) => (
          <div key={panel.id} className="w-full max-w-2xl relative bg-zinc-900 aspect-[800/1280]">
            <img 
              src={panel.image_url} 
              alt={`Panel ${index + 1}`}
              className="w-full h-auto block"
              loading={index < 3 ? "eager" : "lazy"}
              onLoad={(e) => {
                // Validação de tamanho via JS se necessário
              }}
            />
          </div>
        ))}

        {/* Final do Episódio */}
        <div className="w-full py-32 flex flex-col items-center justify-center bg-gradient-to-b from-transparent to-black text-center px-10">
          <span className="text-zinc-700 font-black text-[10px] uppercase tracking-[0.5em] mb-10">Fim do Capítulo</span>
          <div className="flex gap-4">
            <button onClick={onClose} className="px-12 py-5 bg-white text-black font-black rounded-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all">CONCLUIR</button>
            <button className="px-12 py-5 bg-zinc-900 text-white font-black rounded-2xl border border-white/5">PRÓXIMO</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebtoonReader;
