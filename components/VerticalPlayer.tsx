
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, User } from '../types';
import { X, ThumbsUp, ThumbsDown, Play, Pause, Volume2, VolumeX, Maximize, Settings, RotateCcw, RotateCw } from 'lucide-react';
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
  const audioModeRef = useRef<'original' | 'audio1' | 'audio2'>('original');

  const [showAd, setShowAd] = useState(!user?.isPremium);
  const [accessDenied] = useState(video.isPremium && !user?.isPremium);
  const [signedSrc, setSignedSrc] = useState<string | null>(null);
  const [audioMode, setAudioMode] = useState<'original' | 'audio1' | 'audio2'>(() => {
    const saved = localStorage.getItem('lorflux_audio_preference') as any;
    return saved || 'original';
  });
  const [qualityLevels, setQualityLevels] = useState<any[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [myVote, setMyVote] = useState<'like' | 'dislike' | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);

  // Player UI state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showQuality, setShowQuality] = useState(false);

  // Keep ref in sync for use inside event handlers without stale closure
  useEffect(() => { audioModeRef.current = audioMode; }, [audioMode]);

  useEffect(() => {
    if (!user || !video.id) return;
    api.getMyVote(video.id).then(v => setMyVote(v?.type ?? null));
  }, [video.id, user]);

  // Busca URL assinada
  useEffect(() => {
    if (accessDenied || showAd) return;
    if (video.bunnyVideoId) {
      api.getSignedVideoUrl(video.bunnyVideoId)
        .then(url => setSignedSrc(url))
        .catch(() => setSignedSrc(`${bunny_cdn_base}/${video.bunnyVideoId}/playlist.m3u8`));
    } else {
      setSignedSrc(video.arquivoUrl);
    }
  }, [showAd, accessDenied]);

  useEffect(() => {
    if (!signedSrc) return;
    initializePlayback();
    return () => { hlsRef.current?.destroy(); };
  }, [signedSrc]);

  // Video event listeners — usa ref para audioMode para evitar closure stale
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      setIsPlaying(true);
      setIsBuffering(false);
      const mode = audioModeRef.current;
      if (mode === 'audio1' && audio1Ref.current) {
        audio1Ref.current.currentTime = v.currentTime;
        audio1Ref.current.play().catch(() => {});
      }
      if (mode === 'audio2' && audio2Ref.current) {
        audio2Ref.current.currentTime = v.currentTime;
        audio2Ref.current.play().catch(() => {});
      }
    };
    const onPause = () => {
      setIsPlaying(false);
      audio1Ref.current?.pause();
      audio2Ref.current?.pause();
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => setIsBuffering(false);
    const onTimeUpdate = () => setCurrentTime(v.currentTime);
    const onLoaded = () => setDuration(v.duration);
    const onVolume = () => setIsMuted(v.muted);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('waiting', onWaiting);
    v.addEventListener('canplay', onCanPlay);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('loadedmetadata', onLoaded);
    v.addEventListener('durationchange', onLoaded);
    v.addEventListener('volumechange', onVolume);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('waiting', onWaiting);
      v.removeEventListener('canplay', onCanPlay);
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('loadedmetadata', onLoaded);
      v.removeEventListener('durationchange', onLoaded);
      v.removeEventListener('volumechange', onVolume);
    };
  }, [showAd]);

  // Sync: só corrige a faixa ATIVA e apenas se deriva > 0.5s
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const sync = () => {
      const mode = audioModeRef.current;
      const activeAudio = mode === 'audio1' ? audio1Ref.current : mode === 'audio2' ? audio2Ref.current : null;
      if (activeAudio && !activeAudio.paused && Math.abs(activeAudio.currentTime - v.currentTime) > 0.5)
        activeAudio.currentTime = v.currentTime;
    };
    v.addEventListener('timeupdate', sync);
    return () => v.removeEventListener('timeupdate', sync);
  }, [showAd]);

  // Audio mode: só volume/muted — .play() fica no changeAudioMode (gesture context)
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

  const initializePlayback = () => {
    const v = videoRef.current;
    const src = signedSrc;
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
    hideTimer.current = setTimeout(() => setShowControls(false), 4000);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const skip = (secs: number) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Math.max(0, Math.min(v.duration || 0, v.currentTime + secs));
    v.currentTime = t;
    if (audio1Ref.current) audio1Ref.current.currentTime = t;
    if (audio2Ref.current) audio2Ref.current.currentTime = t;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = videoRef.current;
    if (!v) return;
    const t = Number(e.target.value);
    v.currentTime = t;
    if (audio1Ref.current) audio1Ref.current.currentTime = t;
    if (audio2Ref.current) audio2Ref.current.currentTime = t;
    setCurrentTime(t);
  };

  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    // Em modo multi-áudio, muta/desmuta o áudio externo
    if (audioMode === 'audio1' && audio1Ref.current) {
      const muted = audio1Ref.current.volume > 0;
      audio1Ref.current.volume = muted ? 0 : 1;
      setIsMuted(muted);
    } else if (audioMode === 'audio2' && audio2Ref.current) {
      const muted = audio2Ref.current.volume > 0;
      audio2Ref.current.volume = muted ? 0 : 1;
      setIsMuted(muted);
    } else {
      v.muted = !v.muted;
    }
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

  // Troca de faixa de áudio — dentro do onClick (gesture context) para não bloquear autoplay
  const changeAudioMode = (mode: 'original' | 'audio1' | 'audio2') => {
    const v = videoRef.current;
    setAudioMode(mode);
    localStorage.setItem('lorflux_audio_preference', mode);
    if (!v) return;
    if (mode === 'original') {
      v.muted = false;
      if (audio1Ref.current) { audio1Ref.current.pause(); audio1Ref.current.volume = 0; }
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current.volume = 0; }
    } else if (mode === 'audio1' && audio1Ref.current) {
      v.muted = true;
      if (audio2Ref.current) { audio2Ref.current.pause(); audio2Ref.current.volume = 0; }
      audio1Ref.current.volume = 1;
      audio1Ref.current.currentTime = v.currentTime;
      if (!v.paused) audio1Ref.current.play().catch(() => {});
    } else if (mode === 'audio2' && audio2Ref.current) {
      v.muted = true;
      if (audio1Ref.current) { audio1Ref.current.pause(); audio1Ref.current.volume = 0; }
      audio2Ref.current.volume = 1;
      audio2Ref.current.currentTime = v.currentTime;
      if (!v.paused) audio2Ref.current.play().catch(() => {});
    }
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

  const LANG_LABELS: Record<string, string> = {
    'pt-br': 'PT-BR', 'en': 'English', 'es': 'Español',
    'ja': '日本語', 'zh': '中文', 'ko': '한국어',
    'fr': 'Français', 'de': 'Deutsch', 'it': 'Italiano',
  };
  const lang1Label = (video.audioTrack1Lang && LANG_LABELS[video.audioTrack1Lang]) || 'Faixa 1';
  const lang2Label = (video.audioTrack2Lang && LANG_LABELS[video.audioTrack2Lang]) || 'Faixa 2';
  const hasQuality = qualityLevels.length > 0;
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

      {/* Áudios externos (preload para buffering antecipado) */}
      {video.audioTrack1Url && <audio ref={audio1Ref} src={video.audioTrack1Url} preload="none" />}
      {video.audioTrack2Url && <audio ref={audio2Ref} src={video.audioTrack2Url} preload="none" />}

      {/* Spinner de buffering */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      )}

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

        <div className="flex gap-2">
          {/* Seletor de faixa de áudio — visível diretamente na barra superior quando disponível */}
          {hasMultiAudio && (
            <div className="flex gap-1 bg-black/50 backdrop-blur-sm rounded-full border border-white/10 p-1">
              <button
                onClick={() => changeAudioMode('original')}
                className={`text-[10px] font-black px-3 py-1.5 rounded-full transition-all ${audioMode === 'original' ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}
              >
                ORIG
              </button>
              {hasAudio1 && (
                <button
                  onClick={() => changeAudioMode('audio1')}
                  className={`text-[10px] font-black px-3 py-1.5 rounded-full transition-all ${audioMode === 'audio1' ? 'bg-rose-600 text-white' : 'text-white/70 hover:text-white'}`}
                >
                  {lang1Label}
                </button>
              )}
              {hasAudio2 && (
                <button
                  onClick={() => changeAudioMode('audio2')}
                  className={`text-[10px] font-black px-3 py-1.5 rounded-full transition-all ${audioMode === 'audio2' ? 'bg-rose-600 text-white' : 'text-white/70 hover:text-white'}`}
                >
                  {lang2Label}
                </button>
              )}
            </div>
          )}

          {user && (
            <>
              <button
                onClick={() => handleVote('like')}
                className={`p-3 rounded-full border backdrop-blur-sm transition-all ${myVote === 'like' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-black/50 border-white/10 text-white/70'}`}
              >
                <ThumbsUp size={18} fill={myVote === 'like' ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => handleVote('dislike')}
                className={`p-3 rounded-full border backdrop-blur-sm transition-all ${myVote === 'dislike' ? 'bg-zinc-600 border-zinc-500 text-white' : 'bg-black/50 border-white/10 text-white/70'}`}
              >
                <ThumbsDown size={18} fill={myVote === 'dislike' ? 'currentColor' : 'none'} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div
        className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
      >
        <div className="bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-20 px-4 pb-4">

          {/* Título */}
          <div className="mb-4">
            <h2 className="text-white font-black text-base leading-tight drop-shadow">{video.titulo}</h2>
            {video.descricao && (
              <p className="text-zinc-400 text-xs line-clamp-1 mt-0.5">{video.descricao}</p>
            )}
          </div>

          {/* Painel de qualidade (opcional) */}
          {showQuality && hasQuality && (
            <div className="mb-3 bg-black/80 backdrop-blur-md rounded-2xl px-4 py-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Qualidade</div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => changeQuality(-1)} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${currentQuality === -1 ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>Auto</button>
                {qualityLevels.map((q, i) => (
                  <button key={i} onClick={() => changeQuality(i)} className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${currentQuality === i ? 'bg-rose-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}>{q.height}p</button>
                ))}
              </div>
            </div>
          )}

          {/* Seek bar */}
          <div className="relative mb-3">
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              onClick={e => e.stopPropagation()}
              className="w-full h-1 appearance-none rounded-full cursor-pointer focus:outline-none"
              style={{ background: `linear-gradient(to right, #E11D48 ${pct}%, rgba(255,255,255,0.2) ${pct}%)` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            {/* Tempo */}
            <span className="text-white/60 text-xs font-mono tabular-nums min-w-[80px]">
              {fmt(currentTime)}&nbsp;/&nbsp;{fmt(duration)}
            </span>

            <div className="flex-1" />

            {/* Skip -10 */}
            <button onClick={() => skip(-10)} className="text-white/80 hover:text-white transition-colors p-1">
              <RotateCcw size={20} />
            </button>

            {/* Play / Pause */}
            <button onClick={togglePlay} className="text-white p-1">
              {isPlaying
                ? <Pause size={30} fill="white" strokeWidth={0} />
                : <Play size={30} fill="white" strokeWidth={0} />
              }
            </button>

            {/* Skip +10 */}
            <button onClick={() => skip(10)} className="text-white/80 hover:text-white transition-colors p-1">
              <RotateCw size={20} />
            </button>

            <div className="flex-1" />

            {/* Mute */}
            <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors p-1">
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>

            {/* Qualidade (só se HLS tiver níveis) */}
            {hasQuality && (
              <button
                onClick={() => setShowQuality(q => !q)}
                className={`transition-colors p-1 ${showQuality ? 'text-rose-500' : 'text-white/80 hover:text-white'}`}
              >
                <Settings size={20} />
              </button>
            )}

            {/* Fullscreen */}
            <button onClick={toggleFullscreen} className="text-white/80 hover:text-white transition-colors p-1">
              <Maximize size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerticalPlayer;
