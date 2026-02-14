
import React, { useState, useEffect } from 'react';
import { Episode, Panel } from '../types';

const WebtoonReader: React.FC<{ episode: Episode, onClose: () => void }> = ({ episode, onClose }) => {
  const [panels, setPanels] = useState<Panel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulação de carregamento de painéis (realmente vindo da API no server.js)
    fetch(`http://localhost:5000/api/episodes/${episode.id}/panels`)
      .then(res => res.json())
      .then(data => {
        setPanels(data);
        setLoading(false);
      });
  }, [episode]);

  return (
    <div className="fixed inset-0 z-[3000] bg-black overflow-y-auto scrollbar-hide animate-apple">
      <header className="fixed top-0 left-0 right-0 h-20 bg-black/60 backdrop-blur-xl border-b border-white/5 flex items-center justify-between px-8 z-[3100]">
        <button onClick={onClose} className="text-white/50 hover:text-white transition-all"><svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
        <div className="text-center">
          <h4 className="text-white font-black text-xs uppercase tracking-widest">{episode.title}</h4>
          <p className="text-rose-500 font-bold text-[10px]">HI-QUA READER</p>
        </div>
        <div className="w-6" />
      </header>

      <div className="flex flex-col items-center pt-20">
        {loading ? (
          <div className="h-screen flex items-center justify-center"><div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
        ) : (
          panels.map((p, idx) => (
            <img key={p.id} src={p.image_url} className="w-full max-w-2xl h-auto block" loading={idx < 3 ? "eager" : "lazy"} />
          ))
        )}
        
        <div className="h-96 flex flex-col items-center justify-center p-20 text-center bg-gradient-to-b from-transparent to-zinc-950 w-full">
           <span className="text-zinc-600 font-black uppercase text-[10px] tracking-[0.4em] mb-8">Fim do Episódio</span>
           <button onClick={onClose} className="px-16 py-5 bg-white text-black font-black rounded-2xl shadow-2xl hover:scale-105 transition-all">CONCLUIR LEITURA</button>
        </div>
      </div>
    </div>
  );
};

export default WebtoonReader;
