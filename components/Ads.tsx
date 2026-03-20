
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

const DEFAULT_CLIENT = 'ca-pub-5972610130504852';

const Ads: React.FC = () => {
  const [adClient, setAdClient] = useState(DEFAULT_CLIENT);
  const [adSlot, setAdSlot] = useState('');
  const [ready, setReady] = useState(false);
  const [ownAd, setOwnAd] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.getPublicSettings(),
      api.getRandomAd()
    ]).then(([settings, ad]) => {
      if (settings.adsense_client_id) setAdClient(settings.adsense_client_id);
      if (settings.adsense_slot_id) setAdSlot(settings.adsense_slot_id);
      setOwnAd(ad);
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !adSlot) return;
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('AdSense error:', e);
    }
  }, [ready, adSlot]);

  if (!ready) return null;

  // Mostra AdSense se o slot estiver configurado
  if (adSlot) {
    return (
      <div className="w-full my-4 bg-white/5 border border-white/5 rounded-2xl overflow-hidden p-2 flex flex-col items-center">
        <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-2">Publicidade</span>
        <ins
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={adClient}
          data-ad-slot={adSlot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  // Fallback: anúncio próprio do banco de dados
  if (!ownAd) return null;

  return (
    <div className="w-full my-4 rounded-2xl overflow-hidden border border-white/5">
      <a
        href={ownAd.link_url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative"
        style={{ cursor: ownAd.link_url ? 'pointer' : 'default' }}
      >
        <img src={ownAd.image_url} alt={ownAd.title || 'Anúncio'} className="w-full max-h-32 object-cover" />
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 rounded text-[8px] font-black text-zinc-400 uppercase tracking-widest">
          Patrocinado
        </div>
      </a>
    </div>
  );
};

export default Ads;
