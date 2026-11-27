import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import type { EstadoVideoEpisodio } from '../../services/api';
import { useT } from '../../contexts/I18nContext';
import { enviarVideoTus, ErroEnvioVideo } from '../../utils/envioVideoTus';
import type { OpcoesEnvioTus } from '../../utils/envioVideoTus';

/**
 * Envio do vídeo de um episódio de V-Show ou Anicom pelo autor (Fase 7,
 * frente A, item 9). O arquivo vai DIRETO do navegador ao Bunny Stream
 * (utils/envioVideoTus.ts), com a autorização de curta duração que o servidor
 * entrega só ao dono do episódio. Depois do envio a tela acompanha o
 * processamento e avisa quando o vídeo está pronto.
 *
 * Vídeo pronto NÃO publica o episódio: ele segue rascunho até o autor enviar
 * para aprovação e o moderador aprovar.
 */

export const TIPOS_DE_VIDEO_ACEITOS = ['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/mkv', 'video/matroska'];
const EXTENSOES: Record<string, string> = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska' };
const MB = 1024 * 1024;
export const INTERVALO_DE_CONSULTA_MS = 8000;

/** MIME do arquivo; alguns navegadores não informam o de .mkv e .mov. */
export function tipoDoVideo(arquivo: { name?: string; type?: string }): string | null {
  if (arquivo.type && TIPOS_DE_VIDEO_ACEITOS.includes(arquivo.type)) return arquivo.type;
  const ext = (arquivo.name || '').split('.').pop()?.toLowerCase() ?? '';
  return EXTENSOES[ext] ?? null;
}

const preencher = (texto: string, valores: Record<string, string | number>) =>
  texto.replace(/\{(\w+)\}/g, (_, k) => (k in valores ? String(valores[k]) : `{${k}}`));

type Etapa = 'escolher' | 'enviando' | 'processando' | 'pronto' | 'erro';

interface Props {
  episode: { _id: string; title: string; videoEnvio?: { estado?: string } | null };
  onFechar: () => void;
  /** Avisa a lista de capítulos do estado novo do vídeo. */
  onEstado?: (estado: EstadoVideoEpisodio['estado']) => void;
  /** Para os testes: troca o envio TUS (o Bunny) por um falso. */
  enviar?: (opcoes: OpcoesEnvioTus) => Promise<unknown>;
  intervaloDeConsultaMs?: number;
}

const EnvioVideoEpisodio: React.FC<Props> = ({ episode, onFechar, onEstado, enviar = enviarVideoTus, intervaloDeConsultaMs = INTERVALO_DE_CONSULTA_MS }) => {
  const t = useT();
  const estadoInicial = episode.videoEnvio?.estado;
  const [etapa, setEtapa] = useState<Etapa>(estadoInicial === 'processando' ? 'processando' : estadoInicial === 'pronto' ? 'pronto' : 'escolher');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<{ enviados: number; total: number } | null>(null);
  const abortar = useRef<AbortController | null>(null);
  const vivo = useRef(true);
  const onEstadoRef = useRef(onEstado);
  onEstadoRef.current = onEstado;

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; abortar.current?.abort(); };
  }, []);

  // Enquanto o vídeo processa, pergunta ao servidor de tempos em tempos.
  useEffect(() => {
    if (etapa !== 'processando') return;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout>;
    const consultar = async () => {
      try {
        const r = await api.getEstadoVideoEpisodio(episode._id);
        if (cancelado) return;
        if (r.estado === 'pronto') { setEtapa('pronto'); onEstadoRef.current?.('pronto'); return; }
        if (r.estado === 'erro') { setErro(t('video.erroProcessamento')); setEtapa('erro'); onEstadoRef.current?.('erro'); return; }
      } catch {
        // Falha de rede na consulta: tenta de novo na próxima volta.
      }
      if (!cancelado) timer = setTimeout(consultar, intervaloDeConsultaMs);
    };
    timer = setTimeout(consultar, intervaloDeConsultaMs);
    return () => { cancelado = true; clearTimeout(timer); };
  }, [etapa, episode._id, intervaloDeConsultaMs, t]);

  const escolher = (f: File | null) => {
    setErro(null);
    setArquivo(null);
    if (!f) return;
    if (!tipoDoVideo(f)) { setErro(t('video.erroFormato')); return; }
    setArquivo(f);
  };

  const executar = useCallback(async () => {
    if (!arquivo) return;
    const tipo = tipoDoVideo(arquivo);
    if (!tipo) { setErro(t('video.erroFormato')); return; }
    setErro(null);
    setProgresso({ enviados: 0, total: arquivo.size });
    setEtapa('enviando');
    const controle = new AbortController();
    abortar.current = controle;
    try {
      // O servidor confere dono, rascunho, tamanho e formato antes de liberar.
      const autorizacao = await api.autorizarEnvioVideo(episode._id, { tamanho: arquivo.size, tipo });
      onEstadoRef.current?.('enviando');
      await enviar({
        arquivo,
        nome: arquivo.name,
        tipo,
        autorizacao,
        renovar: () => api.autorizarEnvioVideo(episode._id, { renovar: true }),
        aoProgredir: (enviados, total) => { if (vivo.current) setProgresso({ enviados, total }); },
        sinal: controle.signal,
      });
      if (!vivo.current) return;
      setEtapa('processando');
      onEstadoRef.current?.('processando');
    } catch (e: any) {
      if (!vivo.current) return;
      if (e instanceof ErroEnvioVideo && e.tipo === 'cancelado') { setEtapa('escolher'); setProgresso(null); return; }
      setErro(e instanceof ErroEnvioVideo && e.tipo === 'rede'
        ? preencher(t('video.erroRede'), { erro: e.message })
        : preencher(t('video.erroRecusado'), { erro: e?.message || '' }));
      setEtapa('erro');
    }
  }, [arquivo, enviar, episode._id, t]);

  const cancelar = () => {
    if (etapa === 'enviando') { abortar.current?.abort(); return; }
    onFechar();
  };

  const pct = progresso && progresso.total > 0 ? Math.min(100, Math.round((progresso.enviados / progresso.total) * 100)) : 0;
  const emMb = (b: number) => (b / MB).toFixed(b >= 10 * MB ? 0 : 1);

  return (
    <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="envio-video-titulo">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--card-bg,#18181b)] border border-white/10 p-6 rounded-[2rem] space-y-4">
        <div>
          <p id="envio-video-titulo" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('video.titulo')}</p>
          <h2 className="text-xl font-black text-[var(--text-color)] truncate">{episode.title}</h2>
        </div>

        {(etapa === 'escolher' || etapa === 'erro') && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">{t('video.instrucoes')}</p>
            {estadoInicial === 'pronto' && etapa === 'escolher' && <p className="text-xs font-bold text-amber-400">{t('video.avisoTroca')}</p>}
            <label className="inline-block px-4 py-2 rounded-xl bg-white/5 text-[11px] font-black uppercase tracking-widest text-zinc-300 cursor-pointer hover:bg-white/10">
              {t('video.escolher')}
              <input
                data-testid="video-input"
                type="file"
                accept=".mp4,.m4v,.mov,.mkv,video/mp4,video/quicktime,video/x-matroska"
                className="hidden"
                onChange={e => { escolher(e.target.files?.[0] ?? null); e.target.value = ''; }}
              />
            </label>
            {arquivo && <p data-testid="video-arquivo" className="text-xs text-zinc-300">{arquivo.name} · {emMb(arquivo.size)} MB</p>}
          </div>
        )}

        {etapa === 'enviando' && progresso && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-white/5 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
              <div className="h-full bg-rose-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p data-testid="video-progresso" className="text-xs text-zinc-400">
              {preencher(t('video.enviando'), { pct, enviados: emMb(progresso.enviados), total: emMb(progresso.total) })}
            </p>
            <p className="text-[10px] text-zinc-600">{t('video.naoFeche')}</p>
          </div>
        )}

        {etapa === 'processando' && <p role="status" data-testid="video-processando" className="text-amber-400 text-sm font-bold">{t('video.processando')}</p>}

        {etapa === 'pronto' && estadoInicial !== 'pronto' && <p role="status" data-testid="video-pronto" className="text-emerald-400 text-sm font-bold">{t('video.pronto')}</p>}
        {etapa === 'pronto' && estadoInicial === 'pronto' && <p role="status" data-testid="video-pronto" className="text-emerald-400 text-sm font-bold">{t('video.jaPronto')}</p>}

        {erro && <p role="alert" className="text-rose-500 text-sm font-bold">{erro}</p>}

        <div className="flex gap-3 pt-2">
          {etapa === 'pronto' && (
            <>
              <button type="button" onClick={() => { setArquivo(null); setProgresso(null); setEtapa('escolher'); }} className="flex-1 py-3 font-bold text-zinc-500">{t('video.trocar')}</button>
              <button type="button" onClick={onFechar} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl">{t('envio.fechar')}</button>
            </>
          )}
          {etapa === 'processando' && (
            <button type="button" onClick={onFechar} className="flex-1 py-3 bg-white/10 text-white font-black rounded-2xl">{t('envio.fechar')}</button>
          )}
          {(etapa === 'escolher' || etapa === 'erro' || etapa === 'enviando') && (
            <>
              <button type="button" onClick={cancelar} className="flex-1 py-3 font-bold text-zinc-500">
                {etapa === 'enviando' ? t('envio.cancelar') : t('envio.fechar')}
              </button>
              <button type="button" data-testid="video-enviar" onClick={executar} disabled={!arquivo || etapa === 'enviando'} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50">
                {etapa === 'enviando' ? '...' : etapa === 'erro' ? t('envio.tentarDeNovo') : t('video.enviar')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnvioVideoEpisodio;
