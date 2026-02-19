
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, User } from '../types';
import { Volume2, VolumeX, Settings } from 'lucide-react';

declare const google: any;

interface PlayerProps {
  video: Video;
  user: User | null;
  onClose: () => void;
}

const VerticalPlayer: React.FC<PlayerProps> = ({ video, user, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioTrack1Ref = useRef<HTMLAudioElement>(null);
  const audioTrack2Ref = useRef<HTMLAudioElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  
  const [isAdPlaying, setIsAdPlaying] = useState(!user?.isPremium);
  const [showMetadata, setShowMetadata] = useState(true);
  const [accessDenied, setAccessDenied] = useState(video.isPremium && !user?.isPremium);
  const [activeAudio, setActiveAudio] = useState<'main' | 'track1' | 'track2'>('main');
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (accessDenied) return;
    if (isAdPlaying) {
      initializeAds();
    } else {
      initializePlayback();
    }
  }, [isAdPlaying, accessDenied]);

  // Sincronização de áudio secundário
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const handleSync = () => {
      if (activeAudio === 'track1' && audioTrack1Ref.current) {
        audioTrack1Ref.current.currentTime = v.currentTime;
      } else if (activeAudio === 'track2' && audioTrack2Ref.current) {
        audioTrack2Ref.current.currentTime = v.currentTime;
      }
    };

    const handlePlaySync = () => {
      if (activeAudio === 'track1' && audioTrack1Ref.current) audioTrack1Ref.current.play();
      if (activeAudio === 'track2' && audioTrack2Ref.current) audioTrack2Ref.current.play();
    };

    const handlePauseSync = () => {
      if (audioTrack1Ref.current) audioTrack1Ref.current.pause();
      if (audioTrack2Ref.current) audioTrack2Ref.current.pause();
    };

    v.addEventListener('timeupdate', handleSync);
    v.addEventListener('play', handlePlaySync);
    v.addEventListener('pause', handlePauseSync);

    return () => {
      v.removeEventListener('timeupdate', handleSync);
      v.removeEventListener('play', handlePlaySync);
      v.removeEventListener('pause', handlePauseSync);
    };
  }, [activeAudio]);

  const initializeAds = () => {
    if (typeof google === 'undefined' || !adContainerRef.current) {
      setIsAdPlaying(false);
      return;
    }
    const adDisplayContainer = new google.ima.AdDisplayContainer(adContainerRef.current, videoRef.current);
    adDisplayContainer.initialize();
    setTimeout(() => setIsAdPlaying(false), 5000);
  };

  const initializePlayback = async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    
    // Tenta determinar o URL do HLS baseado na estrutura de pastas
    // Se o vídeo está em /uploads/videos/hqcine/titulo/video.mp4
    // O master deve estar em /uploads/videos/hqcine/titulo/master.m3u8
    const videoBaseUrl = video.arquivoUrl.substring(0, video.arquivoUrl.lastIndexOf('/'));
    const hlsUrl = `${videoBaseUrl}/master.m3u8`;

    try {
      // Verifica se o master.m3u8 existe antes de tentar carregar
      const response = await fetch(hlsUrl, { method: 'HEAD' });
      const hlsExists = response.ok;

      if (hlsExists && Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });
        hls.loadSource(hlsUrl);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => v.play());
        
        // Error handling para HLS
        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
             console.warn("[HLS] Erro fatal no streaming. Tentando fallback para MP4.");
             hls.destroy();
             v.src = video.arquivoUrl;
             v.play();
          }
        });
      } else if (hlsExists && v.canPlayType('application/vnd.apple.mpegurl')) {
        // Suporte nativo Safari (iOS)
        v.src = hlsUrl;
        v.play();
      } else {
        // Fallback total para o arquivo original MP4
        console.log("[Player] Usando arquivo original (MP4) como fallback.");
        v.src = video.arquivoUrl;
        v.play();
      }
    } catch (err) {
      console.warn("[Player] Falha na detecção de HLS. Usando MP4 original.");
      v.src = video.arquivoUrl;
      v.play();
    }
  };

  const handleAudioChange = (track: 'main' | 'track1' | 'track2') => {
    setActiveAudio(track);
    const v = videoRef.current;
    if (!v) return;

    if (track === 'main') {
      v.muted = isMuted;
      if (audioTrack1Ref.current) audioTrack1Ref.current.muted = true;
      if (audioTrack2Ref.current) audioTrack2Ref.current.muted = true;
    } else if (track === 'track1') {
      v.muted = true;
      if (audioTrack1Ref.current) {
        audioTrack1Ref.current.muted = isMuted;
        audioTrack1Ref.current.currentTime = v.currentTime;
        audioTrack1Ref.current.play();
      }
      if (audioTrack2Ref.current) audioTrack2Ref.current.muted = true;
    } else if (track === 'track2') {
      v.muted = true;
      if (audioTrack1Ref.current) audioTrack1Ref.current.muted = true;
      if (audioTrack2Ref.current) {
        audioTrack2Ref.current.muted = isMuted;
        audioTrack2Ref.current.currentTime = v.currentTime;
        audioTrack2Ref.current.play();
      }
    }
  };

  if (accessDenied) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-10 text-center animate-apple">
        <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mb-8 text-amber-500">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 00-2 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        </div>
        <h2 className="text-3xl font-black text-white mb-4 tracking-tighter">Conteúdo Premium</h2>
        <p className="text-zinc-500 mb-12 max-w-xs mx-auto">Esta produção é exclusiva para assinantes LaiLai Premium.</p>
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button onClick={onClose} className="py-5 bg-white text-black font-black rounded-2xl uppercase text-xs tracking-widest">Ver Outros</button>
          <button onClick={onClose} className="py-5 bg-rose-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest">Assinar Plano</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center animate-apple">
      <div className="relative w-full h-full max-w-[500px] overflow-hidden bg-zinc-900 shadow-2xl">
        
        {video.audioTrack1Url && (
          <audio ref={audioTrack1Ref} src={video.audioTrack1Url} muted={activeAudio !== 'track1'} />
        )}
        {video.audioTrack2Url && (
          <audio ref={audioTrack2Ref} src={video.audioTrack2Url} muted={activeAudio !== 'track2'} />
        )}

        {isAdPlaying && (
          <div ref={adContainerRef} className="absolute inset-0 z-[1100] bg-black flex flex-col items-center justify-center">
            <div className="w-12 h-12 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4" />
            <span className="text-white font-black text-[10px] tracking-widest uppercase">Aguarde... Publicidade</span>
          </div>
        )}

        <video 
          ref={videoRef} 
          className="w-full h-full object-cover" 
          playsInline 
          onClick={() => setShowMetadata(!showMetadata)} 
          muted={activeAudio !== 'main' || isMuted}
        />

        <div className="absolute right-4 bottom-32 flex flex-col gap-4 z-[1200]">
           <button onClick={() => setIsMuted(!isMuted)} className="p-3 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 text-white">
             {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
           </button>
           
           {(video.audioTrack1Url || video.audioTrack2Url) && (
              <div className="relative group">
                 <button className="p-3 bg-rose-600 rounded-full text-white shadow-lg">
                   <Settings size={20} className="animate-pulse" />
                 </button>
                 <div className="absolute bottom-full right-0 mb-4 bg-black/80 backdrop-blur-xl border border-white/10 p-2 rounded-2xl flex flex-col gap-2 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all">
                    <button onClick={() => handleAudioChange('main')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap ${activeAudio === 'main' ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:text-white'}`}>Áudio Original</button>
                    {video.audioTrack1Url && <button onClick={() => handleAudioChange('track1')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap ${activeAudio === 'track1' ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:text-white'}`}>Trilha 1</button>}
                    {video.audioTrack2Url && <button onClick={() => handleAudioChange('track2')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap ${activeAudio === 'track2' ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:text-white'}`}>Trilha 2</button>}
                 </div>
              </div>
           )}
        </div>

        <button onClick={onClose} className="absolute top-12 left-6 z-[1200] p-3 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 text-white">
          <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>

        <div className={`absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black via-black/80 to-transparent transition-opacity duration-500 ${showMetadata ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">{video.categoria}</span>
            {video.isPremium && <span className="bg-amber-500 text-black text-[8px] font-black px-2 py-0.5 rounded-sm">PREMIUM</span>}
          </div>
          <h2 className="text-3xl font-black text-white mb-2 tracking-tighter">{video.titulo}</h2>
          <p className="text-zinc-400 text-sm mb-4 line-clamp-2">{video.descricao}</p>
        </div>
      </div>
    </div>
  );
};

export default VerticalPlayer;
