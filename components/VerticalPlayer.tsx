
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, User } from '../types';
import { X, ThumbsUp, ThumbsDown, Play, Pause, Volume2, VolumeX, Maximize, Settings } from 'lucide-react';
import AdComponent from './AdComponent';
import { api } from '../services/api';
import { useSettings } from '../contexts/SettingsContext';

interface PlayerProps {
  video: Video;
  user: User | null;
  onClose: () => void;
}

const fmt = (s: number) => {
  if (!isFinite(s) || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

const VerticalPlayer: React.FC<PlayerProps> = ({ video, user, onClose }) => {
  const { bunny_cdn_base } = useSettings();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audio1Ref = useRef<HTMLAudioElement>(null);
  const audio2Ref = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showAd, setShowAd] = useState(!user?.isPremium);
  const [accessDenied] = useState(video.isPremium && !user?.isPremium);
  const [audioMode, setAudioMode] = useState<'original' | 'audio1' | 'audio2'>(() =>
    (localStorage.getItem('lorflux_audio_preference') as any) || 'original'
  );
  const [qualityLevels, setQualityLevels] = useState<any[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [myVote, setMyVote] = useState<'like' | 'dislike' | null>(null);

  // Player UI state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    if (!user || !video.id) return;
    api.getMyVote(video.id).then(v => setMyVote(v?.type ?? null));
  }, [video.id, user]);

  useEffect(() => {
    if (accessDenied || showAd) return;
    initializePlayback();
    return () => { hlsRef.current?.destroy(); };
  }, [showAd, accessDenied]);

  // Video event listeners
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      setIsPlaying(true);
      if (audioMode === 'audio1') audio1Ref.current?.play();
      if (audioMode === 'audio2') audio2Ref.current?.play();
    };
    const onPause = () => {
      setIsPlaying(false);
      audio1Ref.current?.pause();
      audio2Ref.current?.pause();
    };
    const onTimeUpdate = () => setCurrentTime(v.currentTime);
    const onLoaded = () => setDuration(v.duration);
    const onVolume = () => setIsMuted(v.muted);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('durationchange', onLoaded);
    v.addEventListener('volumechange', onVolume);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('durationchange', onLoaded);
      v.removeEventListener('volumechange', onVolume);
    };
  }, [showAd, audioMode]);

  // Sync audio tracks with video position
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      if (audio1Ref.current) audio1Ref.current.currentTime = v.currentTime;
      if (audio2Ref.current) audio2Ref.current.currentTime = v.currentTime;
    };
    v.addEventListener('timeupdate', sync);
    return () => v.removeEventListener('timeupdate', sync);
  }, [showAd]);

  // Audio mode switching
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (audioMode === 'original') {
      v.muted = false;
      if (audio1Ref.current) audio1Ref.current.volume = 0;
      if (audio2Ref.current) audio2Ref.current.volume = 0;
    } else if (audioMode === 'audio1') {
      v.muted = true;
      if (audio1Ref.current) audio1Ref.current.volume = 1;
      if (audio2Ref.current) audio2Ref.current.volume = 0;
    } else {
      v.muted = true;
      if (audio1Ref.current) audio1Ref.current.volume = 0;
      if (audio2Ref.current) audio2Ref.current.volume = 1;
    }
  }, [audioMode]);

  const getVideoSrc = () => {
    if (video.bunnyVideoId) return `${bunny_cdn_base}/${video.bunnyVideoId}/playlist.m3u8`;
    return video.arquivoUrl;
  };

  const initializePlayback = () => {
    const v = videoRef.current;
    const src = getVideoSrc();
    if (!v || !src) return;
    if (src.endsWith('.m3u8') && Hls.isSupported()) {
      const hls = new Hls({ autoStartLoad: true, enableWorker: true, lowLatencyMode: true });
      hls.loadSource(src);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setQualityLevels(hls.levels);
        v.play().catch(() => {});
      });
      hlsRef.current = hls;
    } else if (src.endsWith('.m3u8') && v.canPlayType('application/vnd.apple.mpegurl')) {
      v.src = src;
      v.play().catch(() => {});
    } else {
      v.src = src;
      v.play().catch(() => {});
    }
  };

  const revealControls = () => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setShowControls(false);
      setShowSettings(false);
    }, 3500);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(e.target.value);
    v.currentTime = t;
    setCurrentTime(t);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  };

  const changeQuality = (level: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = level;
    setCurrentQuality(level);
  };

  const changeAudioMode = (mode: 'original' | 'audio1' | 'audio2') => {
    setAudioMode(mode);
    localStorage.setItem('lorflux_audio_preference', mode);
  };

  const handleVote = async (type: 'like' | 'dislike') => {
    if (!user) return;
    try {
      if (myVote === type) { await api.removeVote(video.id); setMyVote(null); }
      else { await api.vote(video.id, type); setMyVote(type); }
    } catch {}
  };

  if (showAd) return <AdComponent onFinish={() => setShowAd(false)} />;

  if (accessDenied) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-10 text-center">
        <h2 className="text-3xl font-black text-white mb-4 italic">Conteúdo Premium</h2>
        <p className="text-zinc-500 mb-8">Esta obra é exclusiva para assinantes Lorflux Premium.</p>
        <button onClick={onClose} className="px-12 py-4 bg-rose-600 text-white font-black rounded-2xl">VOLTAR</button>
      </div>
    );
  }

  const hasAudio1 = Boolean(video.audioTrack1Url);
  const hasAudio2 = Boolean(video.audioTrack2Url);
  const hasMultiAudio = hasAudio1 || hasAudio2;
  const hasQuality = qualityLevels.length > 0;
  const hasSettings = hasMultiAudio || hasQuality;
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[1000] bg-black flex items-center justify-center"
      onMouseMove={revealControls}
      onTouchStart={revealControls}
    >
      {/* Video */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        onClick={() => { revealControls(); togglePlay(); }}
      />

      {video.audioTrack1Url && <audio ref={audio1Ref} src={video.audioTrack1Url} />}
      {video.audioTrack2Url && <audio ref={audio2Ref} src={video.audioTrack2Url} />}

      {/* Top bar */}
      <div
        className={`absolute top-0 left-0 right-0 flex items-start justify-between px-4 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 48px)' }}
      >
        <button
          onClick={onClose}
          className="p-3 bg-black/50 backdrop-blur-sm rounded-full border border-white/10 text-white"
        >
          <X size={22} />
        </button>
        {user && (
          <div className="flex gap-2">
            <button
              onClick={() => handleVote('like')}
              className={`p-3 rounded-full border backdrop-blur-sm transition-all ${myVote === 'like' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-black/50 border-white/10 text-white/70'}`}
              aria-label="Curtir"
            >
              <ThumbsUp size={20} fill={myVote === 'like' ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => handleVote('dislike')}
              className={`p-3 rounded-full border backdrop-blur-sm transition-all ${myVote === 'dislike' ? 'bg-zinc-600 border-zinc-500 text-white' : 'bg-black/50 border-white/10 text-white/70'}`}
              aria-label="Não curtir"
            >
              <ThumbsDown size={20} fill={myVote === 'dislike' ? 'currentColor' : 'none'} />
            </button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-16 px-4 pb-4">

          {/* Title */}
          <div className="mb-3">
            <h2 className="text-white font-black text-lg leading-tight drop-shadow">{video.titulo}</h2>
            {video.descricao && (
              <p className="text-zinc-400 text-sm line-clamp-1 mt-0.5">{video.descricao}</p>
            )}
          </div>

          {/* Settings panel */}
          {showSettings && hasSettings && (
            <div className="mb-3 bg-black/80 backdrop-blur-md rounded-2xl p-3 flex flex-wrap gap-4">
              {hasMultiAudio && (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Idioma</div>
                  <div className="flex gap-2">
                    <button onClick={() => changeAudioMode('original')} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${audioMode === 'original' ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>Original</button>
                    {hasAudio1 && <button onClick={() => changeAudioMode('audio1')} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${audioMode === 'audio1' ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>Dub 1</button>}
                    {hasAudio2 && <button onClick={() => changeAudioMode('audio2')} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${audioMode === 'audio2' ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>Dub 2</button>}
                  </div>
                </div>
              )}
              {hasQuality && (
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Qualidade</div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => changeQuality(-1)} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${currentQuality === -1 ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>Auto</button>
                    {qualityLevels.map((q, i) => (
                      <button key={i} onClick={() => changeQuality(i)} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${currentQuality === i ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{q.height}p</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Seek bar */}
          <div className="relative mb-3 group">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              onClick={e => e.stopPropagation()}
              className="w-full h-1 appearance-none rounded-full cursor-pointer focus:outline-none"
              style={{
                background: `linear-gradient(to right, #E11D48 ${pct}%, rgba(255,255,255,0.25) ${pct}%)`
              }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="text-white">
              {isPlaying
                ? <Pause size={28} fill="white" strokeWidth={0} />
                : <Play size={28} fill="white" strokeWidth={0} />
              }
            </button>

            <span className="text-white/60 text-xs font-mono tabular-nums">
              {fmt(currentTime)}&nbsp;/&nbsp;{fmt(duration)}
            </span>

            <div className="flex-1" />

            <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors">
              {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>

            {hasSettings && (
              <button
                onClick={() => setShowSettings(s => !s)}
                className={`transition-colors ${showSettings ? 'text-rose-500' : 'text-white/80 hover:text-white'}`}
              >
                <Settings size={22} />
              </button>
            )}

            <button onClick={toggleFullscreen} className="text-white/80 hover:text-white transition-colors">
              <Maximize size={22} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerticalPlayer;
