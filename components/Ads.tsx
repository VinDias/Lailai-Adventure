
import React, { useEffect } from 'react';

const Ads: React.FC = () => {
  useEffect(() => {
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('AdSense block error or empty slot:', e);
    }
  }, []);

  return (
    <div className="w-full my-6 bg-white/5 border border-white/5 rounded-2xl overflow-hidden p-2 flex flex-col items-center">
      <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-2">Publicidade Patrocinada</span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-SEU_CLIENT_ID"
        data-ad-slot="SEU_SLOT_ID"
        data-ad-format="auto"
        data-full-width-responsive="true"
      ></ins>
    </div>
  );
};

export default Ads;
