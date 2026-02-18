
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, User } from '../types';

declare const google: any;

interface PlayerProps {
  video: Video;
  user: User | null;
  onClose: () => void;
}

const VerticalPlayer: React.FC<PlayerProps> = ({ video, user, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const [isAdPlaying, setIsAdPlaying] = useState(!user?.isPremium);
  const [showMetadata, setShowMetadata] = useState(true);

  useEffect(() => {
    if (isAdPlaying) {
      initializeAds();
    } else {
      initializeHLS();
    }
  }, [isAdPlaying]);

  const initializeAds = () => {
    if (typeof google === 'undefined' || !adContainerRef.current) {
      setIsAdPlaying(false);
      return;
    }
    
    // Simulação do IMA SDK Flow
    const adDisplayContainer = new google.ima.AdDisplayContainer(adContainerRef.current, videoRef.current);
    adDisplayContainer.initialize();
    
    // Fallback de 5s para demonstração
    setTimeout(() => setIsAdPlaying(false), 5000);
  };

  const initializeHLS = () => {
    if (!videoRef.current) return;
    const v = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(video.arquivoUrl);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => v.play());
    } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = video.arquivoUrl;
      v.play();
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center animate-apple">
      <div className="relative w-full h-full max-w-[500px] overflow-hidden bg-zinc-900 shadow-2xl">
        
        {isAdPlaying && (
          <div ref={adContainerRef} className="absolute inset-0 z-[1100] bg-black flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
            <span className="text-white font-black text-[10px] tracking-widest uppercase">Publicidade LaiLai</span>
          </div>
        )}

        <video 
          ref={videoRef} 
          className="w-full h-full object-cover" 
          playsInline 
          onClick={() => setShowMetadata(!showMetadata)}
        />

        {/* Header Control */}
        <button 
          onClick={onClose}
          className="absolute top-12 left-6 z-[1200] p-3 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 text-white"
        >
          <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>

        {/* Metadata Overlay Netflix-style */}
        <div className={`absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black via-black/80 to-transparent transition-opacity duration-500 ${showMetadata ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{video.categoria}</span>
            {video.isPremium && <span className="bg-amber-500 text-black text-[8px] font-black px-2 py-0.5 rounded-sm">PREMIUM</span>}
          </div>
          <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">{video.titulo}</h2>
          <p className="text-zinc-400 text-sm mb-4 line-clamp-2">{video.descricao}</p>
          <div className="flex items-center gap-4 text-xs font-bold text-zinc-500">
            <span>{video.duracao} min</span>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span>Full HD H.264</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerticalPlayer;
