
import React, { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useT } from '../contexts/I18nContext';
import { api } from '../services/api';

interface AdComponentProps {
  onFinish: () => void;
}

const AdComponent: React.FC<AdComponentProps> = ({ onFinish }) => {
  const t = useT();
  const { ad_skip_seconds } = useSettings();
  const [timeLeft, setTimeLeft] = useState(ad_skip_seconds);
  const [ad, setAd] = useState<any>(undefined); // undefined = carregando, null = sem anúncios
  const [mediaReady, setMediaReady] = useState(false);
  // Autoplay com som é bloqueado pelos navegadores: vídeo inicia mudo com botão de som.
  const [muted, setMuted] = useState(true);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    api.getRandomAd().then(a => setAd(a ?? null));
    // Failsafe de carregamento: se a request de anúncios ficar pendurada (rede
    // móvel instável), libera o conteúdo em vez de deixar o usuário em tela preta.
    const loadFailsafe = setTimeout(() => {
      setAd(prev => (prev === undefined ? null : prev));
    }, 8000);
    return () => clearTimeout(loadFailsafe);
  }, []);

  // Sem anúncios → pula automaticamente; com anúncio → registra a impressão
  useEffect(() => {
    if (ad === null) onFinish();
    else if (ad) api.trackAdImpression(ad._id || ad.id);
  }, [ad]);

  // Failsafe: se a mídia ficar pendurada (nem load nem error),
  // libera o countdown após 8s para o usuário nunca ficar preso no anúncio.
  useEffect(() => {
    if (!ad || mediaReady) return;
    const failsafe = setTimeout(() => setMediaReady(true), 8000);
    return () => clearTimeout(failsafe);
  }, [ad, mediaReady]);

  // O countdown só começa quando a mídia do anúncio está pronta,
  // para o tempo de exibição não ser "comido" pelo carregamento.
  useEffect(() => {
    if (!mediaReady) return;
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [mediaReady]);

  // Ainda carregando ou sem anúncios
  if (!ad) return null;

  const isVideo = Boolean(ad.video_url) && !videoFailed;

  const handleAdClick = () => {
    if (!ad.link_url) return;
    api.trackAdClick(ad._id || ad.id);
    window.open(ad.link_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-[5000] bg-black flex flex-col items-center justify-center p-8 text-center animate-apple">
      <div
        className="w-full max-w-xs aspect-[9/16] bg-zinc-900 rounded-3xl overflow-hidden border border-white/10 mb-8 relative"
        style={{ cursor: ad.link_url ? 'pointer' : 'default' }}
        onClick={handleAdClick}
      >
        {isVideo ? (
          <video
            src={ad.video_url}
            poster={ad.image_url}
            className="w-full h-full object-cover"
            autoPlay
            muted={muted}
            playsInline
            onPlaying={() => setMediaReady(true)}
            onError={() => { setVideoFailed(true); setMediaReady(true); }}
          />
        ) : (
          <img
            src={ad.image_url}
            className="w-full h-full object-cover opacity-90"
            alt={ad.title || 'Anúncio'}
            onLoad={() => setMediaReady(true)}
            onError={() => setMediaReady(true)} // se a imagem falhar, libera o countdown mesmo assim
          />
        )}
        <div className="absolute top-6 left-6 px-3 py-1 bg-amber-500 text-black text-[9px] font-black rounded-sm tracking-widest">{t('ads.sponsored')}</div>
        {isVideo && (
          <button
            onClick={e => { e.stopPropagation(); setMuted(m => !m); }}
            aria-label={muted ? 'Ativar som' : 'Desativar som'}
            className="absolute top-5 right-5 p-2.5 bg-black/60 backdrop-blur-sm rounded-full border border-white/10 text-white"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        )}
        {ad.link_url && (
          <div className="absolute bottom-6 left-6 right-6 py-3 bg-white text-black text-xs font-black rounded-xl tracking-wide">
            {t('ads.learnMore')}
          </div>
        )}
      </div>

      {ad.title && <h3 className="text-xl font-black text-white mb-2 italic">{ad.title}</h3>}
      {ad.advertiser && <p className="text-zinc-500 text-xs mb-2">{ad.advertiser}</p>}
      <p className="text-zinc-600 text-xs mb-8">{t('ads.contentSoon')}</p>

      <button
        onClick={timeLeft === 0 ? onFinish : undefined}
        className={`px-12 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${timeLeft === 0 ? 'bg-white text-black scale-105' : 'bg-white/5 text-white/20 border border-white/10 cursor-not-allowed'}`}
      >
        {timeLeft > 0 ? `${t('ads.skipIn')} ${timeLeft}s` : t('ads.skip')}
      </button>
    </div>
  );
};

export default AdComponent;
