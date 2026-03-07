
import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Video, User } from '../types';
import { X } from 'lucide-react';
import AdComponent from './AdComponent';

interface PlayerProps {
  video: Video;
  user: User | null;
  onClose: () => void;
}

const VerticalPlayer: React.FC<PlayerProps> = ({ video, user, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  const [showAd, setShowAd] = useState(!user?.isPremium);
  const [showMetadata, setShowMetadata] = useState(true);
  const [accessDenied] = useState(video.isPremium && !user?.isPremium);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    if (accessDenied || showAd) return;
    initializePlayback();
  }, [showAd, accessDenied]);

  const initializePlayback = async () => {
    if (!videoRef.current || !video.arquivoUrl) return;
    const v = videoRef.current;
    const src = video.arquivoUrl;

    // Se já é uma URL HLS (Bunny Stream ou equivalente), usa diretamente
    if (src.endsWith('.m3u8')) {
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(src);
        hls.attachMedia(v);
        hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
      } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        v.src = src;
        v.play().catch(() => {});
      }
      return;
    }

    // Fallback: URL direta (mp4, etc.)
    v.src = src;
    v.play().catch(() => {});
  };

  if (showAd) return <AdComponent onFinish={() => setShowAd(false)} />;

  if (accessDenied) {
    return (
      <div className="fixed inset-0 z-[1000] bg-black flex flex-col items-center justify-center p-10 text-center">
        <h2 className="text-3xl font-black text-white mb-4 italic">Conteúdo Premium</h2>
        <p className="text-zinc-500 mb-8">Esta obra é exclusiva para assinantes Loreflux Premium.</p>
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

        <button
          onClick={onClose}
          className="absolute top-12 left-6 z-[1200] p-3 bg-black/40 rounded-full border border-white/10 text-white"
        >
          <X size={24} />
        </button>

        {showMetadata && (
          <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black via-black/60 to-transparent z-[1100]">
            <h2 className="text-white font-black text-xl leading-tight mb-1">{video.titulo}</h2>
            <p className="text-zinc-400 text-sm line-clamp-2">{video.descricao}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerticalPlayer;
