
import React, { useEffect, useRef, useState } from 'react';
import { Episode, User } from '../types';
import Hls from 'hls.js';

declare const google: any;

interface PlayerProps {
  episode: Episode;
  user: User | null;
  onClose: () => void;
}

const VerticalPlayer: React.FC<PlayerProps> = ({ episode, user, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isAdPlaying, setIsAdPlaying] = useState(!user?.isPremium);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoRef.current || isAdPlaying) return;

    const video = videoRef.current;
    const streamUrl = episode.video_url || '';

    // Lógica HLS com cleanup
    if (Hls.isSupported() && streamUrl.includes('.m3u8')) {
      const hls = new Hls({
        maxBufferLength: 10, // Buffer agressivo para economia de memória
        enableWorker: true
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else {
      video.src = streamUrl;
      video.play().catch(() => {});
    }

    const onTimeUpdate = () => {
      if (video.duration) setProgress((video.currentTime / video.duration) * 100);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    
    return () => {
      video.pause();
      video.removeEventListener('timeupdate', onTimeUpdate);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [episode, isAdPlaying]);

  // Integração IMA com Fallback
  useEffect(() => {
    if (!isAdPlaying) return;

    let adsLoader: any;
    let adsManager: any;

    const initializeIMA = () => {
      if (typeof google === 'undefined' || !adContainerRef.current) {
        console.warn("IMA SDK não carregado. Pulando anúncio.");
        setIsAdPlaying(false);
        return;
      }

      const adDisplayContainer = new google.ima.AdDisplayContainer(adContainerRef.current, videoRef.current);
      adsLoader = new google.ima.AdsLoader(adDisplayContainer);

      adsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (e: any) => {
        adsManager = e.getAdsManager(videoRef.current);
        adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, () => setIsAdPlaying(false));
        adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, () => setIsAdPlaying(false));
        adsManager.init(window.innerWidth, window.innerHeight, google.ima.ViewMode.NORMAL);
        adsManager.start();
      });

      const adsRequest = new google.ima.AdsRequest();
      adsRequest.adTagUrl = 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';
      
      adDisplayContainer.initialize();
      adsLoader.requestAds(adsRequest);
    };

    initializeIMA();
    const fallbackTimeout = setTimeout(() => { if (isAdPlaying) setIsAdPlaying(false); }, 5000);

    return () => {
      clearTimeout(fallbackTimeout);
      if (adsLoader) adsLoader.destroy();
    };
  }, [isAdPlaying]);

  return (
    <div className="fixed inset-0 z-[5000] bg-black flex justify-center animate-apple">
      <div className="relative w-full h-full max-w-[calc(100vh*9/16)] bg-black overflow-hidden shadow-2xl">
        
        {isAdPlaying && (
          <div ref={adContainerRef} className="absolute inset-0 z-[5100] bg-black flex items-center justify-center">
             <div className="text-zinc-700 text-[10px] font-black tracking-widest animate-pulse">CARREGANDO ANÚNCIO...</div>
          </div>
        )}

        <video ref={videoRef} playsInline className="w-full h-full object-cover" />

        <button onClick={onClose} className="absolute top-12 left-8 z-[5200] p-4 bg-black/40 backdrop-blur-xl rounded-full border border-white/10 text-white transition-transform active:scale-90">
          <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>

        {!isAdPlaying && (
          <div className="absolute bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none">
            <h2 className="text-2xl font-black text-white mb-6 tracking-tighter">{episode.title}</h2>
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-rose-500 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerticalPlayer;
