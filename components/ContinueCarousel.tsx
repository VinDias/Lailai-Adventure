import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';
import ImageWithFallback from './ImageWithFallback';
import ProgressBar from './ProgressBar';

type Props = {
  contentType: 'hqcine' | 'vcine' | 'hiqua';
  onOpen: (seriesId: string, episodeId: string) => void;
};

/**
 * Carrossel "Continuar" no topo da aba: o que o usuário deixou pela metade.
 * O backend já aplica as regras de ordenação, poda e saída — aqui só filtramos
 * pelo tipo da aba em que estamos.
 */
const ContinueCarousel: React.FC<Props> = ({ contentType, onOpen }) => {
  const [itens, setItens] = useState<any[]>([]);
  const t = useT();

  useEffect(() => {
    let cancelado = false;
    api.getContinueList()
      .then(lista => { if (!cancelado) setItens(lista.filter((l: any) => l.contentType === contentType)); })
      .catch(() => { /* sem progresso: o carrossel simplesmente não aparece */ });
    return () => { cancelado = true; };
  }, [contentType]);

  if (itens.length === 0) return null;

  return (
    <section className="px-8 mb-8">
      <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">
        {t('continue_reading')}
      </h2>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {itens.map(item => (
          <button
            key={String(item.episodeId)}
            onClick={() => onOpen(String(item.seriesId), String(item.episodeId))}
            className="shrink-0 w-32 text-left group"
          >
            <div className="rounded-2xl overflow-hidden mb-2 aspect-[2/3] bg-zinc-900">
              <ImageWithFallback
                src={item.series?.cover_image}
                alt={item.series?.title || ''}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </div>
            <p className="text-xs font-bold truncate">{item.series?.title}</p>
            <p className="text-[10px] text-zinc-500 font-bold mb-1">
              {Math.round(item.percent * 100)}%
            </p>
            <ProgressBar percent={item.percent} />
          </button>
        ))}
      </div>
    </section>
  );
};

export default ContinueCarousel;
