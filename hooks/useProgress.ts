import { useCallback, useEffect, useRef } from 'react';
import { api } from '../services/api';

/** Espera o leitor/player sossegar antes de gravar. */
const INTERVALO_MS = 3000;
/** Abaixo disso não vale uma escrita no banco. */
const LIMIAR_PERCENT = 0.02;

type Args = {
  seriesId: string;
  episodeId: string;
  contentType: 'hqcine' | 'vcine' | 'hiqua';
};

/**
 * Registra onde o usuário parou, sem inundar o servidor.
 *
 * Grava no máximo uma vez a cada 3 segundos e só quando o avanço passa de 2% —
 * e sempre descarrega o que estiver pendente ao sair da tela, que é justamente
 * quando o dado importa.
 */
export function useProgress({ seriesId, episodeId, contentType }: Args) {
  const pendente = useRef<{ percent: number; position: number } | null>(null);
  const ultimoGravado = useRef<number>(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const gravar = useCallback(() => {
    const dados = pendente.current;
    if (!dados || !seriesId || !episodeId) return;
    if (Math.abs(dados.percent - ultimoGravado.current) < LIMIAR_PERCENT) return;

    ultimoGravado.current = dados.percent;
    pendente.current = null;
    api.saveProgress({ seriesId, episodeId, contentType, ...dados }).catch(() => {
      // Falha de rede não pode atrapalhar a leitura: tenta de novo no próximo report.
      ultimoGravado.current = -1;
    });
  }, [seriesId, episodeId, contentType]);

  const report = useCallback((percent: number, position = 0) => {
    pendente.current = { percent: Math.min(1, Math.max(0, percent)), position };
    if (timer.current) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      gravar();
    }, INTERVALO_MS);
  }, [gravar]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    gravar(); // descarrega o pendente ao sair
  }, [gravar]);

  return { report };
}
