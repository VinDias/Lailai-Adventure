
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, User } from '../types';
import { X, ThumbsUp, ThumbsDown } from 'lucide-react';
import AdComponent from './AdComponent';
import { api } from '../services/api';

const BUNNY_CDN_BASE = 'https://vz-fbaa1d24-d2c.b-cdn.net';

interface PlayerProps {
  video: Video;
  user: User | null;
  onClose: () => void;
}

const VerticalPlayer: React.FC<PlayerProps> = ({ video, user, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audio1Ref = useRef<HTMLAudioElement>(null);
  const audio2Ref = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [showAd, setShowAd] = useState(!user?.isPremium);
  const [showMetadata, setShowMetadata] = useState(true);
  const [accessDenied] = useState(video.isPremium && !user?.isPremium);
  const [audioMode, setAudioMode] = useState<'original' | 'audio1' | 'audio2'>(() => {
    return (localStorage.getItem('lorflux_audio_preference') as 'original' | 'audio1' | 'audio2') || 'original';
  });
  const [qualityLevels, setQualityLevels] = useState<any[]>([]);
  const [currentQuality, setCurrentQuality] = useState(-1);
  const [myVote, setMyVote] = useState<'like' | 'dislike' | null>(null);

  // Carrega voto do usuário
  useEffect(() => {
    if (!user || !video.id) return;
    api.getMyVote(video.id).then(v => setMyVote(v?.type ?? null));
  }, [video.id, user]);

  // Inicializa HLS após anúncio e verificação de acesso
  useEffect(() => {
    if (accessDenied || showAd) return;
    initializePlayback();
    return () => {
      hlsRef.current?.destroy();
    };
  }, [showAd, accessDenied]);

  // Sincroniza posição dos áudios alternativos com o vídeo
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const sync = () => {
      if (audio1Ref.current) audio1Ref.current.currentTime = video.currentTime;
      if (audio2Ref.current) audio2Ref.current.currentTime = video.currentTime;
    };
    video.addEventListener('timeupdate', sync);
    return () => video.removeEventListener('timeupdate', sync);
  }, [showAd]);

  // Play/pause sincronizado com faixas de áudio
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => {
      if (audioMode === 'audio1') audio1Ref.current?.play();
      if (audioMode === 'audio2') audio2Ref.current?.play();
    };
    const onPause = () => {
      audio1Ref.current?.pause();
      audio2Ref.current?.pause();
    };
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
    };
  }, [audioMode, showAd]);

  // Controla qual faixa de áudio está ativa
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
    if (video.bunnyVideoId) {
      return `${BUNNY_CDN_BASE}/${video.bunnyVideoId}/playlist.m3u8`;
    }
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
      // Safari native HLS
      v.src = src;
      v.play().catch(() => {});
    } else {
      // Direto (mp4, webm, etc.)
      v.src = src;
      v.play().catch(() => {});
    }
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
      if (myVote === type) {
        await api.removeVote(video.id);
        setMyVote(null);
      } else {
        await api.vote(video.id, type);
        setMyVote(type);
      }
    } catch (e) {
      // silently ignore
    }
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

  return (
    <div className="vertical-player fixed inset-0 z-[1000]">
      <div className="relative w-full h-full max-w-[500px] mx-auto">

        <video
          ref={videoRef}
          className="video"
          playsInline
          onClick={() => setShowMetadata(m => !m)}
        />

        {video.audioTrack1Url && <audio ref={audio1Ref} src={video.audioTrack1Url} />}
        {video.audioTrack2Url && <audio ref={audio2Ref} src={video.audioTrack2Url} />}

        {/* Botão fechar */}
        <button
          onClick={onClose}
          className="absolute top-12 left-6 z-[1200] p-3 bg-black/40 rounded-full border border-white/10 text-white"
        >
          <X size={24} />
        </button>

        {/* Botões Like/Dislike */}
        {user && (
          <div className="absolute top-12 right-6 z-[1200] flex flex-col gap-3">
            <button
              onClick={() => handleVote('like')}
              className={`p-3 rounded-full border transition-all ${myVote === 'like' ? 'bg-rose-600 border-rose-500 text-white' : 'bg-black/40 border-white/10 text-white/70 hover:text-white'}`}
              aria-label="Curtir"
            >
              <ThumbsUp size={22} fill={myVote === 'like' ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={() => handleVote('dislike')}
              className={`p-3 rounded-full border transition-all ${myVote === 'dislike' ? 'bg-zinc-600 border-zinc-500 text-white' : 'bg-black/40 border-white/10 text-white/70 hover:text-white'}`}
              aria-label="Não curtir"
            >
              <ThumbsDown size={22} fill={myVote === 'dislike' ? 'currentColor' : 'none'} />
            </button>
          </div>
        )}

        {/* Metadata overlay */}
        {showMetadata && (
          <div className="absolute bottom-0 left-0 right-0 pb-32 px-8 bg-gradient-to-t from-black via-black/50 to-transparent z-[1100] pointer-events-none">
            <h2 className="text-white font-black text-xl leading-tight mb-1">{video.titulo}</h2>
            <p className="text-zinc-400 text-sm line-clamp-2">{video.descricao}</p>
          </div>
        )}

        {/* Controles: Áudio e Qualidade */}
        {(hasMultiAudio || hasQuality) && (
          <div className="controls z-[1200]">
            {hasMultiAudio && (
              <div className="menu">
                <label>Idioma</label>
                <button
                  onClick={() => changeAudioMode('original')}
                  style={{ background: audioMode === 'original' ? '#E11D48' : undefined }}
                >
                  Original
                </button>
                {hasAudio1 && (
                  <button
                    onClick={() => changeAudioMode('audio1')}
                    style={{ background: audioMode === 'audio1' ? '#E11D48' : undefined }}
                  >
                    Dublagem 1
                  </button>
                )}
                {hasAudio2 && (
                  <button
                    onClick={() => changeAudioMode('audio2')}
                    style={{ background: audioMode === 'audio2' ? '#E11D48' : undefined }}
                  >
                    Dublagem 2
                  </button>
                )}
              </div>
            )}

            {hasQuality && (
              <div className="menu">
                <label>Qualidade</label>
                <button
                  onClick={() => changeQuality(-1)}
                  style={{ background: currentQuality === -1 ? '#E11D48' : undefined }}
                >
                  Auto
                </button>
                {qualityLevels.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => changeQuality(i)}
                    style={{ background: currentQuality === i ? '#E11D48' : undefined }}
                  >
                    {q.height}p
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VerticalPlayer;
