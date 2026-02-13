
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Episode, User } from '../types';
import { ICONS } from '../constants';
import { MOCK_ADS } from '../services/mockData';

interface VideoFeedProps {
  episodes: Episode[];
  user: User | null;
  onUpgrade: () => void;
}

const AD_TRIGGER_TIME = 80;
const MAX_VIDEO_DURATION = 210;

const VideoFeed: React.FC<VideoFeedProps> = ({ episodes, user, onUpgrade }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMidRollAd, setShowMidRollAd] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasAdPlayedForCurrent, setHasAdPlayedForCurrent] = useState<Record<number, boolean>>({});
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const handleVideoPlay = useCallback(async (index: number) => {
    const video = videoRefs.current[index];
    if (video) {
      try {
        videoRefs.current.forEach((v, i) => {
          if (i !== index && v) {
            v.pause();
            v.currentTime = 0; // Reset para economizar memória
          }
        });
        await video.play();
      } catch (err) {
        console.warn("Autoplay impedido. Interação do usuário necessária.", err);
      }
    }
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = Number(entry.target.getAttribute('data-index'));
            setCurrentIndex(index);
          }
        });
      },
      { threshold: 0.8 } // Mais rigoroso para FullHD
    );

    const currentRefs = videoRefs.current;
    currentRefs.forEach((ref) => {
      if (ref?.parentElement) observerRef.current?.observe(ref.parentElement);
    });

    return () => observerRef.current?.disconnect();
  }, [episodes.length]);

  useEffect(() => {
    handleVideoPlay(currentIndex);
  }, [currentIndex, handleVideoPlay, showMidRollAd]);

  const handleTimeUpdate = (index: number) => {
    const video = videoRefs.current[index];
    if (!video || user?.isPremium || index !== currentIndex) return;

    if (video.currentTime >= AD_TRIGGER_TIME && !hasAdPlayedForCurrent[index]) {
      video.pause();
      setShowMidRollAd(true);
      setHasAdPlayedForCurrent(prev => ({ ...prev, [index]: true }));

      setTimeout(() => {
        setShowMidRollAd(false);
      }, 5000); 
    }

    if (video.currentTime >= MAX_VIDEO_DURATION) {
      video.pause();
      video.currentTime = MAX_VIDEO_DURATION;
    }
  };

  return (
    <div className="relative h-screen w-full bg-[#050505] overflow-hidden flex justify-center font-lailai">
      {/* Mute Toggle Global */}
      <button 
        onClick={() => setIsMuted(!isMuted)}
        className="fixed top-6 right-6 z-[100] p-3 bg-black/20 backdrop-blur-xl border border-white/10 rounded-2xl text-white/70 hover:text-white transition-all active:scale-90 md:top-10 md:right-10"
      >
        {isMuted ? (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
        ) : (
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
        )}
      </button>

      <div className="video-feed h-full w-full max-w-[calc(100vh*9/16)] overflow-y-scroll snap-y snap-mandatory bg-black">
        {episodes.map((ep, idx) => (
          <div 
            key={ep.id} 
            data-index={idx}
            className="h-full w-full snap-start relative bg-black flex items-center justify-center overflow-hidden"
          >
            {showMidRollAd && idx === currentIndex && (
              <div className="absolute inset-0 z-[60] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center animate-apple">
                <video autoPlay loop muted className="absolute inset-0 w-full h-full object-cover opacity-10" src={MOCK_ADS[0].videoUrl} />
                <div className="relative z-10 text-center p-10 max-w-[320px]">
                  <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-black font-black text-xl italic shadow-2xl mx-auto mb-8">LL</div>
                  <h2 className="text-4xl font-black mb-4 tracking-tighter text-white">FullHD Premium</h2>
                  <p className="text-white/40 text-sm mb-10 leading-relaxed">Sua experiência 1080p sem interrupções está a um clique.</p>
                  <button 
                    onClick={onUpgrade} 
                    className="w-full bg-white text-black font-black py-5 rounded-3xl shadow-2xl hover:bg-zinc-200 transition-all active:scale-95 mb-4"
                  >
                    Cinema Pass
                  </button>
                  <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Continuando em 5s</div>
                </div>
              </div>
            )}

            {/* O Player 9:16 Otimizado */}
            <div className="relative w-full h-full aspect-[9/16] bg-zinc-900">
              <video
                ref={el => { videoRefs.current[idx] = el; }}
                src={ep.videoUrl}
                className="w-full h-full object-cover"
                loop={false}
                playsInline
                muted={isMuted}
                preload="auto"
                onTimeUpdate={() => handleTimeUpdate(idx)}
                poster={ep.thumbnail}
              >
                {/* Suporte explícito de tipos para navegadores antigos/específicos */}
                <source src={ep.videoUrl} type="video/mp4" />
                Seu navegador não suporta vídeos FullHD H.264/H.265.
              </video>
              
              {/* FullHD Badge */}
              <div className="absolute top-8 left-8 z-50 pointer-events-none opacity-40">
                <div className="px-2 py-0.5 rounded-md border border-white/20 bg-black/20 backdrop-blur-md text-[8px] font-black text-white uppercase tracking-widest">
                  1080p • FullHD
                </div>
              </div>
            </div>

            {/* UI Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 flex flex-col justify-end p-8 pb-32 pointer-events-none z-40">
                <div className="max-w-[80%] animate-apple">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-full bg-white/10 border border-white/10 overflow-hidden">
                        <img src={`https://picsum.photos/seed/${ep.id}/100`} alt="Creator" className="w-full h-full object-cover" />
                      </div>
                      <h3 className="text-lg font-black tracking-tight text-white drop-shadow-md">@{ep.title.toLowerCase().replace(/\s/g, '')}</h3>
                    </div>
                    <p className="text-[14px] text-white/70 font-medium leading-relaxed drop-shadow-sm">{ep.description}</p>
                </div>
            </div>

            <div className="absolute right-6 bottom-32 flex flex-col gap-8 items-center z-50">
              <ActionButton icon={ICONS.Heart} label={ep.likes} color="hover:text-rose-500" />
              <ActionButton icon={ICONS.Message} label={ep.comments} color="hover:text-white" />
              <ActionButton icon={ICONS.Share} label="" color="hover:text-indigo-400" />
            </div>

            {/* Barra de Progresso FullHD */}
            <div className="absolute top-0 left-0 right-0 p-1 z-50">
              <div className="h-[2px] w-full bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-white shadow-[0_0_15px_rgba(255,255,255,1)] transition-all duration-300 ease-linear" 
                  style={{ width: `${(videoRefs.current[idx]?.currentTime || 0) / MAX_VIDEO_DURATION * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ActionButton: React.FC<{ icon: React.ReactNode, label: string | number, color: string }> = ({ icon, label, color }) => (
  <button className={`flex flex-col items-center group transition-all active:scale-90 ${color}`}>
    <div className="w-14 h-14 rounded-full bg-black/20 backdrop-blur-2xl border border-white/5 flex items-center justify-center text-white/50 group-hover:scale-110 transition-transform">
      {icon}
    </div>
    {label && <span className="text-[10px] font-black mt-2 text-white/30 tracking-widest uppercase">{label}</span>}
  </button>
);

export default VideoFeed;
