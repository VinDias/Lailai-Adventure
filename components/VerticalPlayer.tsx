
import React, { useState, useEffect, useRef } from 'react';
import { Episode, User, Ad } from '../types';
import { api } from '../services/api';

interface PlayerProps {
  episode: Episode;
  user: User | null;
  onClose: () => void;
}

const VerticalPlayer: React.FC<PlayerProps> = ({ episode, user, onClose }) => {
  const [showAd, setShowAd] = useState(!user?.isPremium);
  const [adDuration, setAdDuration] = useState(60);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const adVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (showAd) {
      const timer = setInterval(() => {
        setAdDuration(prev => (prev > 0 ? prev - 1 : 0));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showAd]);

  const handleAdFinished = () => {
    setShowAd(false);
    setIsPlaying(true);
  };

  return (
    <div className="fixed inset-0 z-[5000] bg-black animate-apple flex justify-center">
      <div className="relative w-full h-full max-w-[calc(100vh*9/16)] bg-zinc-950 overflow-hidden">
        
        {/* Camada de Anúncio (Google IMA / Internal Ad) */}
        {showAd && (
          <div className="absolute inset-0 z-[5100] bg-black">
            <video 
              ref={adVideoRef}
              src="https://v.ftcdn.net/04/55/67/02/700_F_455670233_uG6WqT7pG1E8j6hA2D9Xq7v9zL6x8P9_ST.mp4" 
              autoPlay 
              className="w-full h-full object-cover"
              onEnded={handleAdFinished}
            />
            <div className="absolute top-12 left-8 p-4 glass-card rounded-2xl flex items-center gap-4">
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Patrocinado</span>
              <div className="w-px h-3 bg-white/20" />
              <span className="text-white text-xs font-bold">{adDuration}s</span>
            </div>
            {adDuration <= 55 && (
              <button 
                onClick={handleAdFinished}
                className="absolute bottom-24 right-0 px-10 py-5 bg-black/80 backdrop-blur-3xl border-l border-white/10 text-white font-black text-xs uppercase tracking-[0.2em]"
              >
                Pular Anúncio
              </button>
            )}
          </div>
        )}

        {/* Player Principal HQCINE */}
        <video 
          ref={videoRef}
          src={episode.video_url}
          autoPlay={!showAd}
          loop
          playsInline
          className={`w-full h-full object-cover transition-opacity duration-700 ${showAd ? 'opacity-0' : 'opacity-100'}`}
        />

        {/* UI de Controle Estilo Apple */}
        {!showAd && (
          <>
            <button onClick={onClose} className="absolute top-12 left-8 z-[5200] p-4 bg-black/20 backdrop-blur-3xl rounded-3xl border border-white/5 text-white hover:bg-black/40 transition-all">
              <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none">
              <span className="text-rose-500 font-black text-[10px] uppercase tracking-[0.3em] block mb-2">Originals</span>
              <h2 className="text-3xl font-black text-white mb-2 leading-tight tracking-tighter">{episode.title}</h2>
              <p className="text-zinc-400 text-sm font-medium line-clamp-2 mb-8">{episode.description}</p>
              
              {/* Barra de Progresso Real */}
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 w-1/3 shadow-[0_0_15px_rgba(225,29,72,0.5)]" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerticalPlayer;
