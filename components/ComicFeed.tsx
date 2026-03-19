
import React, { useState, useEffect, useMemo } from 'react';
import { Comic, User, Channel, Ad } from '../types';
import { ICONS } from '../constants';
import { MOCK_CHANNELS, MOCK_ADS } from '../services/mockData';
import { useSettings } from '../contexts/SettingsContext';

interface ComicFeedProps {
  comics: Comic[];
  user: User | null;
  onUpgrade: () => void;
  onUpdateUser: (user: User) => void;
}

const ComicFeed: React.FC<ComicFeedProps> = ({ comics, user, onUpgrade, onUpdateUser }) => {
  const { ad_frequency_webtoon } = useSettings();
  const [readingComic, setReadingComic] = useState<Comic | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Ad Management for Reading
  const [interstitialAd, setInterstitialAd] = useState<Ad | null>(null);

  const filteredComics = useMemo(() => {
    return comics.filter(comic => 
      comic.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      comic.author.toLowerCase().includes(searchQuery.toLowerCase())
    ).sort((a, b) => b.likes - a.likes);
  }, [comics, searchQuery]);

  const toggleFollow = (channelId: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!user) return;
    const isFollowing = user.followingChannelIds.includes(channelId);
    onUpdateUser({ ...user, followingChannelIds: isFollowing ? user.followingChannelIds.filter(id => id !== channelId) : [...user.followingChannelIds, channelId] });
  };

  const getChannel = (id: number) => MOCK_CHANNELS.find(c => c.id === id);

  if (readingComic) {
    const channel = getChannel(readingComic.channelId);
    return (
      <div className="fixed inset-0 h-screen w-full bg-[#0A0A0B] overflow-hidden flex justify-center font-inter animate-apple z-[700]">
        <div className="video-feed h-full w-full max-w-md overflow-y-scroll bg-black relative scroll-smooth scrollbar-hide">
          <div className="sticky top-0 left-0 right-0 p-5 flex items-center justify-between glass-nav z-[100] border-b border-white/5">
            <button onClick={() => setReadingComic(null)} className="flex items-center gap-2 text-white/50 hover:text-white transition-all"><svg className="w-5 h-5 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg><span className="font-bold text-xs uppercase tracking-widest">Fechar</span></button>
            <div className="text-[10px] font-black tracking-[0.2em] text-rose-500 uppercase">HI-QUA READER</div>
          </div>

          <div className="pt-16 pb-12 bg-gradient-to-b from-rose-950/40 via-black to-black text-center px-10">
            <h2 className="text-4xl font-black tracking-tighter mb-3 text-white leading-none">{readingComic.title}</h2>
            <p className="text-rose-500 font-bold mb-6 text-sm tracking-wide">Por {readingComic.author}</p>
          </div>

          <div className="flex flex-col bg-black">
            {readingComic.panels.map((url, idx) => (
              <React.Fragment key={idx}>
                <img src={url} alt={`P-${idx}`} className="w-full h-auto block" loading="lazy" />
                
                {/* Monetization: Interstitial Ad every 7 panels */}
                {!user?.isPremium && idx > 0 && idx % ad_frequency_webtoon === 0 && (
                  <div className="w-full p-10 bg-zinc-950 border-y border-white/5 flex flex-col items-center">
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-4">Anúncio Patrocinado</span>
                    <div className="w-full aspect-[9/16] rounded-3xl overflow-hidden mb-6 border border-white/10">
                       <img src={`https://picsum.photos/seed/ad-${idx}/1080/1920`} className="w-full h-full object-cover opacity-80" />
                    </div>
                    <button className="w-full py-4 bg-white text-black font-black text-xs uppercase rounded-2xl hover:bg-zinc-200 transition-all">Saiba Mais</button>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="p-24 text-center bg-zinc-950 border-t border-white/5">
            <p className="text-zinc-600 mb-8 font-bold text-xs uppercase tracking-widest">Fim do Capítulo</p>
            <button onClick={() => setReadingComic(null)} className="bg-white text-black font-black py-4 px-14 rounded-2xl">Voltar para Galeria</button>
          </div>
        </div>
      </div>
    );
  }

  if (selectedChannel) {
    return (
      <div className="fixed inset-0 z-[650] bg-[#050505] flex flex-col animate-apple overflow-y-auto pb-32">
        <div className="relative h-[35vh]">
           <img src={selectedChannel.banner} className="w-full h-full object-cover opacity-40" />
           <div className="absolute inset-0 bg-gradient-to-t from-[#050505] to-transparent" />
           <button onClick={() => setSelectedChannel(null)} className="absolute top-10 left-6 p-4 bg-black/40 rounded-3xl border border-white/10 text-white"><svg className="w-6 h-6 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
        </div>
        <div className="px-8 md:px-24 -mt-16 relative z-10 flex flex-col items-center md:items-start md:flex-row gap-8 mb-16">
          <img src={selectedChannel.avatar} className="w-36 h-36 rounded-[2.5rem] border-8 border-[#050505] shadow-2xl object-cover" />
          <div className="flex-1 text-center md:text-left pt-6">
             <h2 className="text-5xl font-black text-white mb-2">{selectedChannel.name}</h2>
             <p className="text-zinc-500 font-bold text-sm tracking-widest uppercase mb-4">@{selectedChannel.handle}</p>
             <button onClick={() => toggleFollow(selectedChannel.id)} className={`px-12 py-4 rounded-2xl text-xs font-black uppercase tracking-widest ${user?.followingChannelIds.includes(selectedChannel.id) ? 'bg-white/5 text-white/50 border border-white/10' : 'bg-rose-600 text-white'}`}>{user?.followingChannelIds.includes(selectedChannel.id) ? 'Seguindo Studio' : 'Seguir Studio'}</button>
          </div>
        </div>
        <div className="px-8 md:px-24 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {comics.filter(c => c.channelId === selectedChannel.id).map(comic => <ComicCard key={comic.id} comic={comic} onClick={() => setReadingComic(comic)} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#050505] flex flex-col overflow-hidden font-inter">
      <div className="sticky top-0 z-50 p-6 md:px-12 md:py-8 glass-nav border-b border-white/5 flex flex-col gap-6">
        <h1 className="text-3xl font-black tracking-tighter premium-text">HI-QUA</h1>
        <div className="relative group w-full max-w-2xl">
          <input type="text" placeholder="Pesquisar Webtoons..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/5 border border-white/5 rounded-2xl px-14 py-4 focus:outline-none text-white" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-custom p-6 md:p-12 pb-32">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {filteredComics.map((comic) => <ComicCard key={comic.id} comic={comic} onClick={() => setReadingComic(comic)} channel={getChannel(comic.channelId)} onChannelClick={() => setSelectedChannel(getChannel(comic.channelId) || null)} />)}
        </div>
      </div>
    </div>
  );
};

const ComicCard: React.FC<{ comic: Comic, onClick: () => void, channel?: Channel, onChannelClick?: () => void }> = ({ comic, onClick, channel, onChannelClick }) => (
  <div className="group cursor-pointer flex flex-col">
    <div className="aspect-[9/16] rounded-[2.5rem] overflow-hidden bg-zinc-900 mb-6 relative transition-all duration-700 group-hover:scale-[0.98] ring-1 ring-white/5" onClick={onClick}>
      <img src={comic.thumbnail} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-all duration-700" alt={comic.title} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><div className="w-16 h-16 bg-white/10 backdrop-blur-3xl rounded-3xl flex items-center justify-center border border-white/10"><svg className="w-8 h-8 text-white fill-current" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg></div></div>
    </div>
    <div className="px-2">
      <h3 className="text-lg font-bold text-white mb-0.5 group-hover:text-rose-500 transition-colors truncate" onClick={onClick}>{comic.title}</h3>
      <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); onChannelClick?.(); }}>
        {channel && <img src={channel.avatar} className="w-4 h-4 rounded-full object-cover" />}
        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest truncate">@{channel?.handle || comic.author}</p>
      </div>
    </div>
  </div>
);

export default ComicFeed;
