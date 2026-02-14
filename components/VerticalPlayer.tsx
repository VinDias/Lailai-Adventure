
import React, { useState, useEffect, useRef } from 'react';
import { Episode, User, Ad } from '../types';
import { api } from '../services/api';

const VerticalPlayer: React.FC<{ episode: Episode, user: User | null, onClose: () => void }> = ({ episode, user, onClose }) => {
  const [ad, setAd] = useState<Ad | null>(null);
  const [showAd, setShowAd] = useState(!user?.isPremium);
  const [adTime, setAdTime] = useState(60);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (showAd) {
      api.getRandomAd().then(setAd);
      const timer = setInterval(() => setAdTime(t => t > 0 ? t - 1 : 0), 1000);
      return () => clearInterval(timer);
    }
  }, [showAd]);

  const handleAdEnd = () => setShowAd(false);

  return (
    <div className="fixed inset-0 z-[3000] bg-black animate-apple flex justify-center">
      <div className="relative w-full h-full max-w-[calc(100vh*9/16)] bg-zinc-900 shadow-2xl overflow-hidden">
        {showAd && ad ? (
          <div className="absolute inset-0 z-[3100] bg-black">
             <video src={ad.video_url} autoPlay className="w-full h-full object-cover" onEnded={handleAdEnd} />
             <div className="absolute top-12 left-8 px-4 py-2 bg-black/60 backdrop-blur-xl border border-white/10 rounded-full flex items-center gap-3">
                <span className="text-amber-400 font-black text-[10px] uppercase">Anúncio</span>
                <div className="w-px h-3 bg-white/20" />
                <span className="text-white font-bold text-[10px]">{adTime}s</span>
             </div>
             {adTime <= 55 && (
               <button onClick={handleAdEnd} className="absolute bottom-24 right-0 px-10 py-5 bg-black/80 backdrop-blur-3xl border-l border-white/20 text-white font-black text-xs uppercase tracking-widest">Pular Anúncio</button>
             )}
          </div>
        ) : (
          <>
            <video ref={videoRef} src={episode.video_url} autoPlay controls className="w-full h-full object-cover" />
            <button onClick={onClose} className="absolute top-12 left-8 z-[3200] p-4 bg-black/40 backdrop-blur-3xl rounded-3xl border border-white/10 text-white hover:bg-black/60 transition-all">
              <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <div className="absolute bottom-0 left-0 right-0 p-8 pt-20 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none">
               <h3 className="text-2xl font-black text-white mb-2 leading-tight tracking-tighter">{episode.title}</h3>
               <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Cinema Vertical • 1080p</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerticalPlayer;
