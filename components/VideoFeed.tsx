
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Episode, User, Ad, Channel } from '../types';
import { ICONS } from '../constants';
import { MOCK_CHANNELS } from '../services/mockData';

interface VideoFeedProps {
  episodes: Episode[];
  user: User | null;
  ads: Ad[];
  onAdImpression: (adId: number) => void;
  onUpgrade: () => void;
  onUpdateUser: (user: User) => void;
}

const AD_TRIGGER_TIME = 10; 
const SKIP_TIME_LIMIT = 5;

const VideoFeed: React.FC<VideoFeedProps> = ({ episodes, user, ads, onAdImpression, onUpgrade, onUpdateUser }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEpisode, setSelectedEpisode] = useState<Episode | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const [activeAd, setActiveAd] = useState<Ad | null>(null);
  const [canSkipAd, setCanSkipAd] = useState(false);
  const [skipTimer, setSkipTimer] = useState(SKIP_TIME_LIMIT);
  const [hasAdPlayedForCurrent, setHasAdPlayedForCurrent] = useState<Record<number, boolean>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const adIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const filteredEpisodes = useMemo(() => {
    return episodes.filter(ep => 
      ep.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      ep.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [episodes, searchQuery]);

  const toggleFollow = (channelId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;
    const isFollowing = user.followingChannelIds.includes(channelId);
    const updatedFollowing = isFollowing 
      ? user.followingChannelIds.filter(id => id !== channelId)
      : [...user.followingChannelIds, channelId];
    onUpdateUser({ ...user, followingChannelIds: updatedFollowing });
  };

  const startAd = useCallback((ad: Ad) => {
    setActiveAd(ad);
    setSkipTimer(SKIP_TIME_LIMIT);
    setCanSkipAd(false);
    onAdImpression(ad.id);
    
    if (videoRef.current) videoRef.current.pause();

    adIntervalRef.current = setInterval(() => {
      setSkipTimer(prev => {
        if (prev <= 1) {
          setCanSkipAd(true);
          if (adIntervalRef.current) clearInterval(adIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [onAdImpression]);

  const skipAd = () => {
    setActiveAd(null);
    if (adIntervalRef.current) clearInterval(adIntervalRef.current);
    if (videoRef.current) videoRef.current.play();
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || !selectedEpisode || activeAd) return;
    
    if (!user?.isPremium && videoRef.current.currentTime >= AD_TRIGGER_TIME && !hasAdPlayedForCurrent[selectedEpisode.id]) {
      const availableAds = ads.filter(a => a.active);
      if (availableAds.length > 0) {
        const ad = availableAds[Math.floor(Math.random() * availableAds.length)];
        setHasAdPlayedForCurrent(prev => ({ ...prev, [selectedEpisode.id]: true }));
        startAd(ad);
      }
    }
  };

  const getChannel = (id: number) => MOCK_CHANNELS.find(c => c.id === id);

  useEffect(() => {
    return () => { if (adIntervalRef.current) clearInterval(adIntervalRef.current); };
  }, []);

  if (selectedEpisode) {
    const channel = getChannel(selectedEpisode.channelId);
    return (
      <div className="fixed inset-0 z-[600] bg-black flex justify-center font-lailai select-none animate-apple">
        <div className="relative w-full h-full max-w-[calc(100vh*9/16)] bg-black overflow-hidden shadow-2xl">
          
          <div className="w-full h-full" onClick={() => !activeAd && (videoRef.current?.paused ? videoRef.current?.play() : videoRef.current?.pause())}>
            <video 
              ref={videoRef} 
              className={`w-full h-full object-cover transition-opacity duration-500 ${activeAd ? 'opacity-0' : 'opacity-100'}`}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              muted={isMuted}
              playsInline
              src={selectedEpisode.videoUrl}
            />

            {activeAd && (
              <div className="absolute inset-0 z-[700] bg-black animate-apple">
                <video 
                  autoPlay 
                  src={activeAd.videoUrl} 
                  className="w-full h-full object-cover"
                  onEnded={skipAd}
                  muted={isMuted}
                />
                
                <div className="absolute top-12 left-6 right-6 flex justify-between items-start">
                  <div className="bg-black/60 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                    <span className="bg-amber-400 text-black text-[10px] font-black px-1.5 py-0.5 rounded-sm">AD</span>
                    <span className="text-white font-black text-xs uppercase tracking-widest">{activeAd.title}</span>
                  </div>
                </div>

                <div className="absolute bottom-32 right-0">
                   <button 
                    disabled={!canSkipAd}
                    onClick={(e) => { e.stopPropagation(); skipAd(); }}
                    className={`px-8 py-4 bg-black/60 backdrop-blur-3xl border-l border-t border-b border-white/20 text-white font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center gap-4 ${!canSkipAd ? 'opacity-50 pointer-events-none' : 'hover:bg-white hover:text-black cursor-pointer'}`}
                   >
                     {!canSkipAd ? `Pular em ${skipTimer}s` : 'Pular Anúncio'}
                     <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                   </button>
                </div>
              </div>
            )}
          </div>

          {!activeAd && (
            <>
              <button onClick={() => setSelectedEpisode(null)} className="absolute top-12 left-6 z-[650] p-3 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 text-white active:scale-90 transition-transform">
                <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>

              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-black/30 flex flex-col justify-end p-8 pb-32 pointer-events-none">
                  <div className="max-w-[85%] pointer-events-auto">
                    <div className="flex items-center gap-3 mb-4">
                      <img src={channel?.avatar} className="w-12 h-12 rounded-2xl border border-white/10 cursor-pointer" onClick={() => setSelectedChannel(channel || null)} />
                      <div className="flex-1">
                        <h3 className="text-lg font-black text-white leading-tight">@{channel?.handle}</h3>
                        <span className="text-[10px] font-black text-rose-500 tracking-widest uppercase">Parceiro Monetizado</span>
                      </div>
                      <button 
                        onClick={(e) => toggleFollow(channel?.id || 0, e)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${user?.followingChannelIds.includes(channel?.id || 0) ? 'bg-white/10 text-white border border-white/10' : 'bg-rose-600 text-white'}`}
                      >
                        {user?.followingChannelIds.includes(channel?.id || 0) ? 'Seguindo' : 'Seguir'}
                      </button>
                    </div>
                    <p className="text-[15px] text-white/90 font-medium leading-relaxed line-clamp-2">{selectedEpisode.description}</p>
                  </div>
              </div>

              <div className="absolute right-6 bottom-32 flex flex-col gap-6 items-center z-50">
                <button onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className="w-14 h-14 rounded-2xl bg-black/40 backdrop-blur-3xl border border-white/5 flex items-center justify-center text-white/50 active:scale-90 transition-transform">
                  {isMuted ? ICONS.Mute : ICONS.Volume}
                </button>
                <ActionButton icon={ICONS.Heart} label={selectedEpisode.likes} color="hover:text-rose-500" />
                <ActionButton icon={ICONS.Message} label={selectedEpisode.comments} color="hover:text-white" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  if (selectedChannel) {
    return (
      <div className="fixed inset-0 z-[600] bg-[#050505] flex flex-col animate-apple overflow-y-auto scrollbar-custom pb-32">
        <div className="relative h-[35vh] min-h-[300px]">
           <img src={selectedChannel.banner} className="w-full h-full object-cover opacity-40" />
           <div className="absolute inset-0 bg-gradient-to-t from-[#050505] to-transparent" />
           <button onClick={() => setSelectedChannel(null)} className="absolute top-10 left-6 p-4 bg-black/40 backdrop-blur-3xl rounded-3xl border border-white/10 text-white active:scale-90 transition-transform">
             <svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
           </button>
        </div>
        <div className="px-8 md:px-24 -mt-20 relative z-10 flex flex-col items-center md:items-start md:flex-row gap-8 mb-16">
          <img src={selectedChannel.avatar} className="w-40 h-40 rounded-[2.5rem] border-8 border-[#050505] shadow-2xl object-cover" />
          <div className="flex-1 pt-6 text-center md:text-left">
             <h2 className="text-5xl font-black text-white mb-2">{selectedChannel.name}</h2>
             <p className="text-zinc-500 font-bold text-sm tracking-widest uppercase mb-6">@{selectedChannel.handle} • {selectedChannel.followerCount.toLocaleString()} Seguidores</p>
             <button onClick={() => toggleFollow(selectedChannel.id)} className={`px-12 py-4 rounded-2xl text-xs font-black uppercase tracking-widest ${user?.followingChannelIds.includes(selectedChannel.id) ? 'bg-white/5 text-white/50 border border-white/10' : 'bg-white text-black transition-colors hover:bg-zinc-200'}`}>{user?.followingChannelIds.includes(selectedChannel.id) ? 'Seguindo' : 'Seguir'}</button>
          </div>
        </div>
        <div className="px-8 md:px-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {episodes.filter(ep => ep.channelId === selectedChannel.id).map(ep => <VideoCard key={ep.id} ep={ep} onClick={() => setSelectedEpisode(ep)} channel={selectedChannel} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#050505] flex flex-col overflow-hidden font-lailai">
      <div className="sticky top-0 z-50 p-6 md:px-12 md:py-8 glass-nav border-b border-white/5 flex flex-col gap-6">
        <h1 className="text-3xl font-black tracking-tighter premium-text">HQCINE</h1>
        <div className="relative group w-full max-w-2xl">
          <input 
            type="text" 
            placeholder="Pesquisar filmes ou séries..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-14 py-4 focus:outline-none focus:border-rose-500/50 text-white transition-all placeholder:text-zinc-700" 
          />
          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600">{ICONS.Search}</div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-custom p-6 md:p-12 pb-32">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {filteredEpisodes.map((ep) => (
            <VideoCard key={ep.id} ep={ep} onClick={() => setSelectedEpisode(ep)} channel={getChannel(ep.channelId)} />
          ))}
        </div>
      </div>
    </div>
  );
};

const VideoCard: React.FC<{ ep: Episode, onClick: () => void, channel?: Channel }> = ({ ep, onClick, channel }) => (
  <div className="group cursor-pointer flex flex-col" onClick={onClick}>
    <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden bg-zinc-900 mb-6 relative transition-all duration-700 group-hover:scale-[0.98] ring-1 ring-white/5">
      <img src={ep.thumbnail} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all duration-700" alt={ep.title} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-16 h-16 bg-white/10 backdrop-blur-3xl rounded-3xl flex items-center justify-center border border-white/10">
          <svg className="w-8 h-8 text-white fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
    </div>
    <div className="px-2 flex gap-4">
      <img src={channel?.avatar} className="w-10 h-10 rounded-2xl object-cover border border-white/5 shadow-lg" />
      <div className="flex-1">
        <h3 className="text-lg font-bold text-white mb-0.5 group-hover:text-rose-500 transition-colors truncate">{ep.title}</h3>
        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">@{channel?.handle}</p>
      </div>
    </div>
  </div>
);

const ActionButton: React.FC<{ icon: React.ReactNode, label: string | number, color: string }> = ({ icon, label, color }) => (
  <button className={`flex flex-col items-center group transition-all active:scale-90 ${color}`}>
    <div className="w-14 h-14 rounded-2xl bg-black/40 backdrop-blur-3xl border border-white/5 flex items-center justify-center text-white/50 transition-transform shadow-2xl group-hover:text-white">{icon}</div>
    <span className="text-[10px] font-black mt-2 text-white/30 tracking-widest uppercase">{label}</span>
  </button>
);

export default VideoFeed;
