
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, User } from '../types';
import { Volume2, VolumeX, Settings, X } from 'lucide-react';
import AdComponent from './AdComponent';

interface PlayerProps {
  video: Video;
  user: User | null;
  onClose: () => void;
}

const VerticalPlayer: React.FC<PlayerProps> = ({ video, user, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioTrack1Ref = useRef<HTMLAudioElement>(null);
  const audioTrack2Ref = useRef<HTMLAudioElement>(null);
  
  const [showAd, setShowAd] = useState(!user?.isPremium);
  const [showMetadata, setShowMetadata] = useState(true);
  const [accessDenied, setAccessDenied] = useState(video.isPremium && !user?.isPremium);
  const [activeAudio, setActiveAudio] = useState<'main' | 'track1' | 'track2'>('main');
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (accessDenied || showAd) return;
    initializePlayback();
  }, [showAd, accessDenied]);

  const initializePlayback = async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const videoBaseUrl = video.arquivoUrl.substring(0, video.arquivoUrl.lastIndexOf('/'));
    const hlsUrl = `${videoBaseUrl}/master.m3u8`;

    try {
      const response = await fetch(hlsUrl, { method: 'HEAD' });
      if (response.ok && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(hlsUrl);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => v.play());
      } else {
        v.src = video.arquivoUrl;
        v.play();
      }
    } catch (err) {
      v.src = video.arquivoUrl;
      v.play();
    }
  };

  if (showAd) return <AdComponent onFinish={() => setShowAd(false)} />;

  if (accessDenied) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-10 text-center">
        <h2 className="text-3xl font-black text-white mb-4 italic">Conteúdo Premium</h2>
        <p className="text-zinc-500 mb-8">Esta obra é exclusiva para assinantes LaiLai Premium.</p>
        <button onClick={onClose} className="px-12 py-4 bg-rose-600 text-white font-black rounded-2xl">VOLTAR</button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black flex items-center justify-center">
      <div className="relative w-full h-full max-w-[500px] overflow-hidden bg-zinc-900">
        <video 
          ref={videoRef} 
          className="w-full h-full object-cover" 
          playsInline 
          onClick={() => setShowMetadata(!showMetadata)} 
          muted={isMuted}
        />
        <button onClick={onClose} className="absolute top-12 left-6 z-[1200] p-3 bg-black/40 rounded-full border border-white/10 text-white">
          <X size={24} />
        </button>
      </div>
    </div>
  );
};

export default VerticalPlayer;
