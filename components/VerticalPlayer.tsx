
import React, { useEffect, useRef, useState } from 'react';
import { Episode, User } from '../types';
import Hls from 'hls.js';

// Fix: Declare google global variable for IMA SDK
declare const google: any;

interface PlayerProps {
  episode: Episode;
  user: User | null;
  onClose: () => void;
}

const VerticalPlayer: React.FC<PlayerProps> = ({ episode, user, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const adContainerRef = useRef<HTMLDivElement>(null);
  const [isAdPlaying, setIsAdPlaying] = useState(!user?.isPremium);
  const [progress, setProgress] = useState(0);

  // Inicialização do HLS
  useEffect(() => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    
    // Supondo que o backend agora entrega .m3u8 para produção
    const streamUrl = episode.video_url?.replace('.mp4', '/index.m3u8') || '';

    if (Hls.isSupported()) {
      const hls = new Hls({
        maxBufferLength: 30,
        capLevelToPlayerSize: true
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!isAdPlaying) video.play();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
    }

    const updateProgress = () => {
      setProgress((video.currentTime / video.duration) * 100);
    };
    video.addEventListener('timeupdate', updateProgress);
    return () => video.removeEventListener('timeupdate', updateProgress);
  }, [episode, isAdPlaying]);

  // Integração Google IMA
  useEffect(() => {
    if (!isAdPlaying || !adContainerRef.current || !videoRef.current) return;

    const adDisplayContainer = new google.ima.AdDisplayContainer(adContainerRef.current, videoRef.current);
    const adsLoader = new google.ima.AdsLoader(adDisplayContainer);

    adsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, (event: any) => {
      const adsManager = event.getAdsManager(videoRef.current);
      adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, () => {
        setIsAdPlaying(false);
        videoRef.current?.play();
      });
      adsManager.init(window.innerWidth, window.innerHeight, google.ima.ViewMode.NORMAL);
      adsManager.start();
    });

    const adsRequest = new google.ima.AdsRequest();
    adsRequest.adTagUrl = 'https://pubads.g.doubleclick.net/gampad/ads?sz=640x480&iu=/124319096/external/single_ad_samples&ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&unviewed_position_start=1&cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';
    
    adDisplayContainer.initialize();
    adsLoader.requestAds(adsRequest);

    return () => adsLoader.destroy();
  }, [isAdPlaying]);

  return (
    <div className="fixed inset-0 z-[5000] bg-black flex justify-center overflow-hidden animate-apple">
      <div className="relative w-full h-full max-w-[calc(100vh*9/16)] bg-black shadow-2xl">
        
        {/* Camada de Ads */}
        {isAdPlaying && (
          <div ref={adContainerRef} className="absolute inset-0 z-[5100] bg-black" />
        )}

        <video 
          ref={videoRef}
          playsInline
          className={`w-full h-full object-cover transition-opacity duration-1000 ${isAdPlaying ? 'opacity-0' : 'opacity-100'}`}
        />

        {/* UI Controls */}
        {!isAdPlaying && (
          <>
            <button onClick={onClose} className="absolute top-12 left-8 z-[5200] p-4 bg-black/30 backdrop-blur-2xl rounded-full border border-white/10 text-white">
              <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>

            <div className="absolute bottom-0 left-0 right-0 p-10 bg-gradient-to-t from-black via-black/80 to-transparent">
              <span className="text-rose-500 font-black text-[10px] uppercase tracking-widest mb-2 block">Premium 1080p</span>
              <h2 className="text-2xl font-black text-white mb-6 tracking-tighter">{episode.title}</h2>
              
              <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-rose-500 transition-all duration-300 shadow-[0_0_10px_rgba(225,29,72,0.8)]" 
                  style={{ width: `${progress}%` }} 
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerticalPlayer;
