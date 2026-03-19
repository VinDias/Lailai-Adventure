
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';

const DEFAULT_CLIENT = 'ca-pub-5972610130504852';
const DEFAULT_SLOT   = '';

const Ads: React.FC = () => {
  const [adClient, setAdClient] = useState(DEFAULT_CLIENT);
  const [adSlot,   setAdSlot]   = useState(DEFAULT_SLOT);
  const [ready,    setReady]    = useState(false);

  useEffect(() => {
    api.getPublicSettings().then(settings => {
      if (settings.adsense_client_id) setAdClient(settings.adsense_client_id);
      if (settings.adsense_slot_id)   setAdSlot(settings.adsense_slot_id);
    }).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !adSlot) return;
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('AdSense block error or empty slot:', e);
    }
  }, [ready, adSlot]);

  if (!ready || !adSlot) return null;

  return (
    <div className="w-full my-6 bg-white/5 border border-white/5 rounded-2xl overflow-hidden p-2 flex flex-col items-center">
      <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-2">Publicidade Patrocinada</span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={adClient}
        data-ad-slot={adSlot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
};

export default Ads;
