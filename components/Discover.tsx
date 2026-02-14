
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Lesson, User, Channel, Ad } from '../types';
import { MOCK_CHANNELS, MOCK_ADS } from '../services/mockData';
import { ICONS } from '../constants';

interface VeFilmeProps {
  videos: Lesson[];
  user: User | null;
  onUpdateUser: (user: User) => void;
}

const SKIP_TIME_LIMIT = 5;

const VeFilme: React.FC<VeFilmeProps> = ({ videos, user, onUpdateUser }) => {
  const [activeVideo, setActiveVideo] = useState<Lesson | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [activeAd, setActiveAd] = useState<Ad | null>(null);
  const [skipTimer, setSkipTimer] = useState(SKIP_TIME_LIMIT);
  const [canSkipAd, setCanSkipAd] = useState(false);
  const [hasAdPlayed, setHasAdPlayed] = useState(false);

  const adIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const filteredContent = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filteredVideos = videos.filter(v => {
      const ch = MOCK_CHANNELS.find(c => c.id === v.channelId);
      return v.title.toLowerCase().includes(query) || ch?.name.toLowerCase().includes(query);
    });
    const filteredChannels = MOCK_CHANNELS.filter(c => c.name.toLowerCase().includes(query) || c.handle.toLowerCase().includes(query));
    return { videos: filteredVideos, channels: filteredChannels };
  }, [videos, searchQuery]);

  const toggleFollow = (channelId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;
    const isFollowing = user.followingChannelIds.includes(channelId);
    onUpdateUser({ 
      ...user, 
      followingChannelIds: isFollowing 
        ? user.followingChannelIds.filter(id => id !== channelId) 
        : [...user.followingChannelIds, channelId] 
    });
  };

  const startAd = (ad: Ad) => {
    setActiveAd(ad);
    setSkipTimer(SKIP_TIME_LIMIT);
    setCanSkipAd(false);
    
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
  };

  const startVideo = (video: Lesson) => {
    if (!user?.isPremium && !hasAdPlayed) {
      const ad = MOCK_ADS[Math.floor(Math.random() * MOCK_ADS.length)];
      startAd(ad);
      setHasAdPlayed(true);
    }
    setActiveVideo(video);
  };

  const closeAd = () => {
    setActiveAd(null);
    if (adIntervalRef.current) clearInterval(adIntervalRef.current);
  };

  const getChannel = (id: number) => MOCK_CHANNELS.find(c => c.id === id);

  if (activeVideo) {
    const channel = getChannel(activeVideo.channelId);
    return (
      <div className="fixed inset-0 h-screen w-full bg-black flex flex-col z-[800] animate-apple font-lailai overflow-hidden">
        <div className="p-6 flex items-center justify-between glass-nav z-10 border-b border-white/5">
          <button onClick={() => { setActiveVideo(null); closeAd(); }} className="flex items-center gap-4 text-white/60 hover:text-white transition-all active:scale-90">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10"><svg className="w-6 h-6 rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
            <span className="font-black text-xs tracking-widest uppercase">Fechar</span>
          </button>
          <div className="flex items-center gap-3">
             <div className="text-right hidden sm:block">
                <p className="text-xs font-black text-white">{channel?.name}</p>
                <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">@{channel?.handle}</p>
             </div>
             <img src={channel?.avatar} className="w-10 h-10 rounded-xl object-cover border border-white/10 shadow-lg" />
          </div>
        </div>

        <div className="flex-1 relative flex justify-center bg-[#050505] overflow-hidden">
          <div className="w-full max-w-xl h-full relative">
            {activeAd ? (
              <div className="absolute inset-0 z-[900] bg-black">
                <video autoPlay src={activeAd.videoUrl} className="w-full h-full object-cover" onEnded={closeAd} />
                <div className="absolute bottom-32 right-0">
                  <button disabled={!canSkipAd} onClick={closeAd} className={`px-8 py-4 bg-black/60 backdrop-blur-3xl border-l border-white/20 text-white font-black text-xs uppercase tracking-widest transition-all ${!canSkipAd ? 'opacity-50 pointer-events-none' : 'hover:bg-white hover:text-black cursor-pointer'}`}>
                    {!canSkipAd ? `Pular em ${skipTimer}s` : 'Pular Anúncio'}
                  </button>
                </div>
              </div>
            ) : (
              <video src={activeVideo.videoUrl} autoPlay controls className="w-full h-full object-cover" />
            )}
            
            <div className="absolute bottom-24 left-8 right-8 pointer-events-none p-6 bg-gradient-to-t from-black/80 to-transparent rounded-3xl z-40">
              <h2 className="text-2xl font-black text-white mb-2 leading-tight">{activeVideo.title}</h2>
              <p className="text-sm text-white/60 line-clamp-2">{activeVideo.description}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedChannel) {
    return (
      <div className="fixed inset-0 z-[750] bg-[#050505] flex flex-col animate-apple overflow-y-auto pb-32 scrollbar-custom">
        <div className="relative h-[35vh]">
           <img src={selectedChannel.banner} className="w-full h-full object-cover opacity-40" />
           <div className="absolute inset-0 bg-gradient-to-t from-[#050505] to-transparent" />
           <button onClick={() => setSelectedChannel(null)} className="absolute top-10 left-6 p-4 bg-black/40 backdrop-blur-3xl rounded-3xl border border-white/10 text-white active:scale-90 transition-transform"><svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
        </div>
        <div className="px-8 md:px-24 -mt-16 relative z-10 flex flex-col md:flex-row gap-8 mb-16 items-center md:items-start">
          <img src={selectedChannel.avatar} className="w-40 h-40 rounded-[2.5rem] border-8 border-[#050505] shadow-2xl object-cover" />
          <div className="flex-1 text-center md:text-left pt-6">
             <h2 className="text-5xl font-black text-white mb-2 tracking-tighter">{selectedChannel.name}</h2>
             <p className="text-zinc-500 font-bold text-sm tracking-widest uppercase mb-6">@{selectedChannel.handle} • {selectedChannel.followerCount.toLocaleString()} Seguidores</p>
             <button onClick={() => toggleFollow(selectedChannel.id)} className={`px-12 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${user?.followingChannelIds.includes(selectedChannel.id) ? 'bg-white/5 text-white/50 border border-white/10' : 'bg-white text-black hover:bg-zinc-200'}`}>{user?.followingChannelIds.includes(selectedChannel.id) ? 'Seguindo Canal' : 'Seguir Canal'}</button>
          </div>
        </div>
        <div className="px-8 md:px-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {videos.filter(v => v.channelId === selectedChannel.id).map(video => <VideoCard key={video.id} video={video} onClick={() => startVideo(video)} channel={selectedChannel} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#0A0A0B] overflow-hidden flex flex-col font-lailai">
      <div className="sticky top-0 z-50 p-6 md:px-12 md:py-10 glass-nav border-b border-white/5 flex flex-col gap-8">
        <h1 className="text-4xl font-black tracking-tighter premium-text">VE-FILME</h1>
        <div className="relative group w-full max-w-2xl">
          <input 
            type="text" 
            placeholder="Pesquisar Ve-Filmes ou Canais..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
            className="w-full bg-white/5 border border-white/10 rounded-3xl px-16 py-5 focus:outline-none focus:border-rose-500/50 text-white text-lg transition-all placeholder:text-zinc-700" 
          />
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-zinc-600">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-custom p-6 md:p-12 pb-32">
        {!searchQuery && (
          <div className="mb-20 overflow-x-auto flex gap-6 pb-6 scrollbar-hide">
            {MOCK_CHANNELS.map(ch => (
              <div key={ch.id} onClick={() => setSelectedChannel(ch)} className="flex-none w-72 bg-white/5 border border-white/5 rounded-[2.5rem] p-8 cursor-pointer hover:bg-white/10 transition-all group">
                <div className="flex items-center gap-5 mb-6">
                  <img src={ch.avatar} className="w-16 h-16 rounded-2xl object-cover border border-white/10 shadow-lg" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-md font-black text-white truncate">{ch.name}</h4>
                    <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest truncate">@{ch.handle}</p>
                  </div>
                </div>
                <button onClick={(e) => toggleFollow(ch.id, e)} className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${user?.followingChannelIds.includes(ch.id) ? 'bg-white/10 text-white/40' : 'bg-white text-black hover:bg-zinc-200'}`}>{user?.followingChannelIds.includes(ch.id) ? 'Seguindo' : 'Seguir'}</button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-12">
          {filteredContent.videos.map((video) => (
            <VideoCard 
              key={video.id} 
              video={video} 
              onClick={() => startVideo(video)} 
              channel={getChannel(video.channelId)} 
              onChannelClick={() => setSelectedChannel(getChannel(video.channelId) || null)} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const VideoCard: React.FC<{ video: Lesson, onClick: () => void, channel?: Channel, onChannelClick?: () => void }> = ({ video, onClick, channel, onChannelClick }) => (
  <div className="group cursor-pointer flex flex-col">
    <div className="aspect-[9/16] rounded-[3rem] overflow-hidden bg-zinc-900 mb-8 relative transition-all duration-700 group-hover:scale-[0.98] ring-1 ring-white/10" onClick={onClick}>
      <img src={video.thumbnail} className="w-full h-full object-cover opacity-70 group-hover:opacity-100 transition-all duration-1000 group-hover:scale-110" alt={video.title} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-20 h-20 bg-white/10 backdrop-blur-3xl rounded-[2rem] flex items-center justify-center border border-white/10">
          <svg className="w-10 h-10 text-white fill-current ml-1" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div className="absolute bottom-8 left-8 right-8">
         <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest mb-3 block">{video.category}</span>
         <h3 className="text-2xl font-black text-white leading-tight line-clamp-2">{video.title}</h3>
      </div>
    </div>
    <div className="px-4 flex items-start gap-4" onClick={(e) => { e.stopPropagation(); onChannelClick?.(); }}>
      <img src={channel?.avatar} className="w-10 h-10 rounded-2xl object-cover border border-white/10 mt-1 shadow-lg group-hover:border-rose-500/50 transition-colors" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-black text-white hover:text-rose-500 transition-colors truncate">{channel?.name}</p>
        <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{video.likes.toLocaleString()} likes • {video.date}</p>
      </div>
    </div>
  </div>
);

export default VeFilme;
