import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';
import ImageWithFallback from './ImageWithFallback';
import ProgressBar from './ProgressBar';

type Props = {
  contentType: 'hqcine' | 'vcine' | 'hiqua';
  // A aba (HQCine/HiQua/VFilm) já busca essa mesma lista pra pintar a barra
  // de progresso nos cards do catálogo (ver ProgressBar ali) — quando ela
  // passa a lista pronta aqui, o carrossel não busca de novo. Sem essa prop
  // (uso isolado/testes), o carrossel busca sozinho.
  items?: any[];
  // As abas fazem uma busca assíncrona (série + episódio) antes de abrir de
  // verdade — por isso onOpen pode devolver uma Promise. O carrossel espera
  // por ela para mostrar carregando/erro em vez de nada.
  onOpen: (seriesId: string, episodeId: string) => void | Promise<void>;
};

/**
 * Carrossel "Continuar" no topo da aba: o que o usuário deixou pela metade.
 * O backend já aplica as regras de ordenação, poda, teto por aba e saída —
 * o `?contentType=` da própria busca já filtra pelo tipo da aba em que estamos.
 */
const ContinueCarousel: React.FC<Props> = ({ contentType, items, onOpen }) => {
  const [buscados, setBuscados] = useState<any[]>([]);
  // Achado da revisão: o clique dependia de estado que podia não ter
  // chegado (série ainda não carregada) e, quando faltava, o handler saía
  // em silêncio — o usuário clicava e nada acontecia. Agora todo clique
  // mostra que está carregando e, se falhar, avisa (em vez de morrer calado).
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [erroId, setErroId] = useState<string | null>(null);
  const montado = useRef(true);
  const t = useT();

  useEffect(() => {
    if (items !== undefined) return; // o componente pai já controla a lista
    let cancelado = false;
    api.getContinueList(contentType)
      .then(lista => { if (!cancelado) setBuscados(lista); })
      .catch(() => { /* sem progresso: o carrossel simplesmente não aparece */ });
    return () => { cancelado = true; };
  }, [contentType, items]);

  useEffect(() => () => { montado.current = false; }, []);

  const itens = items ?? buscados;

  const handleClick = async (seriesId: string, episodeId: string) => {
    // Um clique por vez: evita duas aberturas concorrentes disputando a tela.
    if (abrindoId) return;
    setErroId(null);
    setAbrindoId(episodeId);
    try {
      await onOpen(seriesId, episodeId);
      if (montado.current) setAbrindoId(null);
    } catch (e) {
      console.error('Erro ao abrir a partir do carrossel "Continuar"', e);
      if (montado.current) {
        setAbrindoId(null);
        setErroId(episodeId);
      }
    }
  };

  if (itens.length === 0) return null;

  return (
    <section className="px-8 mb-8">
      <h2 className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-3">
        {t('continue.reading')}
      </h2>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {itens.map(item => {
          const episodeId = String(item.episodeId);
          const estaAbrindo = abrindoId === episodeId;
          const deuErro = erroId === episodeId;
          // "Cap. 2 · 62%" no webtoon, "Ep. 2 · 62%" em vídeo — número do
          // episódio (episode_number), não o título: os títulos cadastrados
          // pelo cliente são inconsistentes (ex.: "The Nears Ones  EP2"),
          // então exibi-los produziria rótulos bagunçados. Dado órfão
          // (episódio apagado depois do progresso salvo) não quebra a
          // linha — o rótulo simplesmente omite o capítulo.
          const numeroEpisodio = item.episode?.episode_number;
          const percentual = `${Math.round(item.percent * 100)}%`;
          const rotuloProgresso = numeroEpisodio != null
            ? `${item.contentType === 'hiqua' ? t('reader.chapterShort') : t('player.episodeShort')} ${numeroEpisodio} · ${percentual}`
            : percentual;
          return (
            <button
              key={episodeId}
              onClick={() => handleClick(String(item.seriesId), episodeId)}
              disabled={abrindoId !== null}
              className="shrink-0 w-32 text-left group disabled:cursor-wait"
            >
              <div className="rounded-2xl overflow-hidden mb-2 aspect-[2/3] bg-zinc-900 relative">
                <ImageWithFallback
                  src={item.series?.cover_image}
                  alt={item.series?.title || ''}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                {estaAbrindo && (
                  <div data-testid="continue-loading" className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </div>
              <p className="text-xs font-bold truncate">{item.series?.title}</p>
              {deuErro ? (
                <p className="text-[10px] text-rose-500 font-bold mb-1">{t('continue.openError')}</p>
              ) : (
                <>
                  <p className="text-[10px] text-zinc-500 font-bold mb-1 truncate">
                    {rotuloProgresso}
                  </p>
                  <ProgressBar percent={item.percent} />
                </>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default ContinueCarousel;
