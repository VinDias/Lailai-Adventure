
import React, { useState, useEffect, useRef } from 'react';
import { Episode, Ad, User } from '../types';
import { api } from '../services/api';

const HiQuaFeed: React.FC<{ user: User | null }> = ({ user }) => {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [ad, setAd] = useState<Ad | null>(null);
  const [showAd, setShowAd] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    api.getEpisodes().then(setEpisodes as any);
  }, []);

  const handlePlay = (index: number) => {
    if (!user?.isPremium) {
      api.getRandomAd().then(a => {
        if (a) {
          setAd(a);
          setShowAd(true);
        } else {
          setCurrentIndex(index);
        }
      });
    } else {
      setCurrentIndex(index);
    }
  };

  const current = episodes[currentIndex];

  if (!current) return <div className="h-full w-full bg-black" />;

  return (
    <div className="h-full w-full bg-black relative flex justify-center">
      <div className="relative w-full h-full max-w-[calc(100vh*9/16)] bg-zinc-900 shadow-2xl overflow-hidden">
        {showAd && ad ? (
          <div className="absolute inset-0 z-[2000] bg-black">
             <video src={ad.video_url} autoPlay className="w-full h-full object-cover" onEnded={() => setShowAd(false)} />
             <div className="absolute top-12 left-8 px-3 py-1 bg-amber-500 text-black text-[10px] font-black rounded-sm">ANÚNCIO</div>
             <button onClick={() => setShowAd(false)} className="absolute bottom-12 right-0 px-8 py-4 bg-black/60 border-l border-white/20 text-white font-black text-xs uppercase tracking-widest">Pular em 5s</button>
          </div>
        ) : (
          <>
            <video ref={videoRef} src={current.video_url} autoPlay loop controls className="w-full h-full object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 to-transparent pointer-events-none">
               <h3 className="text-2xl font-black text-white mb-2">{current.title}</h3>
               <p className="text-zinc-400 font-bold text-sm">Produção: {current.series_title}</p>
            </div>
          </>
        )}
      </div>

      {/* Navegação de Feed Lateral */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-6 z-50">
         <button onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))} className="p-4 bg-white/10 backdrop-blur-xl rounded-full border border-white/10 text-white"><svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg></button>
         <button onClick={() => setCurrentIndex(prev => Math.min(episodes.length - 1, prev + 1))} className="p-4 bg-white/10 backdrop-blur-xl rounded-full border border-white/10 text-white"><svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12l7 7 7-7"/></svg></button>
      </div>
    </div>
  );
};

export default HiQuaFeed;
