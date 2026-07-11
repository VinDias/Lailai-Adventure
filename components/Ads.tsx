
import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { hasAdConsent, loadAdSense, CONSENT_EVENT } from '../utils/consent';
import { useT } from '../contexts/I18nContext';

const DEFAULT_CLIENT = 'ca-pub-5972610130504852';

const Ads: React.FC = () => {
  const t = useT();
  const [adClient, setAdClient] = useState(DEFAULT_CLIENT);
  const [adSlot, setAdSlot] = useState('');
  const [ready, setReady] = useState(false);
  const [ownAd, setOwnAd] = useState<any>(null);
  const [consented, setConsented] = useState<boolean>(hasAdConsent());

  useEffect(() => {
    Promise.all([
      api.getPublicSettings(),
      api.getRandomAd()
    ]).then(([settings, ad]) => {
      if (settings.adsense_client_id) setAdClient(settings.adsense_client_id);
      if (settings.adsense_slot_id) setAdSlot(settings.adsense_slot_id);
      setOwnAd(ad);
      // Só conta impressão se o banner próprio de fato vai aparecer
      // (sem slot AdSense configurado ou sem consentimento).
      if (ad && !(settings.adsense_slot_id && hasAdConsent())) {
        api.trackAdImpression(ad._id || ad.id);
      }
    }).finally(() => setReady(true));
  }, []);

  // Reage ao consentimento do usuário (banner de cookies).
  useEffect(() => {
    const onChange = () => setConsented(hasAdConsent());
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);

  useEffect(() => {
    // Só inicializa o AdSense com consentimento explícito (LGPD).
    if (!ready || !adSlot || !consented) return;
    loadAdSense(adClient);
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.warn('AdSense error:', e);
    }
  }, [ready, adSlot, consented, adClient]);

  if (!ready) return null;

  // Mostra AdSense apenas com consentimento E slot configurado.
  if (adSlot && consented) {
    return (
      <div className="w-full my-4 bg-white/5 border border-white/5 rounded-2xl overflow-hidden p-2 flex flex-col items-center">
        <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest mb-2">{t('ads.label')}</span>
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

  // Fallback: anúncio próprio do banco de dados — card 16:9 em vez da tira
  // pequena (max-h-32) que cortava a arte e o cliente reprovou.
  if (!ownAd) return null;

  return (
    <div className="w-full my-4 rounded-2xl overflow-hidden border border-white/5 shadow-lg">
      <a
        href={ownAd.link_url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => { if (ownAd.link_url) api.trackAdClick(ownAd._id || ownAd.id); }}
        className="block relative aspect-video bg-zinc-900"
        style={{ cursor: ownAd.link_url ? 'pointer' : 'default' }}
      >
        <img src={ownAd.image_url} alt={ownAd.title || 'Anúncio'} className="w-full h-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pt-8 pb-3">
          {ownAd.title && <p className="text-white text-sm font-black leading-tight">{ownAd.title}</p>}
          {ownAd.advertiser && <p className="text-zinc-400 text-[10px] font-bold mt-0.5">{ownAd.advertiser}</p>}
        </div>
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/60 rounded text-[8px] font-black text-zinc-400 uppercase tracking-widest">
          {t('ads.sponsored')}
        </div>
      </a>
    </div>
  );
};

export default Ads;
