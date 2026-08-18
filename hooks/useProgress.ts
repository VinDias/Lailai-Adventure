import { useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';

/** Webtoon grava mais rápido — como o spec pede — porque o intervalo entre
 *  scrolls tende a ser curto e o percentual muda pouco a cada tela. */
const INTERVALO_WEBTOON_MS = 3000;
/**
 * Vídeo grava mais devagar. Contra o limitador global de requisições do
 * servidor (`server.js`: 300/15min por IP, em TODA a API, não só progresso):
 * em VCine (vídeo de ~30s), 2% de limiar equivale a 0,6s — nunca segura nada
 * sozinho, então cada vídeo curto gerava ~10 escritas (~13 requisições no
 * total). Uns 23 vídeos em 15 minutos e o usuário toma 429 na API inteira —
 * pior ainda atrás do CGNAT das operadoras móveis, onde o TWA vive.
 */
const INTERVALO_VIDEO_MS = 10000;
/** Abaixo disso (variação de percentual) não vale uma escrita no banco. */
const LIMIAR_PERCENT = 0.02;
/**
 * Abaixo disso (variação de `position`, em segundos) também não vale — só
 * faz sentido pra vídeo, onde `position` é o segundo exato da reprodução;
 * webtoon sempre manda `position=0`, então essa checagem é pulada para
 * `contentType === 'hiqua'` (senão nenhuma gravação de webtoon aconteceria).
 */
const LIMIAR_POSICAO_SEGUNDOS = 5;

type Args = {
  seriesId: string;
  episodeId: string;
  contentType: 'hqcine' | 'vcine' | 'hiqua';
};

/**
 * Registra onde o usuário parou, sem inundar o servidor.
 *
 * Grava no máximo uma vez a cada 3s (webtoon) ou 10s (vídeo), e só quando o
 * avanço passa de 2% E (para vídeo) de 5 segundos de posição — e sempre
 * descarrega o que estiver pendente ao sair da tela ou quando o app vai para
 * segundo plano (Android: apertar Home quase nunca desmonta o React), que é
 * justamente quando o dado importa.
 */
export function useProgress({ seriesId, episodeId, contentType }: Args) {
  const pendente = useRef<{ percent: number; position: number } | null>(null);
  const ultimoGravado = useRef<number>(-1);
  const ultimaPosicaoGravada = useRef<number>(Number.NEGATIVE_INFINITY);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // O limiar existe para poupar escritas *durante* a leitura, quando haverá
  // outra chance de gravar em breve. Na saída não há próxima chance — por
  // isso `forcar` ignora os limiares e descarrega o pendente incondicionalmente.
  const gravar = useCallback((forcar = false) => {
    const dados = pendente.current;
    if (!dados || !seriesId || !episodeId) return;

    if (!forcar) {
      const percentMudouPouco = Math.abs(dados.percent - ultimoGravado.current) < LIMIAR_PERCENT;
      const posicaoMudouPouco = contentType !== 'hiqua'
        && Math.abs(dados.position - ultimaPosicaoGravada.current) < LIMIAR_POSICAO_SEGUNDOS;
      if (percentMudouPouco || posicaoMudouPouco) return;
    }

    ultimoGravado.current = dados.percent;
    ultimaPosicaoGravada.current = dados.position;
    pendente.current = null;
    api.saveProgress({ seriesId, episodeId, contentType, ...dados }).catch(() => {
      // Falha de rede não pode atrapalhar a leitura: tenta de novo no próximo report.
      ultimoGravado.current = -1;
      ultimaPosicaoGravada.current = Number.NEGATIVE_INFINITY;
    });
  }, [seriesId, episodeId, contentType]);

  const report = useCallback((percent: number, position = 0) => {
    pendente.current = { percent: Math.min(1, Math.max(0, percent)), position };
    if (timer.current) return;
    const intervaloMs = contentType === 'hiqua' ? INTERVALO_WEBTOON_MS : INTERVALO_VIDEO_MS;
    timer.current = setTimeout(() => {
      timer.current = null;
      gravar();
    }, intervaloMs);
  }, [gravar, contentType]);

  useEffect(() => () => {
    // `gravar` muda de identidade a cada troca de seriesId/episodeId — e o
    // WebtoonReader/VerticalPlayer NÃO desmontam ao trocar de capítulo (só
    // trocam a prop). Então este cleanup roda a cada troca, não só na saída
    // de verdade. Sem zerar `timer.current` aqui, ele fica com o id do timer
    // já cancelado (ainda truthy) — e como `report()` faz `if (timer.current)
    // return`, nenhum timer novo é agendado depois disso: a gravação
    // periódica morre pelo resto da sessão.
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    gravar(true); // descarrega o pendente ao sair, sempre — ignora os limiares
  }, [gravar]);

  // No Android, "sair" quase nunca é desmontar o React — é apertar Home ou o
  // sistema matar o processo em segundo plano. Sem isso, o usuário podia ler
  // 70% de um capítulo, apertar Home, o Android matar o app, e nada ter sido
  // gravado (o timer periódico nunca chegou a disparar). `visibilitychange`
  // dispara ANTES do processo ser morto — é o único gancho confiável que
  // sobra nesse cenário.
  useEffect(() => {
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === 'hidden') gravar(true);
    };
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => document.removeEventListener('visibilitychange', aoMudarVisibilidade);
  }, [gravar]);

  return { report };
}
