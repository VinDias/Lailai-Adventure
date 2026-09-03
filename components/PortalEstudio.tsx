import React, { useCallback, useEffect, useState } from 'react';
import { X, Lock, Send } from 'lucide-react';
import { api } from '../services/api';
import { useT } from '../contexts/I18nContext';
import { useCamadaVoltar } from '../utils/pilhaVoltar';
import { NOME_ABA } from '../utils/contentTypeLabels';
import { formatarValorMonetario } from '../utils/currency';
import ImageWithFallback from './ImageWithFallback';

type Aba = 'numeros' | 'obras' | 'mensagens';

interface PortalEstudioProps {
  onClose: () => void;
}

// Valor decimal (não centavos) — mesmo formato de RoyaltyPeriod.breakdown[].amount
// (share × poolFinal). Sem espaço após "R$", consistente com
// utils/currency.ts formatarValorMonetario (usada para os centavos do Super Reader).
function brl(v: number): string {
  return `R$${(v || 0).toFixed(2).replace('.', ',')}`;
}

// Os 3 estados derivados puramente do documento (spec, decisão "Submissão
// explícita" — Task 9): isPublished → Publicada; senão submittedAt →
// Em análise; senão Rascunho. "Devolvida" NÃO é um 4º estado: devolver
// (Fila de Aprovação, T7) limpa submittedAt e a obra volta a aparecer como
// Rascunho — sem marcador próprio no documento. O ilustrador descobre a
// devolução pela aba Mensagens (a devolução sempre gera uma MensagemPortal
// do editor com refTipo/refId apontando pra obra/capítulo). Ver decisão no
// brief da Task 9 — criar uma rota nova só para "Devolvida" foi
// explicitamente descartado.
function estadoDoDocumento(doc: { isPublished?: boolean; status?: string; submittedAt?: string | null }): 'rascunho' | 'analise' | 'publicada' {
  if (doc.isPublished || doc.status === 'published') return 'publicada';
  if (doc.submittedAt) return 'analise';
  return 'rascunho';
}

const PortalEstudio: React.FC<PortalEstudioProps> = ({ onClose }) => {
  const t = useT();
  const [aba, setAba] = useState<Aba>('numeros');

  // ─── Sessão / canais do usuário ────────────────────────────────────────
  const [canais, setCanais] = useState<{ channelId: string; name: string; avatar: string | null; obras: number; pendentes: number; mensagensNaoLidas: number }[] | null>(null);
  const [canalSelecionadoId, setCanalSelecionadoId] = useState<string | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const [loadingInicial, setLoadingInicial] = useState(true);

  useEffect(() => {
    let cancelado = false;
    api.getMeuEstudio()
      .then(resposta => {
        if (cancelado) return;
        setCanais(resposta.canais);
        setCanalSelecionadoId(resposta.canais[0]?.channelId ?? null);
        setLoadingInicial(false);
      })
      .catch(() => {
        // 403 (perdeu o canal no meio da sessão) ou qualquer outra falha:
        // mensagem clara e volta pra Conta (spec, "Erros").
        if (cancelado) return;
        setSessionLost(true);
        setLoadingInicial(false);
      });
    return () => { cancelado = true; };
  }, []);

  const multiCanal = (canais?.length ?? 0) > 1;
  const canalIdParaEnvio = multiCanal ? (canalSelecionadoId ?? undefined) : undefined;

  // ─── Aba Números ────────────────────────────────────────────────────────
  const [periodoSelecionado, setPeriodoSelecionado] = useState('');
  const [resumo, setResumo] = useState<any>(null);
  const [resumoLoading, setResumoLoading] = useState(false);

  useEffect(() => {
    if (aba !== 'numeros' || loadingInicial || sessionLost) return;
    let cancelado = false;
    setResumoLoading(true);
    api.getPortalResumo(periodoSelecionado || undefined)
      .then(r => { if (!cancelado) setResumo(r); })
      .catch(() => { if (!cancelado) setResumo(null); })
      .finally(() => { if (!cancelado) setResumoLoading(false); });
    return () => { cancelado = true; };
  }, [aba, periodoSelecionado, loadingInicial, sessionLost]);

  // ─── Aba Obras ──────────────────────────────────────────────────────────
  const [seriesList, setSeriesList] = useState<any[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [envioErro, setEnvioErro] = useState<string | null>(null);
  const [enviandoId, setEnviandoId] = useState<string | null>(null);

  const carregarSeries = useCallback(async () => {
    setSeriesLoading(true);
    try {
      const r = await api.getPortalSeries();
      setSeriesList(r.series);
    } catch {
      setSeriesList([]);
    } finally {
      setSeriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (aba === 'obras' && !loadingInicial && !sessionLost) carregarSeries();
  }, [aba, loadingInicial, sessionLost, carregarSeries]);

  // Criar obra
  const [showCreateObra, setShowCreateObra] = useState(false);
  const [obraTitle, setObraTitle] = useState('');
  const [obraDescription, setObraDescription] = useState('');
  const [obraRating, setObraRating] = useState<'' | 'kids' | 'teen' | 'young'>('');
  const [obraCoverFile, setObraCoverFile] = useState<File | null>(null);
  const [creatingObra, setCreatingObra] = useState(false);
  const [createObraError, setCreateObraError] = useState<string | null>(null);

  useCamadaVoltar(showCreateObra, () => setShowCreateObra(false));

  const abrirCriarObra = () => {
    setObraTitle(''); setObraDescription(''); setObraRating(''); setObraCoverFile(null);
    setCreateObraError(null);
    setShowCreateObra(true);
  };

  const handleCriarObra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obraTitle.trim()) return;
    setCreatingObra(true);
    setCreateObraError(null);
    try {
      const payload: any = { title: obraTitle, description: obraDescription, content_rating_sugerida: obraRating || null };
      if (canalIdParaEnvio) payload.channelId = canalIdParaEnvio;
      // Fluxo capa (spec "Formulários do portal"): cria draft SEM capa
      // primeiro (precisamos do _id real pra derivar o slug do upload) →
      // sobe a capa via upload-image (seriesId real) → PUT com a URL.
      const created = await api.createPortalSeries(payload);
      if (obraCoverFile) {
        const url = await api.uploadPortalImage(obraCoverFile, created._id);
        await api.updatePortalSeries(created._id, { cover_image: url });
      }
      await carregarSeries();
      setShowCreateObra(false);
    } catch (err: any) {
      setCreateObraError(err?.message || t('portal.errors.generic'));
    } finally {
      setCreatingObra(false);
    }
  };

  // Editar obra (draft não submetida)
  const [editingObra, setEditingObra] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRating, setEditRating] = useState<'' | 'kids' | 'teen' | 'young'>('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useCamadaVoltar(!!editingObra, () => setEditingObra(null));

  const abrirEditarObra = (s: any) => {
    setEditTitle(s.title || '');
    setEditDescription(s.description || '');
    setEditRating(s.content_rating_sugerida || '');
    setEditError(null);
    setEditingObra(s);
  };

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingObra) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      await api.updatePortalSeries(editingObra._id, {
        title: editTitle, description: editDescription, content_rating_sugerida: editRating || null,
      });
      await carregarSeries();
      setEditingObra(null);
    } catch (err: any) {
      setEditError(err?.message || t('portal.errors.generic'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleEnviarObra = async (id: string) => {
    if (!window.confirm(t('portal.works.submitConfirm'))) return;
    setEnvioErro(null);
    setEnviandoId(id);
    try {
      await api.enviarPortalSerie(id);
      await carregarSeries();
    } catch (err: any) {
      setEnvioErro(err?.message || t('portal.errors.generic'));
    } finally {
      setEnviandoId(null);
    }
  };

  // Capítulos da obra selecionada
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [episodesOfSelected, setEpisodesOfSelected] = useState<any[]>([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);

  const carregarEpisodios = useCallback(async (seriesId: string) => {
    setEpisodesLoading(true);
    try {
      const eps = await api.getEpisodesBySeries(seriesId);
      setEpisodesOfSelected(eps);
    } catch {
      setEpisodesOfSelected([]);
    } finally {
      setEpisodesLoading(false);
    }
  }, []);

  const toggleSeries = (id: string) => {
    if (selectedSeriesId === id) { setSelectedSeriesId(null); return; }
    setSelectedSeriesId(id);
    carregarEpisodios(id);
  };

  // Criar capítulo
  const [creatingEpisodioFor, setCreatingEpisodioFor] = useState<string | null>(null);
  const [epTitle, setEpTitle] = useState('');
  const [epDescription, setEpDescription] = useState('');
  const [epNumber, setEpNumber] = useState('');
  const [epThumbFile, setEpThumbFile] = useState<File | null>(null);
  const [creatingEpisodio, setCreatingEpisodio] = useState(false);
  const [createEpisodeError, setCreateEpisodeError] = useState<string | null>(null);

  useCamadaVoltar(!!creatingEpisodioFor, () => setCreatingEpisodioFor(null));

  const abrirCriarEpisodio = (seriesId: string) => {
    setEpTitle(''); setEpDescription(''); setEpNumber(''); setEpThumbFile(null);
    setCreateEpisodeError(null);
    setCreatingEpisodioFor(seriesId);
  };

  const handleCriarEpisodio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingEpisodioFor || !epTitle.trim() || !epNumber) return;
    setCreatingEpisodio(true);
    setCreateEpisodeError(null);
    try {
      // Sem PUT de episódio no portal — a miniatura, quando enviada, precisa
      // subir ANTES da criação (diferente do fluxo de capa da série, que já
      // tem _id pra usar no upload; aqui o episódio nasce numa série que já
      // existe, então dá pra subir primeiro e mandar a URL no POST).
      let thumbnail: string | undefined;
      if (epThumbFile) {
        thumbnail = await api.uploadPortalImage(epThumbFile, creatingEpisodioFor);
      }
      const payload: any = { title: epTitle, description: epDescription, episode_number: Number(epNumber) };
      if (thumbnail) payload.thumbnail = thumbnail;
      await api.createPortalEpisodio(creatingEpisodioFor, payload);
      await carregarEpisodios(creatingEpisodioFor);
      setCreatingEpisodioFor(null);
    } catch (err: any) {
      setCreateEpisodeError(err?.message || t('portal.errors.generic'));
    } finally {
      setCreatingEpisodio(false);
    }
  };

  const handleEnviarEpisodio = async (episodeId: string, seriesId: string) => {
    if (!window.confirm(t('portal.works.submitChapterConfirm'))) return;
    setEnvioErro(null);
    setEnviandoId(episodeId);
    try {
      await api.enviarPortalEpisodio(episodeId);
      await carregarEpisodios(seriesId);
    } catch (err: any) {
      setEnvioErro(err?.message || t('portal.errors.generic'));
    } finally {
      setEnviandoId(null);
    }
  };

  // Painéis (batch upload — mesmo padrão do AdminDashboard, envia seriesId
  // real e depois grava as URLs em ordem via addPortalPaineis).
  const [panelsModalFor, setPanelsModalFor] = useState<{ episode: any; seriesId: string } | null>(null);
  const [pendingPanelFiles, setPendingPanelFiles] = useState<File[]>([]);
  const [uploadingPanels, setUploadingPanels] = useState(false);
  const [panelsError, setPanelsError] = useState<string | null>(null);

  useCamadaVoltar(!!panelsModalFor, () => setPanelsModalFor(null));

  const abrirPanelsModal = (ep: any) => {
    if (!selectedSeriesId) return;
    setPendingPanelFiles([]);
    setPanelsError(null);
    setPanelsModalFor({ episode: ep, seriesId: selectedSeriesId });
  };

  const handleAddPanels = async () => {
    if (!panelsModalFor || pendingPanelFiles.length === 0) return;
    setUploadingPanels(true);
    setPanelsError(null);
    try {
      const result = await api.uploadPortalImagesBatch(pendingPanelFiles, panelsModalFor.seriesId);
      const successUrls = result.results.filter(r => r.success && r.url).map(r => r.url as string);
      const existingCount = panelsModalFor.episode.panels?.length ?? 0;
      const panels = successUrls.map((url, i) => ({ image_url: url, order: existingCount + i + 1 }));
      const resp = await api.addPortalPaineis(panelsModalFor.episode._id, panels);
      setEpisodesOfSelected(prev => prev.map(ep => (ep._id === panelsModalFor.episode._id ? resp.episode : ep)));
      setPanelsModalFor(null);
    } catch (err: any) {
      setPanelsError(err?.message || t('portal.errors.generic'));
    } finally {
      setUploadingPanels(false);
    }
  };

  // ─── Aba Mensagens ──────────────────────────────────────────────────────
  const [mensagens, setMensagens] = useState<any[]>([]);
  const [mensagensLoading, setMensagensLoading] = useState(false);
  const [mensagensError, setMensagensError] = useState<string | null>(null);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [enviandoMensagem, setEnviandoMensagem] = useState(false);

  const carregarMensagens = useCallback(async () => {
    setMensagensLoading(true);
    setMensagensError(null);
    try {
      const r = await api.getPortalMensagens(canalIdParaEnvio ? { canalId: canalIdParaEnvio } : {});
      setMensagens(r.mensagens);
    } catch (err: any) {
      setMensagensError(err?.message || t('portal.errors.generic'));
    } finally {
      setMensagensLoading(false);
    }
  }, [canalIdParaEnvio, t]);

  useEffect(() => {
    if (aba === 'mensagens' && !loadingInicial && !sessionLost) carregarMensagens();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, loadingInicial, sessionLost]);

  const handleEnviarMensagem = async () => {
    const texto = novaMensagem.trim();
    if (!texto) return;
    setEnviandoMensagem(true);
    setMensagensError(null);
    try {
      const payload: any = { texto };
      if (canalIdParaEnvio) payload.canalId = canalIdParaEnvio;
      const nova = await api.sendPortalMensagem(payload);
      setMensagens(prev => [...prev, nova]);
      setNovaMensagem('');
    } catch (err: any) {
      setMensagensError(err?.message || t('portal.errors.generic'));
    } finally {
      setEnviandoMensagem(false);
    }
  };

  const tituloDaRef = (m: any): string | null => {
    if (m.refTipo !== 'series' || !m.refId) return null;
    const serie = seriesList.find(s => s._id === m.refId);
    return serie ? serie.title : null;
  };

  // ─── Renderização ───────────────────────────────────────────────────────

  if (sessionLost) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center gap-6 p-10 text-center bg-[var(--bg-color)]">
        <p className="text-[var(--text-color)] font-bold">{t('portal.errors.sessionLost')}</p>
        <button onClick={onClose} className="px-6 py-3 bg-rose-600 text-white rounded-2xl font-black">
          {t('common.back')}
        </button>
      </div>
    );
  }

  if (loadingInicial) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[var(--bg-color)]">
        <div className="w-10 h-10 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--bg-color)] overflow-y-auto pb-40 scrollbar-hide" data-testid="portal-estudio">
      <header className="p-8 pt-16 flex items-center justify-between">
        <h1 className="text-3xl font-black tracking-tighter text-[var(--text-color)]">{t('portal.screenTitle')}</h1>
        <button
          onClick={onClose}
          aria-label={t('common.back')}
          className="p-3 bg-white/5 rounded-2xl border border-white/10 text-[var(--text-color)] hover:bg-white/10 transition-all"
        >
          <X size={18} />
        </button>
      </header>

      <nav className="flex gap-2 px-8 mb-6">
        {([
          ['numeros', t('portal.tabNumbers')],
          ['obras', t('portal.tabWorks')],
          ['mensagens', t('portal.tabMessages')],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setAba(key)}
            className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all ${aba === key ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400 border border-white/10 hover:text-[var(--text-color)]'}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {aba === 'numeros' && (
        <section className="px-8 space-y-6">
          <div className="flex items-center gap-3">
            <label htmlFor="portal-period-select" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
              {t('portal.numbers.periodSelectLabel')}
            </label>
            <select
              id="portal-period-select"
              value={periodoSelecionado}
              onChange={e => setPeriodoSelecionado(e.target.value)}
              className="bg-[rgba(128,128,128,0.1)] border border-[rgba(128,128,128,0.35)] rounded-2xl px-4 py-2 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
            >
              <option value="">{t('portal.numbers.currentMonth')}</option>
              {(resumo?.periodosFechadosDisponiveis ?? []).map((p: string) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {resumoLoading || !resumo ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {resumo.status === 'aberto' && (
                <p className="text-xs text-zinc-500">{t('portal.numbers.currentMonthHint')}</p>
              )}

              <div data-testid="portal-pool-section" className="space-y-3">
                {resumo.canais.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">{t('portal.numbers.noDataCurrent')}</p>
                ) : (
                  resumo.canais.map((c: any) => (
                    <div key={c.channelId} className="bg-white/5 border border-white/10 rounded-3xl p-6">
                      <p className="font-black text-[var(--text-color)] mb-3">{c.channelName}</p>
                      <div className={`grid ${resumo.status === 'fechado' ? 'grid-cols-3' : 'grid-cols-2'} gap-4`}>
                        <div>
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{t('portal.numbers.validViews')}</p>
                          <p className="text-xl font-black text-[var(--text-color)]">{c.points}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{t('portal.numbers.share')}</p>
                          <p className="text-xl font-black text-[var(--text-color)]">{(c.share * 100).toFixed(1)}%</p>
                        </div>
                        {resumo.status === 'fechado' && (
                          <div>
                            <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{t('portal.numbers.amount')}</p>
                            <p className="text-xl font-black text-amber-500">{brl(c.amount ?? 0)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-3xl border border-violet-500/30 bg-violet-500/5 p-6">
                <p className="font-black text-violet-400 mb-1">{t('portal.numbers.superReaderTitle')}</p>
                <p className="text-[11px] text-zinc-500 font-bold mb-4">{t('portal.numbers.superReaderHint')}</p>
                {resumo.superReader.porCanal.length === 0 ? (
                  <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest">{t('portal.numbers.noClosedPeriods')}</p>
                ) : (
                  <div className="space-y-2">
                    {resumo.superReader.porCanal.map((c: any) => (
                      <div key={c.channelId} className="flex items-center justify-between text-sm">
                        <span className="font-bold text-[var(--text-color)]">{c.channelName ?? '—'}</span>
                        <span className="text-zinc-400">{c.apoios} {t('portal.numbers.supportsCount')}</span>
                        <span className="font-black text-violet-400">{formatarValorMonetario(c.autorCents, 'brl')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {aba === 'obras' && (
        <section className="px-8 space-y-4">
          {envioErro && <p className="text-rose-500 text-sm font-bold">{envioErro}</p>}

          <button
            onClick={abrirCriarObra}
            className="w-full py-4 bg-rose-600 text-white font-black rounded-3xl hover:bg-rose-500 transition-all"
          >
            {t('portal.works.newWork')}
          </button>

          {seriesLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
            </div>
          ) : seriesList.length === 0 ? (
            <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-8">{t('portal.works.empty')}</p>
          ) : (
            <div className="space-y-4">
              {seriesList.map(s => {
                const estado = estadoDoDocumento(s);
                const estadoLabel = estado === 'publicada' ? t('portal.works.statusPublished') : estado === 'analise' ? t('portal.works.statusReview') : t('portal.works.statusDraft');
                const badgeColor = estado === 'publicada' ? 'text-emerald-400' : estado === 'analise' ? 'text-amber-500' : 'text-zinc-400';
                return (
                  <div key={s._id} className="bg-white/5 border border-white/10 rounded-3xl p-5">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleSeries(s._id)}>
                      <ImageWithFallback src={s.cover_image} className="w-14 h-14 rounded-xl object-cover shrink-0" alt={s.title} />
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-[var(--text-color)] truncate">{s.title}</p>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${badgeColor}`}>{estadoLabel}</span>
                      </div>
                    </div>

                    {estado === 'rascunho' && (
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => abrirEditarObra(s)}
                          className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                        >
                          {t('portal.works.edit')}
                        </button>
                        <button
                          onClick={() => handleEnviarObra(s._id)}
                          disabled={enviandoId === s._id}
                          className="flex-1 py-2.5 bg-rose-600/10 border border-rose-500/20 text-rose-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-600/20 transition-all disabled:opacity-50"
                        >
                          {t('portal.works.submitWork')}
                        </button>
                      </div>
                    )}

                    {selectedSeriesId === s._id && (
                      <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('portal.works.chapters')}</p>
                          <button
                            onClick={() => abrirCriarEpisodio(s._id)}
                            className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                          >
                            {t('portal.works.newChapter')}
                          </button>
                        </div>

                        {episodesLoading ? (
                          <div className="w-6 h-6 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
                        ) : episodesOfSelected.length === 0 ? (
                          <p className="text-zinc-600 text-xs font-bold">{t('portal.works.noChapters')}</p>
                        ) : (
                          episodesOfSelected.map(ep => {
                            const epEstado = estadoDoDocumento(ep);
                            const epLabel = epEstado === 'publicada' ? t('portal.works.statusPublished') : epEstado === 'analise' ? t('portal.works.statusReview') : t('portal.works.statusDraft');
                            const podeGerenciar = ep.status === 'draft' && !ep.submittedAt;
                            return (
                              <div key={ep._id} className="bg-black/10 dark:bg-white/5 rounded-2xl p-3">
                                <div className="flex items-center justify-between">
                                  <p className="font-bold text-[var(--text-color)] text-sm">{ep.title}</p>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{epLabel}</span>
                                </div>
                                {podeGerenciar && (
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => abrirPanelsModal(ep)}
                                      className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                                    >
                                      {t('portal.works.managePanels')}
                                    </button>
                                    {(ep.panels?.length ?? 0) > 0 && (
                                      <button
                                        onClick={() => handleEnviarEpisodio(ep._id, s._id)}
                                        disabled={enviandoId === ep._id}
                                        className="text-[10px] font-black text-emerald-400 uppercase tracking-widest disabled:opacity-50"
                                      >
                                        {t('portal.works.submitChapter')}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {aba === 'mensagens' && (
        <section className="px-8 space-y-4">
          {mensagensError && <p className="text-rose-500 text-sm font-bold">{mensagensError}</p>}

          {mensagensLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
            </div>
          ) : mensagens.length === 0 ? (
            <p className="text-zinc-600 text-xs font-bold uppercase tracking-widest text-center py-8">{t('portal.messages.empty')}</p>
          ) : (
            <div className="space-y-3">
              {mensagens.map(m => {
                const ref = tituloDaRef(m);
                const éEditor = m.autorTipo === 'editor';
                return (
                  <div
                    key={m._id}
                    data-autor={m.autorTipo}
                    className={`rounded-2xl p-4 max-w-[85%] ${éEditor ? 'bg-white/5 border border-white/10' : 'bg-rose-600/10 border border-rose-500/20 ml-auto'}`}
                  >
                    <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-1">
                      {éEditor ? t('portal.messages.editorLabel') : t('portal.messages.youLabel')}
                    </p>
                    {ref && (
                      <p className="text-xs text-zinc-500 mb-1">{t('portal.messages.about')}: {ref}</p>
                    )}
                    <p className="text-[var(--text-color)] text-sm">{m.texto}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <textarea
              value={novaMensagem}
              onChange={e => setNovaMensagem(e.target.value)}
              placeholder={t('portal.messages.placeholder')}
              rows={2}
              className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm outline-none focus:border-rose-500 transition-colors resize-none"
            />
            <button
              onClick={handleEnviarMensagem}
              disabled={enviandoMensagem || !novaMensagem.trim()}
              aria-label={t('portal.messages.send')}
              className="px-5 bg-rose-600 text-white rounded-2xl font-black hover:bg-rose-500 transition-all disabled:opacity-50 flex items-center justify-center"
            >
              <Send size={16} className="mr-2" /> {t('portal.messages.send')}
            </button>
          </div>
        </section>
      )}

      {/* Seções bloqueadas (spec, "Upload do ilustrador"): CINECOMICS/VERTICALSHOW
          mostradas SEMPRE, com aviso de temporada — sem checkout, sem upload.
          Rótulos SEMPRE de utils/contentTypeLabels.ts (NOME_ABA), nunca hardcode. */}
      <section className="px-8 mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(['hqcine', 'vcine'] as const).map(tipo => (
          <div key={tipo} className="rounded-3xl border border-white/10 bg-white/5 p-6 text-center">
            <Lock size={22} className="mx-auto mb-3 text-zinc-500" />
            <p className="font-black text-[var(--text-color)] mb-1">{NOME_ABA[tipo]}</p>
            <p className="text-xs text-zinc-500 mb-3">{t('portal.locked.title')}</p>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">{t('portal.locked.comingSoon')}</span>
          </div>
        ))}
      </section>

      {/* ─── Modal: criar obra ─── */}
      {showCreateObra && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <form onSubmit={handleCriarObra} className="w-full max-w-md bg-[var(--card-bg,#18181b)] border border-white/10 p-8 rounded-[2.5rem] space-y-4">
            <h2 className="text-xl font-black text-[var(--text-color)]">{t('portal.works.newWork')}</h2>

            <div>
              <label htmlFor="portal-obra-title" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.titleField')}</label>
              <input id="portal-obra-title" required value={obraTitle} onChange={e => setObraTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)]" />
            </div>

            <div>
              <label htmlFor="portal-obra-desc" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.descriptionField')}</label>
              <textarea id="portal-obra-desc" value={obraDescription} onChange={e => setObraDescription(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)] h-20" />
            </div>

            <div>
              <label htmlFor="portal-obra-rating" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.ratingField')}</label>
              <select id="portal-obra-rating" value={obraRating} onChange={e => setObraRating(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)]">
                <option value="">—</option>
                <option value="kids">{t('portal.works.ratingKids')}</option>
                <option value="teen">{t('portal.works.ratingTeen')}</option>
                <option value="young">{t('portal.works.ratingYoung')}</option>
              </select>
            </div>

            <div>
              <label htmlFor="portal-cover-input" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.coverField')}</label>
              <input
                id="portal-cover-input"
                data-testid="portal-cover-input"
                type="file"
                accept="image/*"
                onChange={e => setObraCoverFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-zinc-400"
              />
            </div>

            {createObraError && <p className="text-rose-500 text-sm font-bold">{createObraError}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowCreateObra(false)} className="flex-1 py-3 font-bold text-zinc-500">{t('portal.works.cancel')}</button>
              <button type="submit" disabled={creatingObra} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50">
                {creatingObra ? '...' : t('portal.works.create')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Modal: editar obra ─── */}
      {editingObra && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <form onSubmit={handleSalvarEdicao} className="w-full max-w-md bg-[var(--card-bg,#18181b)] border border-white/10 p-8 rounded-[2.5rem] space-y-4">
            <h2 className="text-xl font-black text-[var(--text-color)]">{editingObra.title}</h2>

            <div>
              <label htmlFor="portal-edit-title" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.titleField')}</label>
              <input id="portal-edit-title" required value={editTitle} onChange={e => setEditTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)]" />
            </div>

            <div>
              <label htmlFor="portal-edit-desc" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.descriptionField')}</label>
              <textarea id="portal-edit-desc" value={editDescription} onChange={e => setEditDescription(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)] h-20" />
            </div>

            <div>
              <label htmlFor="portal-edit-rating" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.ratingField')}</label>
              <select id="portal-edit-rating" value={editRating} onChange={e => setEditRating(e.target.value as any)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)]">
                <option value="">—</option>
                <option value="kids">{t('portal.works.ratingKids')}</option>
                <option value="teen">{t('portal.works.ratingTeen')}</option>
                <option value="young">{t('portal.works.ratingYoung')}</option>
              </select>
            </div>

            {editError && <p className="text-rose-500 text-sm font-bold">{editError}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditingObra(null)} className="flex-1 py-3 font-bold text-zinc-500">{t('portal.works.cancel')}</button>
              <button type="submit" disabled={savingEdit} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50">
                {savingEdit ? '...' : t('portal.works.save')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Modal: criar capítulo ─── */}
      {creatingEpisodioFor && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <form onSubmit={handleCriarEpisodio} className="w-full max-w-md bg-[var(--card-bg,#18181b)] border border-white/10 p-8 rounded-[2.5rem] space-y-4">
            <h2 className="text-xl font-black text-[var(--text-color)]">{t('portal.works.newChapter')}</h2>

            <div>
              <label htmlFor="portal-ep-title" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.titleField')}</label>
              <input id="portal-ep-title" required value={epTitle} onChange={e => setEpTitle(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)]" />
            </div>

            <div>
              <label htmlFor="portal-ep-desc" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.descriptionField')}</label>
              <textarea id="portal-ep-desc" value={epDescription} onChange={e => setEpDescription(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)] h-20" />
            </div>

            <div>
              <label htmlFor="portal-ep-number" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.chapterNumberField')}</label>
              <input id="portal-ep-number" type="number" min={1} required value={epNumber} onChange={e => setEpNumber(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-[var(--text-color)]" />
            </div>

            <div>
              <label htmlFor="portal-thumb-input" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.thumbnailField')}</label>
              <input
                id="portal-thumb-input"
                data-testid="portal-thumb-input"
                type="file"
                accept="image/*"
                onChange={e => setEpThumbFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-zinc-400"
              />
              <p className="text-[10px] text-zinc-600 mt-1">{t('portal.works.thumbnailOptional')}</p>
            </div>

            {createEpisodeError && <p className="text-rose-500 text-sm font-bold">{createEpisodeError}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setCreatingEpisodioFor(null)} className="flex-1 py-3 font-bold text-zinc-500">{t('portal.works.cancel')}</button>
              <button type="submit" disabled={creatingEpisodio} className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50">
                {creatingEpisodio ? '...' : t('portal.works.create')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ─── Modal: painéis do capítulo ─── */}
      {panelsModalFor && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[var(--card-bg,#18181b)] border border-white/10 p-8 rounded-[2.5rem] space-y-4">
            <h2 className="text-xl font-black text-[var(--text-color)]">{panelsModalFor.episode.title}</h2>
            <p className="text-xs text-zinc-500">{t('portal.works.panelsUploadHint')}</p>

            <input
              data-testid="portal-panels-input"
              type="file"
              accept="image/*"
              multiple
              onChange={e => setPendingPanelFiles(Array.from(e.target.files ?? []))}
              className="w-full text-xs text-zinc-400"
            />

            {pendingPanelFiles.length > 0 && (
              <p className="text-xs text-zinc-500">{pendingPanelFiles.length} {t('portal.works.panelsCount')}</p>
            )}

            {panelsError && <p className="text-rose-500 text-sm font-bold">{panelsError}</p>}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setPanelsModalFor(null)} className="flex-1 py-3 font-bold text-zinc-500">{t('portal.works.close')}</button>
              <button
                type="button"
                onClick={handleAddPanels}
                disabled={uploadingPanels || pendingPanelFiles.length === 0}
                className="flex-1 py-3 bg-rose-600 text-white font-black rounded-2xl disabled:opacity-50"
              >
                {uploadingPanels ? '...' : t('portal.works.addPanels')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalEstudio;
