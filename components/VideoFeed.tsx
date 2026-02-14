
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
const NORMALIZATION_GAIN = 0.65; 

const VideoFeed: React.FC<VideoFeedProps> = ({ episodes, user, onUpgrade }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showMidRollAd, setShowMidRollAd] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(0.8);
  const [hasAdPlayedForCurrent, setHasAdPlayedForCurrent] = useState<Record<number, boolean>>({});
  const [currentTime, setCurrentTime] = useState(0);
  const [showMuteIndicator, setShowMuteIndicator] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const applyNormalizedVolume = useCallback((video: HTMLVideoElement) => {
    video.volume = isMuted ? 0 : (volume * NORMALIZATION_GAIN);
    video.muted = isMuted;
  }, [isMuted, volume]);

  const safePlay = useCallback(async (video: HTMLVideoElement) => {
    try {
      if (playPromiseRef.current) await playPromiseRef.current;
      playPromiseRef.current = video.play();
      await playPromiseRef.current;
      setIsPlaying(true);
    } catch (err: any) {
      if (err.name !== 'AbortError') console.warn("Playback error:", err);
      setIsPlaying(false);
    } finally {
      playPromiseRef.current = null;
    }
  }, []);

  const safePause = useCallback(async (video: HTMLVideoElement) => {
    if (playPromiseRef.current) {
      try { await playPromiseRef.current; } catch (e) {}
    }
    video.pause();
    setIsPlaying(false);
  }, []);

  const handleVideoPlay = useCallback(async (index: number) => {
    const video = videoRefs.current[index];
    if (video) {
      for (let i = 0; i < videoRefs.current.length; i++) {
        const v = videoRefs.current[i];
        if (i !== index && v && !v.paused) {
          await safePause(v);
          v.currentTime = 0;
        }
      }
      applyNormalizedVolume(video);
      await safePlay(video);
      if (isMuted) {
        setShowMuteIndicator(true);
        setTimeout(() => setShowMuteIndicator(false), 2000);
      }
    }
  }, [isMuted, applyNormalizedVolume, safePlay, safePause]);

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
      { threshold: 0.8 }
    );
    videoRefs.current.forEach((ref) => {
      if (ref?.parentElement) observerRef.current?.observe(ref.parentElement);
    });
    return () => observerRef.current?.disconnect();
  }, [episodes.length]);

  useEffect(() => {
    if (!showMidRollAd) handleVideoPlay(currentIndex);
  }, [currentIndex, handleVideoPlay, showMidRollAd]);

  useEffect(() => {
    const video = videoRefs.current[currentIndex];
    if (video) applyNormalizedVolume(video);
  }, [volume, isMuted, currentIndex, applyNormalizedVolume]);

  const handleTimeUpdate = (index: number) => {
    const video = videoRefs.current[index];
    if (!video || index !== currentIndex) return;
    setCurrentTime(video.currentTime);
    if (!user?.isPremium && video.currentTime >= AD_TRIGGER_TIME && !hasAdPlayedForCurrent[index]) {
      safePause(video);
      setShowMidRollAd(true);
      setHasAdPlayedForCurrent(prev => ({ ...prev, [index]: true }));
      setTimeout(() => setShowMidRollAd(false), 5000); 
    }
    if (video.currentTime >= MAX_VIDEO_DURATION) {
      safePause(video);
      video.currentTime = MAX_VIDEO_DURATION;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    const video = videoRefs.current[currentIndex];
    if (video) { video.currentTime = time; setCurrentTime(time); }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
    setShowMuteIndicator(true);
    setTimeout(() => setShowMuteIndicator(false), 1500);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    if (newVol > 0) setIsMuted(false);
    else setIsMuted(true);
  };

  const togglePlayback = () => {
    const video = videoRefs.current[currentIndex];
    if (video) video.paused ? safePlay(video) : safePause(video);
  };

  return (
    <div className="relative h-screen w-full bg-[#050505] overflow-hidden flex justify-center font-lailai">
      {showMuteIndicator && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] bg-black/60 backdrop-blur-xl px-6 py-3 rounded-2xl flex items-center gap-3 animate-apple border border-white/10 shadow-2xl">
          <div className="text-white/80">{isMuted ? ICONS.Mute : ICONS.Volume}</div>
          <span className="text-xs font-black uppercase tracking-widest text-white/80">{isMuted ? 'Mudo' : `Volume ${Math.round(volume * 100)}%`}</span>
        </div>
      )}

      <div className="video-feed h-full w-full max-w-[calc(100vh*9/16)] overflow-y-scroll snap-y snap-mandatory bg-black scrollbar-hide">
        {episodes.map((ep, idx) => (
          <div key={ep.id} data-index={idx} className="h-full w-full snap-start relative bg-black flex items-center justify-center overflow-hidden">
            {showMidRollAd && idx === currentIndex && (
              <div className="absolute inset-0 z-[60] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center animate-apple">
                <video autoPlay loop muted className="absolute inset-0 w-full h-full object-cover opacity-10" src={MOCK_ADS[0].videoUrl} />
                <div className="relative z-10 text-center p-10 max-w-[320px]">
                  <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center text-black font-black text-xl italic shadow-2xl mx-auto mb-8">LL</div>
                  <h2 className="text-4xl font-black mb-4 tracking-tighter text-white">Assinantes</h2>
                  <p className="text-white/40 text-sm mb-10 leading-relaxed">Sua experiência 1080p sem interrupções.</p>
                  <button onClick={onUpgrade} className="w-full bg-white text-black font-black py-5 rounded-3xl shadow-2xl hover:bg-zinc-200 transition-all active:scale-95 mb-4">Assinantes e Anunciantes</button>
                  <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.3em]">Continuando em 5s</div>
                </div>
              </div>
            )}

            <div className="relative w-full h-full aspect-[9/16] bg-zinc-900 group" onClick={togglePlayback}>
              <video
                ref={el => { videoRefs.current[idx] = el; }}
                className="w-full h-full object-cover"
                loop={false} playsInline muted={isMuted} preload="auto"
                onTimeUpdate={() => handleTimeUpdate(idx)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                poster={ep.thumbnail}
              >
                <source src={ep.videoUrl} type="video/mp4" />
              </video>
              <div className={`absolute inset-0 flex items-center justify-center z-50 pointer-events-none transition-all duration-300 ${isPlaying ? 'opacity-0 scale-150' : 'opacity-100 scale-100'}`}>
                <div className="w-24 h-24 bg-black/20 backdrop-blur-xl rounded-full flex items-center justify-center text-white border border-white/20 shadow-2xl">
                  {isPlaying ? ICONS.Pause : ICONS.Play}
                </div>
              </div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10 flex flex-col justify-end p-8 pb-36 pointer-events-none z-40">
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

            {/* YouTube-Style Precision Volume Control */}
            <div className="absolute right-6 bottom-36 flex flex-col gap-6 items-center z-50 pointer-events-auto">
              <div className="flex flex-col items-center gap-4 group/vol mb-2 relative">
                {/* 
                  Identical to YouTube: 
                  - h-[120px]: Decent, standard height.
                  - bg-black/20 with backdrop-blur-xl: Sophisticated YouTube-like translucent background.
                  - w-1: Ultra-slim bar.
                */}
                <div className="absolute bottom-full mb-6 h-[120px] w-8 bg-black/20 backdrop-blur-xl rounded-lg flex items-center justify-center opacity-0 group-hover/vol:opacity-100 transition-all duration-200 translate-y-2 group-hover/vol:translate-y-0 shadow-xl border border-white/10">
                  <input 
                    type="range" min="0" max="1" step="0.01" 
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="yt-volume-slider w-[100px] h-[3px] appearance-none bg-white/20 rounded-full outline-none cursor-pointer"
                    style={{ transform: 'rotate(-90deg)', transformOrigin: 'center' }}
                  />
                </div>
                <button onClick={toggleMute} className="w-14 h-14 rounded-full bg-black/30 backdrop-blur-2xl border border-white/5 flex items-center justify-center text-white/50 hover:text-white hover:scale-110 transition-all active:scale-90">
                  {isMuted || volume === 0 ? ICONS.Mute : ICONS.Volume}
                </button>
              </div>

              <ActionButton icon={ICONS.Heart} label={ep.likes} color="hover:text-rose-500" />
              <ActionButton icon={ICONS.Message} label={ep.comments} color="hover:text-white" />
              <ActionButton icon={ICONS.Share} label="" color="hover:text-indigo-400" />
            </div>

            <div className="absolute bottom-28 left-0 right-0 px-4 z-[55] pointer-events-auto group/seek">
              <input 
                type="range" min="0" max={MAX_VIDEO_DURATION} step="0.1" value={currentTime} onChange={handleSeek}
                className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none cursor-pointer transition-all group-hover/seek:h-2 custom-seek-slider"
              />
            </div>
          </div>
        ))}
      </div>
      <style>{`
        .yt-volume-slider::-webkit-slider-runnable-track {
          background: linear-gradient(to right, white 0%, white calc(var(--volume-percent, 80%)), rgba(255, 255, 255, 0.2) calc(var(--volume-percent, 80%)), rgba(255, 255, 255, 0.2) 100%);
          height: 3px;
          border-radius: 4px;
        }
        
        /* YouTube-Style Knob */
        .yt-volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 12px;
          height: 12px;
          background: white;
          border-radius: 50%;
          margin-top: -4.5px;
          box-shadow: 0 0 5px rgba(0,0,0,0.5);
          transition: transform 0.1s;
        }
        
        .yt-volume-slider:active::-webkit-slider-thumb {
          transform: scale(1.2);
        }

        .custom-seek-slider::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; background: white; border-radius: 50%; box-shadow: 0 0 10px rgba(0,0,0,0.5); cursor: pointer; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
};

const ActionButton: React.FC<{ icon: React.ReactNode, label: string | number, color: string }> = ({ icon, label, color }) => (
  <button className={`flex flex-col items-center group transition-all active:scale-90 ${color}`}>
    <div className="w-14 h-14 rounded-full bg-black/30 backdrop-blur-2xl border border-white/5 flex items-center justify-center text-white/50 group-hover:scale-110 transition-transform">
      {icon}
    </div>
    {label && <span className="text-[10px] font-black mt-2 text-white/30 tracking-widest uppercase">{label}</span>}
  </button>
);

export default VideoFeed;
