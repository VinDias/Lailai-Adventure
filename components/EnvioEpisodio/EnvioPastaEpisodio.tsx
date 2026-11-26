/**
 * Envio da pasta de um episódio (Fase 7, frente A, itens 2 e 4): escolher a
 * pasta (computador) ou vários arquivos (celular), conferir, confirmar e
 * enviar em partes, com progresso e nova tentativa. Usado no Meu Estúdio
 * (PortalEstudio) e no Gerenciar Conteúdo (AdminDashboard); a guarda de quem
 * pode enviar fica no servidor.
 *
 * Nenhuma chamada sai antes do clique em Enviar, a não ser a leitura dos
 * limites (GET /config). Ler a pasta é só o cabeçalho de cada arquivo, aqui
 * no aparelho.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../contexts/I18nContext';
import { api as apiReal, EnvioConfig } from '../../services/api';
import { organizarPasta } from '../../shared/organizacaoEpisodio.mjs';
import { ArquivoLido, ApiDoEnvio, EnvioEmPartes, ErroEnvio, lerPasta, Preparador, Progresso } from '../../utils/envioPasta';
import ConferenciaEnvio, { ResultadoDaPasta } from './ConferenciaEnvio';

type ApiDoModal = ApiDoEnvio & { getEnvioEpisodioConfig(): Promise<EnvioConfig> };

interface Props {
  episode: { _id: string; title?: string; panels?: unknown[] };
  onFechar: () => void;
  /** Episódio gravado, como o servidor devolveu (painéis novos). */
  onConcluido?: (episode: any) => void;
  /** Trocados nos testes. */
  api?: ApiDoModal;
  preparador?: Preparador;
  esperar?: (ms: number) => Promise<void>;
}

const preencher = (texto: string, valores: Record<string, string | number>) =>
  Object.entries(valores).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), texto);

type Etapa = 'escolher' | 'lendo' | 'conferir' | 'enviando' | 'parou' | 'pronto';

const EnvioPastaEpisodio: React.FC<Props> = ({ episode, onFechar, onConcluido, api = apiReal as unknown as ApiDoModal, preparador, esperar }) => {
  const t = useT();
  const [config, setConfig] = useState<EnvioConfig | null>(null);
  const [erroConfig, setErroConfig] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('escolher');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [lidos, setLidos] = useState<ArquivoLido[]>([]);
  const [confirmado, setConfirmado] = useState(false);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [problemasDoServidor, setProblemasDoServidor] = useState<ResultadoDaPasta['problemas'] | null>(null);
  const [totalFinal, setTotalFinal] = useState(0);
  const envioRef = useRef<EnvioEmPartes | null>(null);
  const ocupado = useRef(false);
  const pastaRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vivo = true;
    api.getEnvioEpisodioConfig()
      .then(c => { if (vivo) setConfig(c); })
      .catch((e: any) => { if (vivo) setErroConfig(e?.message || 'config'); });
    return () => { vivo = false; };
  }, [api]);

  // webkitdirectory não é atributo do React: posto à mão no input da pasta.
  useEffect(() => {
    pastaRef.current?.setAttribute('webkitdirectory', '');
    pastaRef.current?.setAttribute('directory', '');
  }, [etapa]);

  const resultado = useMemo<ResultadoDaPasta | null>(() => {
    if (!config || lidos.length === 0) return null;
    return organizarPasta(lidos, {
      limitePaineis: config.limitePaineis,
      limiteBytes: config.limiteBytes,
      tamanhoMaximoArquivo: config.tamanhoMaximoParte,
    }) as ResultadoDaPasta;
  }, [config, lidos]);

  const escolher = async (lista: FileList | null) => {
    const fs = Array.from(lista ?? []);
    if (fs.length === 0) return;
    setErro(null);
    setProblemasDoServidor(null);
    setConfirmado(false);
    setEtapa('lendo');
    setArquivos(fs);
    setLidos(await lerPasta(fs));
    setEtapa('conferir');
  };

  const mensagemDoErro = (e: any) => {
    if (e instanceof ErroEnvio && e.tipo === 'decodificar') return preencher(t('envio.erroDecodificar'), { erro: e.message });
    if (e instanceof ErroEnvio && e.tipo === 'rede') return preencher(t('envio.erroRede'), { erro: e.message });
    return preencher(t('envio.erroRecusado'), { erro: e?.message || '' });
  };

  const executar = async () => {
    if (ocupado.current || !config) return;
    ocupado.current = true;
    setErro(null);
    setEtapa('enviando');
    if (!envioRef.current) {
      envioRef.current = new EnvioEmPartes({
        episodeId: episode._id,
        arquivos,
        lidos,
        config,
        api,
        preparador,
        esperar,
        onProgresso: setProgresso,
      });
    }
    try {
      const fim = await envioRef.current.executar();
      setTotalFinal(fim.totalPaineis);
      setEtapa('pronto');
      onConcluido?.(fim.episode);
    } catch (e: any) {
      // Recusa no iniciar (a pasta mudou entre a conferência e o envio, ou
      // o limite mudou no admin): mostra os problemas do servidor.
      if (!envioRef.current.envioId) {
        envioRef.current = null;
        if (Array.isArray(e?.problemas)) setProblemasDoServidor(e.problemas);
      }
      setErro(mensagemDoErro(e));
      setEtapa('parou');
    } finally {
      ocupado.current = false;
    }
  };

  const cancelar = async () => {
    const envio = envioRef.current;
    envioRef.current = null;
    if (envio) await envio.cancelar();
    onFechar();
  };

  const podeEnviar = !!resultado && resultado.podeEnviar && confirmado;
  const recomecar = () => {
    envioRef.current = null;
    setArquivos([]);
    setLidos([]);
    setEtapa('escolher');
    setErro(null);
    setProblemasDoServidor(null);
  };

  const pct = progresso && progresso.total > 0 ? Math.round((progresso.enviados / progresso.total) * 100) : 0;
  const continuaveis = !!envioRef.current?.envioId;

  return (
    <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="envio-pasta-titulo">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto bg-[var(--card-bg,#18181b)] border border-white/10 p-6 rounded-[2rem] space-y-4">
        <div>
          <p id="envio-pasta-titulo" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('envio.titulo')}</p>
          <h2 className="text-xl font-black text-[var(--text-color)] truncate">{episode.title}</h2>
        </div>

        {erroConfig && <p role="alert" className="text-rose-500 text-sm font-bold">{preencher(t('envio.erroRecusado'), { erro: erroConfig })}</p>}

        {(etapa === 'escolher' || etapa === 'conferir') && (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">{t('envio.instrucoes')}</p>
            <div className="flex gap-2 flex-wrap">
              <label className="px-4 py-2 rounded-xl bg-white/5 text-[11px] font-black uppercase tracking-widest text-zinc-300 cursor-pointer hover:bg-white/10">
                {t('envio.escolherPasta')}
                <input ref={pastaRef} data-testid="envio-input-pasta" type="file" multiple className="hidden" onChange={e => { escolher(e.target.files); e.target.value = ''; }} />
              </label>
              <label className="px-4 py-2 rounded-xl bg-white/5 text-[11px] font-black uppercase tracking-widest text-zinc-300 cursor-pointer hover:bg-white/10">
                {t('envio.escolherArquivos')}
                <input data-testid="envio-input-arquivos" type="file" multiple accept=".jpg,.jpeg,.png,image/jpeg,image/png" className="hidden" onChange={e => { escolher(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
          </div>
        )}

        {etapa === 'lendo' && <p className="text-xs text-zinc-400">{t('envio.lendo')}</p>}

        {resultado && (etapa === 'conferir' || etapa === 'parou') && (
          <ConferenciaEnvio
            resultado={problemasDoServidor ? { ...resultado, problemas: problemasDoServidor } : resultado}
            paineisAtuais={episode.panels?.length ?? 0}
          />
        )}

        {etapa === 'conferir' && resultado && (
          <label className="flex items-start gap-2 text-xs text-zinc-300">
            <input type="checkbox" data-testid="envio-confirmo" checked={confirmado} disabled={!resultado.podeEnviar} onChange={e => setConfirmado(e.target.checked)} />
            <span>{t('envio.confirmo')}</span>
          </label>
        )}

        {(etapa === 'enviando' || (etapa === 'parou' && continuaveis)) && progresso && (
          <div className="space-y-1">
            <div className="h-2 rounded-full bg-white/5 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={progresso.total} aria-valuenow={progresso.enviados}>
              <div className="h-full bg-rose-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p data-testid="envio-progresso" className="text-xs text-zinc-400">
              {progresso.fase === 'iniciando' ? t('envio.iniciando')
                : progresso.fase === 'concluindo' ? t('envio.concluindo')
                : preencher(t('envio.enviando'), { enviados: progresso.enviados, total: progresso.total })}
            </p>
          </div>
        )}

        {erro && <p role="alert" className="text-rose-500 text-sm font-bold">{erro}</p>}

        {etapa === 'pronto' && (
          <p role="status" className="text-emerald-400 text-sm font-bold">{preencher(t('envio.pronto'), { n: totalFinal })}</p>
        )}

        <div className="flex gap-3 pt-2">
          {etapa === 'pronto' ? (
            <button type="button" onClick={onFechar} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl">{t('envio.fechar')}</button>
          ) : (
            <>
              <button type="button" onClick={cancelar} disabled={etapa === 'enviando'} className="flex-1 py-3 font-bold text-zinc-500 disabled:opacity-40">
                {continuaveis ? t('envio.cancelar') : t('envio.fechar')}
              </button>
              {etapa === 'parou' && continuaveis && (
                <button type="button" onClick={executar} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl">{t('envio.tentarDeNovo')}</button>
              )}
              {etapa === 'parou' && !continuaveis && (
                <button type="button" onClick={recomecar} className="flex-1 py-3 bg-white/10 text-white font-black rounded-2xl">{t('envio.escolherDeNovo')}</button>
              )}
              {(etapa === 'conferir' || etapa === 'enviando') && (
                <button type="button" data-testid="envio-enviar" onClick={executar} disabled={!podeEnviar || etapa === 'enviando'} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50">
                  {etapa === 'enviando' ? '...' : t('envio.enviar')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnvioPastaEpisodio;
