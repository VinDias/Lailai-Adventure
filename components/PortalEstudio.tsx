import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Send } from 'lucide-react';
import { api } from '../services/api';
import type { RevisaoResumo } from '../services/api';
import { useT } from '../contexts/I18nContext';
import type { TFunction } from '../contexts/I18nContext';
import { useCamadaVoltar } from '../utils/pilhaVoltar';
import { NOME_BOTAO } from '../utils/contentTypeLabels';
import { formatarValorMonetario } from '../utils/currency';
import ImageWithFallback from './ImageWithFallback';
import EnvioPastaEpisodio from './EnvioEpisodio/EnvioPastaEpisodio';
import GradePaineis from './EnvioEpisodio/GradePaineis';
import EnvioVideoEpisodio from './EnvioEpisodio/EnvioVideoEpisodio';
// Fonte ÚNICA dos 19 slugs do vocabulário fechado de tags (Fase 5 Bloco 2) —
// MESMO JSON que o backend (utils/tagsVocabulario.js) e o TagsChipInput do
// admin (spec, "O vocabulário": chips sempre pelo IMPORT do JSON, nunca uma
// lista duplicada). Os rótulos aqui vêm do i18n (`tags.<slug>`) — o portal é
// multilíngue, diferente do admin (PT fixo).
import TAGS_VOCABULARIO from '../utils/tagsVocabulario.json';

type Aba = 'numeros' | 'obras' | 'mensagens';

// Frente A, item 9: os tipos de obra que o autor cria no portal. Hi-Qua
// (quadrinhos) recebe painéis; V-Show e Anicom recebem um vídeo por episódio.
// Rótulos SEMPRE de utils/contentTypeLabels.ts, nunca escritos aqui.
type TipoDeObra = 'hiqua' | 'vcine' | 'hqcine';
const TIPOS_DE_OBRA: TipoDeObra[] = ['hiqua', 'vcine', 'hqcine'];
const ehObraDeVideo = (s: { content_type?: string } | null | undefined) => s?.content_type === 'vcine' || s?.content_type === 'hqcine';

const TAGS_MAXIMO = 8;

// Seletor fechado de tags — mesma UX/limite do TagsChipInput do admin
// (components/Admin/AdminDashboard.tsx: 19 chips, toggle on/off, máx 8,
// contador n/8, sem input livre), com rótulos traduzidos via i18n em vez de
// PT fixo. Usado no criar/editar obra do portal.
const PortalTagsChipInput: React.FC<{ value: string[]; onChange: (tags: string[]) => void; t: TFunction }> = ({ value, onChange, t }) => {
  const toggleTag = (slug: string) => {
    if (value.includes(slug)) { onChange(value.filter(tag => tag !== slug)); return; }
    if (value.length >= TAGS_MAXIMO) return;
    onChange([...value, slug]);
  };

  return (
    <div>
      <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.tagsField')}</label>
      <div className="w-full bg-white/5 border border-white/10 rounded-2xl px-3 py-3 flex flex-wrap gap-2">
        {TAGS_VOCABULARIO.map(({ slug }) => {
          const selecionada = value.includes(slug);
          const desabilitada = !selecionada && value.length >= TAGS_MAXIMO;
          return (
            <button
              key={slug}
              type="button"
              aria-pressed={selecionada}
              disabled={desabilitada}
              onClick={() => toggleTag(slug)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${selecionada ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'} disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              {t(`tags.${slug}` as any)}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-600 font-bold mt-1">{value.length}/{TAGS_MAXIMO}</p>
    </div>
  );
};

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
  const [resumoError, setResumoError] = useState<string | null>(null);
  // Incrementado pelo botão "Tentar de novo" (BAIXO 4) — só existe pra forçar
  // o efeito abaixo a rodar de novo sem duplicar a lógica de fetch.
  const [resumoRetryTick, setResumoRetryTick] = useState(0);

  useEffect(() => {
    if (aba !== 'numeros' || loadingInicial || sessionLost) return;
    let cancelado = false;
    setResumoLoading(true);
    setResumoError(null);
    api.getPortalResumo(periodoSelecionado || undefined)
      .then(r => { if (!cancelado) setResumo(r); })
      .catch((err: any) => {
        if (cancelado) return;
        // Erro de verdade: NÃO trava num spinner eterno (bug do BAIXO 4) —
        // limpa o resumo antigo (evita mostrar número desatualizado como se
        // fosse o atual) e liga o estado de erro, que renderiza a mensagem +
        // botão de tentar de novo.
        setResumo(null);
        setResumoError(err?.message || t('portal.numbers.loadError'));
      })
      .finally(() => { if (!cancelado) setResumoLoading(false); });
    return () => { cancelado = true; };
  }, [aba, periodoSelecionado, loadingInicial, sessionLost, resumoRetryTick, t]);

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

  // Carregada no MOUNT da tela (não só ao abrir a aba Obras — BAIXO 5): a
  // aba Mensagens precisa da lista pronta pra resolver o título de uma
  // devolução (refTipo 'series') mesmo que o ilustrador nunca tenha
  // visitado Obras nesta sessão.
  useEffect(() => {
    if (!loadingInicial && !sessionLost) carregarSeries();
  }, [loadingInicial, sessionLost, carregarSeries]);

  // Criar obra
  const [showCreateObra, setShowCreateObra] = useState(false);
  const [obraTitle, setObraTitle] = useState('');
  const [obraDescription, setObraDescription] = useState('');
  const [obraRating, setObraRating] = useState<'' | 'kids' | 'teen' | 'young'>('');
  const [obraTags, setObraTags] = useState<string[]>([]);
  const [obraTipo, setObraTipo] = useState<TipoDeObra>('hiqua');
  const [obraCoverFile, setObraCoverFile] = useState<File | null>(null);
  const [creatingObra, setCreatingObra] = useState(false);
  const [createObraError, setCreateObraError] = useState<string | null>(null);

  useCamadaVoltar(showCreateObra, () => setShowCreateObra(false));

  const abrirCriarObra = () => {
    setObraTitle(''); setObraDescription(''); setObraRating(''); setObraTags([]); setObraCoverFile(null); setObraTipo('hiqua');
    setCreateObraError(null);
    setShowCreateObra(true);
  };

  const handleCriarObra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obraTitle.trim()) return;
    setCreatingObra(true);
    setCreateObraError(null);

    // MEDIO 1b: a criação em si (POST) e o upload/PUT da capa são dois
    // try/catch SEPARADOS de propósito. Se o POST falhar, nada foi criado —
    // o modal continua aberto com o erro, seguro pra tentar de novo (era o
    // comportamento original). Mas se o POST tiver sucesso e SÓ o upload da
    // capa falhar depois, a série JÁ EXISTE no banco: deixar o modal aberto
    // reaproveitando o mesmo botão "Criar" faria um segundo POST e duplicaria
    // a obra. Por isso o modal fecha assim que o POST confirma, e uma falha
    // de capa vira um aviso orientando a completar em Editar — nunca mais
    // uma chamada a createPortalSeries pro mesmo clique.
    let created: any;
    try {
      const payload: any = { title: obraTitle, description: obraDescription, content_rating_sugerida: obraRating || null, tags: obraTags };
      // Hi-Qua é o padrão do servidor: o tipo só vai quando é obra de vídeo.
      if (obraTipo !== 'hiqua') payload.content_type = obraTipo;
      if (canalIdParaEnvio) payload.channelId = canalIdParaEnvio;
      created = await api.createPortalSeries(payload);
    } catch (err: any) {
      setCreateObraError(err?.message || t('portal.errors.generic'));
      setCreatingObra(false);
      return;
    }

    setShowCreateObra(false);
    try {
      if (obraCoverFile) {
        const url = await api.uploadPortalImage(obraCoverFile, created._id);
        await api.updatePortalSeries(created._id, { cover_image: url });
      }
    } catch {
      setEnvioErro(t('portal.works.createdWithoutCover'));
    } finally {
      await carregarSeries();
      setCreatingObra(false);
    }
  };

  // Editar obra (draft não submetida)
  const [editingObra, setEditingObra] = useState<any | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRating, setEditRating] = useState<'' | 'kids' | 'teen' | 'young'>('');
  const [editTags, setEditTags] = useState<string[]>([]);
  // MEDIO 1a: a edição agora também aceita trocar a capa — é o caminho de
  // saída pra uma obra que nasceu sem capa (create-ok-upload-falhou, MEDIO
  // 1b) ou pra quem simplesmente quer trocar a imagem antes de enviar.
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  useCamadaVoltar(!!editingObra, () => setEditingObra(null));

  const abrirEditarObra = (s: any) => {
    setEditTitle(s.title || '');
    setEditDescription(s.description || '');
    setEditRating(s.content_rating_sugerida || '');
    setEditTags(Array.isArray(s.tags) ? s.tags : []);
    setEditCoverFile(null);
    setEditError(null);
    setEditingObra(s);
  };

  const handleSalvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingObra) return;
    setSavingEdit(true);
    setEditError(null);
    try {
      // Sobe a capa nova (se houver) ANTES do PUT, pra mandar title/
      // description/rating/cover_image num único PUT — cover_image já está
      // em PORTAL_SERIES_FIELDS no backend (routes/portal.js), nada novo lá.
      let coverUrl: string | undefined;
      if (editCoverFile) {
        coverUrl = await api.uploadPortalImage(editCoverFile, editingObra._id);
      }
      const payload: any = { title: editTitle, description: editDescription, content_rating_sugerida: editRating || null, tags: editTags };
      if (coverUrl) payload.cover_image = coverUrl;
      await api.updatePortalSeries(editingObra._id, payload);
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

  // Frente A, item 7: edições em andamento dos episódios PUBLICADOS da obra
  // aberta (id do episódio -> resumo). Pedido à parte e que pode falhar sem
  // derrubar a lista de capítulos.
  const [revisoes, setRevisoes] = useState<Record<string, RevisaoResumo>>({});
  const carregarRevisoes = useCallback(async (seriesId: string) => {
    try {
      const r = await api.getPortalRevisoes(seriesId);
      setRevisoes(Object.fromEntries((r?.revisoes ?? []).map(x => [x.episodeId, x])));
    } catch {
      setRevisoes({});
    }
  }, []);

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
    carregarRevisoes(seriesId);
  }, [carregarRevisoes]);

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
  // Idioma do lote (pedido do cliente em 17/09/2026): 'original' cria painéis
  // novos; um idioma grava a camada de diálogo SOBRE painéis que já existem.
  const [panelsLanguage, setPanelsLanguage] = useState<'original' | 'pt' | 'en' | 'es' | 'zh'>('original');
  const [uploadingPanels, setUploadingPanels] = useState(false);
  const [panelsError, setPanelsError] = useState<string | null>(null);
  // Painel alvo de cada arquivo de camada, fixado no PRIMEIRO envio. Na
  // retentativa o arquivo volta para o mesmo painel; sem isso, com falhas
  // salteadas (ex.: #2 e #4), o reenvio caia em #2 e #3 e sobrescrevia o
  // balao bom do #3.
  const alvosDasCamadas = useRef(new Map<File, { lang: string; indice: number }>());

  useCamadaVoltar(!!panelsModalFor, () => setPanelsModalFor(null));

  // Frente A, itens 2 e 4: a pasta inteira do episódio, com conferência e
  // envio em partes (components/EnvioEpisodio). O "Gerenciar painéis" de
  // antes continua para ajustes avulsos.
  const [envioPastaFor, setEnvioPastaFor] = useState<any | null>(null);
  useCamadaVoltar(!!envioPastaFor, () => setEnvioPastaFor(null));

  // Frente A, item 6: grade de painéis do capítulo (a mesma do admin): apagar,
  // trocar a imagem de um painel, trocar ou remover o balão de um idioma.
  // Item 7: em capítulo PUBLICADO (`publicado: true`) a grade mostra e muda a
  // EDIÇÃO do capítulo, nunca o que está no ar: os painéis vêm do servidor
  // (a edição, se já existe; senão os do ar) e as mudanças não entram na
  // lista de capítulos, que continua com a versão publicada.
  const [gradeFor, setGradeFor] = useState<any | null>(null);
  useCamadaVoltar(!!gradeFor, () => setGradeFor(null));

  // Frente A, item 9: envio do vídeo do episódio de V-Show ou Anicom, direto
  // do navegador ao Bunny (components/EnvioEpisodio/EnvioVideoEpisodio).
  const [envioVideoFor, setEnvioVideoFor] = useState<any | null>(null);
  useCamadaVoltar(!!envioVideoFor, () => setEnvioVideoFor(null));
  const mudarEstadoDoVideo = (episodeId: string, estado: string) => {
    setEpisodesOfSelected(prev => prev.map(ep => (ep._id === episodeId ? { ...ep, videoEnvio: { ...(ep.videoEnvio ?? {}), estado } } : ep)));
  };
  // Capítulo com vídeo ainda processando: pergunta ao servidor de tempos em
  // tempos, para o "vídeo pronto" aparecer na lista sem recarregar a tela.
  const processandoIds = episodesOfSelected.filter(ep => ep.videoEnvio?.estado === 'processando').map(ep => ep._id).join(',');
  useEffect(() => {
    if (!processandoIds || envioVideoFor) return;
    const ids = processandoIds.split(',');
    const timer = setInterval(() => {
      ids.forEach(id => {
        api.getEstadoVideoEpisodio(id)
          .then(r => { if (r.estado !== 'processando') mudarEstadoDoVideo(id, r.estado); })
          .catch(() => {});
      });
    }, 10000);
    return () => clearInterval(timer);
  }, [processandoIds, envioVideoFor]);
  const [gradeErro, setGradeErro] = useState<string | null>(null);
  const mudarPaineisDaGrade = (atualizar: (paineis: any[]) => any[]) => {
    if (!gradeFor) return;
    const id = gradeFor._id;
    setGradeFor((prev: any) => (prev && prev._id === id ? { ...prev, panels: atualizar(prev.panels ?? []) } : prev));
    if (gradeFor.publicado) {
      if (selectedSeriesId) carregarRevisoes(selectedSeriesId);
      return;
    }
    setEpisodesOfSelected(prev => prev.map(ep => (ep._id === id ? { ...ep, panels: atualizar(ep.panels ?? []) } : ep)));
  };

  const abrirGradeDoPublicado = async (ep: any) => {
    setGradeErro(null);
    try {
      const r = await api.getPaineisEdicao(ep._id);
      setGradeFor({ ...ep, panels: r.panels ?? [], publicado: true, somenteLeitura: !r.podeEditar });
    } catch (err: any) {
      setGradeErro(err?.message || t('portal.errors.generic'));
    }
  };

  const [revisaoOcupada, setRevisaoOcupada] = useState<string | null>(null);
  const handleEnviarRevisao = async (episodeId: string) => {
    setGradeErro(null);
    setRevisaoOcupada(episodeId);
    try {
      const r = await api.enviarRevisaoEpisodio(episodeId);
      setRevisoes(prev => ({ ...prev, [episodeId]: r.revisao }));
    } catch (err: any) {
      setGradeErro(err?.message || t('portal.errors.generic'));
    } finally {
      setRevisaoOcupada(null);
    }
  };
  const handleDescartarRevisao = async (episodeId: string) => {
    if (!confirm(t('revisao.confirmarDescartar'))) return;
    setGradeErro(null);
    setRevisaoOcupada(episodeId);
    try {
      await api.descartarRevisaoEpisodio(episodeId);
      setRevisoes(prev => { const { [episodeId]: _fora, ...resto } = prev; return resto; });
    } catch (err: any) {
      setGradeErro(err?.message || t('portal.errors.generic'));
    } finally {
      setRevisaoOcupada(null);
    }
  };

  const abrirPanelsModal = (ep: any) => {
    if (!selectedSeriesId) return;
    setPendingPanelFiles([]);
    setPanelsError(null);
    setPanelsLanguage('original');
    alvosDasCamadas.current = new Map();
    setPanelsModalFor({ episode: ep, seriesId: selectedSeriesId });
  };

  /**
   * Primeiro painel sem camada no idioma escolhido — é daí que o próximo lote
   * de diálogos começa. Mesma regra do painel do Master: sem isso, cada lote
   * voltaria ao painel #1 e sobrescreveria o anterior.
   */
  const primeiroPainelSemCamada = (lang: string) => {
    const paineis = panelsModalFor?.episode?.panels ?? [];
    const i = paineis.findIndex((p: any) => !(p.translationLayers ?? []).some((l: any) => l.language === lang));
    return i === -1 ? 0 : i;
  };

  const handleAddPanels = async () => {
    if (!panelsModalFor || pendingPanelFiles.length === 0) return;

    const paineisExistentes = panelsModalFor.episode.panels ?? [];
    const ehCamada = panelsLanguage !== 'original';
    // Alvo de cada arquivo: retentativa volta ao painel do primeiro envio;
    // arquivo novo vai a partir do primeiro painel sem camada (depois dos que
    // estao sendo reenviados).
    const alvoGuardado = (f: File) => {
      const a = alvosDasCamadas.current.get(f);
      return a && a.lang === panelsLanguage ? a.indice : undefined;
    };
    const reservados = ehCamada ? pendingPanelFiles.map(alvoGuardado).filter((i): i is number => i !== undefined) : [];
    const novos = ehCamada ? pendingPanelFiles.filter(f => alvoGuardado(f) === undefined).length : pendingPanelFiles.length;
    let base = 0;
    if (ehCamada) {
      const depois = reservados.length > 0 ? Math.max(...reservados) + 1 : 0;
      const i = paineisExistentes.findIndex((p: any, idx: number) =>
        idx >= depois && !(p.translationLayers ?? []).some((l: any) => l.language === panelsLanguage));
      base = i === -1 ? (reservados.length > 0 ? paineisExistentes.length : primeiroPainelSemCamada(panelsLanguage)) : i;
    }
    if (ehCamada) {
      if (paineisExistentes.length === 0) {
        setPanelsError(t('portal.works.panelsLayerNone'));
        return;
      }
      if (novos > paineisExistentes.length - base) {
        setPanelsError(t('portal.works.panelsLayerTooMany'));
        return;
      }
    }
    let k = 0;
    const alvos = pendingPanelFiles.map(f => (ehCamada ? alvoGuardado(f) ?? base + k++ : 0));
    if (ehCamada) pendingPanelFiles.forEach((f, i) => alvosDasCamadas.current.set(f, { lang: panelsLanguage, indice: alvos[i] }));

    setUploadingPanels(true);
    setPanelsError(null);
    try {
      const result = await api.uploadPortalImagesBatch(pendingPanelFiles, panelsModalFor.seriesId);

      if (ehCamada) {
        // Camada: um pedido por painel, e o resultado de CADA um conta
        // (Promise.all escondia os que deram certo quando um falhava, e o
        // arquivo que falhou nao voltava para a fila). Indice = alvo fixado
        // acima, nunca a posicao entre os que deram certo.
        const gravados = await Promise.allSettled(
          result.results.map((r, i) =>
            r.success && r.url
              ? api.addPortalPainelTraducao(panelsModalFor.episode._id, alvos[i], panelsLanguage, r.url)
              : Promise.reject(new Error(r.error || 'upload'))
          )
        );
        const paineisAtualizados = [...paineisExistentes];
        const falharam: File[] = [];
        const paineisQueFalharam: number[] = [];
        pendingPanelFiles.forEach((f, i) => {
          const g = gravados[i];
          if (g && g.status === 'fulfilled' && g.value?.panel) {
            paineisAtualizados[alvos[i]] = g.value.panel;
            alvosDasCamadas.current.delete(f);
          } else {
            falharam.push(f);
            paineisQueFalharam.push(alvos[i] + 1);
          }
        });
        const episodeAtualizado = { ...panelsModalFor.episode, panels: paineisAtualizados };
        setEpisodesOfSelected(prev => prev.map(ep => (ep._id === panelsModalFor.episode._id ? episodeAtualizado : ep)));
        setPendingPanelFiles(falharam);
        setPanelsModalFor({ ...panelsModalFor, episode: episodeAtualizado });
        if (falharam.length > 0) {
          const ok = pendingPanelFiles.length - falharam.length;
          setPanelsError(`${ok}/${pendingPanelFiles.length} ${t('portal.works.panelsPartialLabel')} (#${paineisQueFalharam.join(', #')})`);
        }
        return;
      }

      const successUrls = result.results.filter(r => r.success && r.url).map(r => r.url as string);
      const existingCount = panelsModalFor.episode.panels?.length ?? 0;
      const panels = successUrls.map((url, i) => ({ image_url: url, order: existingCount + i + 1 }));

      let episodeAtualizado = panelsModalFor.episode;
      if (panels.length > 0) {
        const resp = await api.addPortalPaineis(panelsModalFor.episode._id, panels);
        episodeAtualizado = resp.episode;
        setEpisodesOfSelected(prev => prev.map(ep => (ep._id === panelsModalFor.episode._id ? episodeAtualizado : ep)));
      }

      if (result.failCount > 0) {
        // BAIXO 3 — sucesso PARCIAL não fecha como se fosse sucesso total: os
        // que falharam nunca foram gravados no episódio. Mantém o modal
        // aberto, com aviso claro, e SÓ os arquivos que falharam continuam
        // pendentes (prontos pra tentar de novo sem reabrir o seletor do SO —
        // são os mesmos objetos File, ainda válidos em memória).
        const falharam = pendingPanelFiles.filter((_, i) => !result.results[i]?.success);
        setPendingPanelFiles(falharam);
        setPanelsModalFor({ ...panelsModalFor, episode: episodeAtualizado });
        setPanelsError(`${result.successCount}/${result.total} ${t('portal.works.panelsPartialLabel')}`);
      } else {
        setPanelsModalFor(null);
      }
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

  // carregarMensagens muda de referência quando canalIdParaEnvio muda (deps
  // do useCallback acima) — então trocar o canal no seletor multi-canal
  // (MEDIO 2) refaz a busca automaticamente mesmo com a aba Mensagens já
  // aberta, sem precisar de um efeito à parte.
  useEffect(() => {
    if (aba === 'mensagens' && !loadingInicial && !sessionLost) carregarMensagens();
  }, [aba, loadingInicial, sessionLost, carregarMensagens]);

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

  // refTipo 'series': resolve o título de verdade contra seriesList (agora
  // carregada no mount — BAIXO 5a). refTipo 'episode': sem rota nova pra
  // buscar o capítulo específico, mostra um rótulo genérico i18n — o texto
  // da devolução escrito pelo editor já descreve do que se trata.
  const tituloDaRef = (m: any): string | null => {
    if (m.refTipo === 'series' && m.refId) {
      const serie = seriesList.find(s => s._id === m.refId);
      return serie ? serie.title : null;
    }
    if (m.refTipo === 'episode') {
      return t('portal.messages.genericChapter');
    }
    return null;
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

      {/* MEDIO 2: seletor de canal, só quando o usuário tem mais de um canal
          ativo — com 1 canal só, nada muda (o backend já assume o único
          canal quando channelId/canalId não é enviado). Afeta a criação de
          obra (channelId no POST) e a thread de mensagens (canalId no GET/
          POST) — a lista de Obras continua mostrando todos os canais, com o
          nome do canal indicado por card (abaixo). */}
      {multiCanal && (
        <div className="flex items-center gap-3 px-8 mb-6">
          <label htmlFor="portal-channel-select" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
            {t('portal.channelLabel')}
          </label>
          <select
            id="portal-channel-select"
            value={canalSelecionadoId ?? ''}
            onChange={e => setCanalSelecionadoId(e.target.value)}
            className="bg-[rgba(128,128,128,0.1)] border border-[rgba(128,128,128,0.35)] rounded-2xl px-4 py-2 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
          >
            {canais!.map(c => (
              <option key={c.channelId} value={c.channelId}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

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

          {resumoLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
            </div>
          ) : resumoError ? (
            <div className="text-center py-10 space-y-4">
              <p className="text-rose-500 text-sm font-bold">{resumoError}</p>
              <button
                onClick={() => setResumoRetryTick(v => v + 1)}
                className="px-6 py-3 bg-white/5 border border-white/10 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all"
              >
                {t('portal.numbers.retry')}
              </button>
            </div>
          ) : !resumo ? null : (
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
                // MEDIO 2: com >1 canal, a lista mistura obras de todos —
                // mostra de qual canal é cada uma (nome pequeno no card).
                const canalDaObra = multiCanal ? canais!.find(c => c.channelId === String(s.channelId)) : null;
                return (
                  <div key={s._id} data-testid={`portal-obra-card-${s._id}`} className="bg-white/5 border border-white/10 rounded-3xl p-5">
                    <div className="flex items-center gap-4 cursor-pointer" onClick={() => toggleSeries(s._id)}>
                      <ImageWithFallback src={s.cover_image} className="w-14 h-14 rounded-xl object-cover shrink-0" alt={s.title} />
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-[var(--text-color)] truncate">{s.title}</p>
                        <span className={`text-[10px] font-black uppercase tracking-widest ${badgeColor}`}>{estadoLabel}</span>
                        {ehObraDeVideo(s) && (
                          <span data-testid={`portal-obra-tipo-${s._id}`} className="ml-2 text-[10px] font-black uppercase tracking-widest text-sky-400">{NOME_BOTAO[s.content_type]}</span>
                        )}
                        {canalDaObra && (
                          <span className="block text-[10px] text-zinc-500 font-bold mt-0.5">{canalDaObra.name}</span>
                        )}
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

                        {gradeErro && <p role="alert" className="text-rose-500 text-xs font-bold">{gradeErro}</p>}
                        {episodesLoading ? (
                          <div className="w-6 h-6 border-2 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mx-auto" />
                        ) : episodesOfSelected.length === 0 ? (
                          <p className="text-zinc-600 text-xs font-bold">{t('portal.works.noChapters')}</p>
                        ) : (
                          episodesOfSelected.map(ep => {
                            const epEstado = estadoDoDocumento(ep);
                            const epLabel = epEstado === 'publicada' ? t('portal.works.statusPublished') : epEstado === 'analise' ? t('portal.works.statusReview') : t('portal.works.statusDraft');
                            const podeGerenciar = ep.status === 'draft' && !ep.submittedAt;
                            // Item 7: capítulo publicado se edita por meio de uma
                            // edição que o moderador aprova.
                            const publicado = ep.status === 'published';
                            // Item 9: obra de vídeo. O capítulo recebe um vídeo, não painéis.
                            const deVideo = ehObraDeVideo(s);
                            const estadoVideo: string = ep.videoEnvio?.estado ?? (ep.bunnyVideoId || ep.video_url ? 'pronto' : 'sem-video');
                            const revisao = publicado && !deVideo ? revisoes[ep._id] : undefined;
                            const revisaoNaFila = revisao?.status === 'enviada';
                            return (
                              <div key={ep._id} className="bg-black/10 dark:bg-white/5 rounded-2xl p-3">
                                <div className="flex items-center justify-between">
                                  <p className="font-bold text-[var(--text-color)] text-sm">{ep.title}</p>
                                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{epLabel}</span>
                                </div>
                                {deVideo && (
                                  <div data-testid={`portal-video-${ep._id}`} className="mt-2 space-y-1">
                                    <p className={`text-[10px] font-black uppercase tracking-widest ${estadoVideo === 'pronto' ? 'text-emerald-400' : estadoVideo === 'erro' ? 'text-rose-500' : estadoVideo === 'sem-video' ? 'text-zinc-500' : 'text-amber-500'}`}>
                                      {estadoVideo === 'pronto' ? t('video.estadoPronto')
                                        : estadoVideo === 'processando' ? t('video.estadoProcessando')
                                        : estadoVideo === 'enviando' ? t('video.estadoEnviando')
                                        : estadoVideo === 'erro' ? t('video.estadoErro')
                                        : t('video.estadoSemVideo')}
                                    </p>
                                    {podeGerenciar && (
                                      <div className="flex gap-2 flex-wrap">
                                        <button
                                          onClick={() => setEnvioVideoFor(ep)}
                                          className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                                        >
                                          {estadoVideo === 'sem-video' || estadoVideo === 'enviando' ? t('video.botao') : t('video.botaoTrocar')}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                                {publicado && !deVideo && (
                                  <div data-testid={`portal-revisao-${ep._id}`} className="mt-2 space-y-1">
                                    {revisao && (
                                      <p className={`text-[10px] font-black uppercase tracking-widest ${revisaoNaFila ? 'text-amber-500' : 'text-sky-400'}`}>
                                        {revisaoNaFila ? t('revisao.emAnalise') : revisao.devolucao ? t('revisao.devolvida') : t('revisao.rascunho')}
                                        {' · '}{revisao.totalPaineis} {t('revisao.paineis')}
                                      </p>
                                    )}
                                    {revisao?.devolucao && !revisaoNaFila && (
                                      <p className="text-xs text-rose-400 font-bold">{t('revisao.motivo')}: {revisao.devolucao.motivo}</p>
                                    )}
                                    <div className="flex gap-2 flex-wrap">
                                      {!revisaoNaFila && (
                                        <button
                                          onClick={() => setEnvioPastaFor({ ...ep, publicado: true })}
                                          className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                                        >
                                          {t('envio.botao')}
                                        </button>
                                      )}
                                      {((ep.panels?.length ?? 0) > 0 || revisao) && (
                                        <button
                                          onClick={() => abrirGradeDoPublicado(ep)}
                                          className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                                        >
                                          {t('grade.botao')}
                                        </button>
                                      )}
                                      {revisao && !revisaoNaFila && (
                                        <>
                                          <button
                                            onClick={() => handleEnviarRevisao(ep._id)}
                                            disabled={revisaoOcupada === ep._id}
                                            className="text-[10px] font-black text-emerald-400 uppercase tracking-widest disabled:opacity-50"
                                          >
                                            {t('revisao.enviar')}
                                          </button>
                                          <button
                                            onClick={() => handleDescartarRevisao(ep._id)}
                                            disabled={revisaoOcupada === ep._id}
                                            className="text-[10px] font-black text-zinc-500 uppercase tracking-widest disabled:opacity-50"
                                          >
                                            {t('revisao.descartar')}
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {podeGerenciar && !deVideo && (
                                  <div className="flex gap-2 mt-2">
                                    <button
                                      onClick={() => setEnvioPastaFor(ep)}
                                      className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                                    >
                                      {t('envio.botao')}
                                    </button>
                                    <button
                                      onClick={() => abrirPanelsModal(ep)}
                                      className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                                    >
                                      {t('portal.works.managePanels')}
                                    </button>
                                    {(ep.panels?.length ?? 0) > 0 && (
                                      <button
                                        onClick={() => setGradeFor(ep)}
                                        className="text-[10px] font-black text-rose-500 uppercase tracking-widest"
                                      >
                                        {t('grade.botao')}
                                      </button>
                                    )}
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

      {/* ─── Modal: criar obra ─── */}
      {showCreateObra && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <form onSubmit={handleCriarObra} className="w-full max-w-md bg-[var(--card-bg,#18181b)] border border-white/10 p-8 rounded-[2.5rem] space-y-4">
            <h2 className="text-xl font-black text-[var(--text-color)]">{t('portal.works.newWork')}</h2>

            {/* Item 9: tipo da obra. Hi-Qua (quadrinhos) é o padrão; V-Show e
                Anicom são obras de vídeo. O tipo não muda depois de criada. */}
            <div>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{t('portal.works.typeField')}</p>
              <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label={t('portal.works.typeField')}>
                {TIPOS_DE_OBRA.map(tipo => (
                  <button
                    key={tipo}
                    type="button"
                    role="radio"
                    aria-checked={obraTipo === tipo}
                    data-testid={`portal-obra-tipo-${tipo}`}
                    onClick={() => setObraTipo(tipo)}
                    className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${obraTipo === tipo ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
                  >
                    {NOME_BOTAO[tipo]}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">{obraTipo === 'hiqua' ? t('portal.works.typeHintComic') : t('portal.works.typeHintVideo')}</p>
            </div>

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

            <PortalTagsChipInput value={obraTags} onChange={setObraTags} t={t} />

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

            <PortalTagsChipInput value={editTags} onChange={setEditTags} t={t} />

            <div>
              <label htmlFor="portal-edit-cover-input" className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-1">{t('portal.works.coverField')}</label>
              {editingObra.cover_image && (
                <ImageWithFallback data-testid="portal-edit-cover-preview" src={editingObra.cover_image} className="w-20 h-20 rounded-xl object-cover mb-2" alt={editingObra.title} />
              )}
              <input
                id="portal-edit-cover-input"
                data-testid="portal-edit-cover-input"
                type="file"
                accept="image/*"
                onChange={e => setEditCoverFile(e.target.files?.[0] ?? null)}
                className="w-full text-xs text-zinc-400"
              />
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

      {envioPastaFor && (
        <EnvioPastaEpisodio
          episode={envioPastaFor}
          onFechar={() => setEnvioPastaFor(null)}
          avisoRevisao={!!envioPastaFor.publicado}
          onConcluido={(atualizado: any) => {
            // Capítulo publicado (item 7): o servidor devolve o capítulo como
            // está NO AR (não mudou); o que mudou foi a edição dele.
            if (selectedSeriesId) carregarRevisoes(selectedSeriesId);
            if (!atualizado?._id) return;
            setEpisodesOfSelected(prev => prev.map(ep => (ep._id === atualizado._id ? { ...ep, ...atualizado } : ep)));
          }}
        />
      )}

      {envioVideoFor && (
        <EnvioVideoEpisodio
          episode={envioVideoFor}
          onFechar={() => setEnvioVideoFor(null)}
          onEstado={(estado) => mudarEstadoDoVideo(envioVideoFor._id, estado)}
        />
      )}

      {/* ─── Modal: grade de painéis (frente A, item 6) ─── */}
      {gradeFor && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-[var(--card-bg,#18181b)] border border-white/10 p-6 rounded-[2.5rem] space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{t('grade.titulo')}</p>
                <h2 className="text-xl font-black text-[var(--text-color)]">{gradeFor.title}</h2>
                <p className="text-xs text-zinc-500 mt-1">{t('grade.dica')}</p>
                {gradeFor.publicado && <p data-testid="grade-aviso-revisao" className="text-xs font-bold text-amber-400 mt-2">{gradeFor.somenteLeitura ? t('revisao.emAnalise') : t('revisao.aviso')}</p>}
              </div>
              <button type="button" onClick={() => setGradeFor(null)} className="shrink-0 py-2 px-4 font-bold text-zinc-500">{t('portal.works.close')}</button>
            </div>
            <GradePaineis episodeId={gradeFor._id} panels={gradeFor.panels ?? []} onMudar={mudarPaineisDaGrade} somenteLeitura={!!gradeFor.somenteLeitura} />
          </div>
        </div>
      )}

      {/* ─── Modal: painéis do capítulo ─── */}
      {panelsModalFor && (
        <div className="fixed inset-0 z-[1200] bg-black/70 backdrop-blur-md flex items-center justify-center p-6">
          <div className="w-full max-w-md bg-[var(--card-bg,#18181b)] border border-white/10 p-8 rounded-[2.5rem] space-y-4">
            <h2 className="text-xl font-black text-[var(--text-color)]">{panelsModalFor.episode.title}</h2>
            <p className="text-xs text-zinc-500">{t('portal.works.panelsUploadHint')}</p>

            {/* Idioma do lote: original cria painéis; um idioma sobe a camada
                de diálogo sobre os painéis existentes, na ordem enviada. */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest shrink-0">{t('portal.works.panelsLanguage')}:</span>
              {([
                { value: 'original', label: t('portal.works.panelsLanguageBase') },
                { value: 'pt', label: 'PT' },
                { value: 'en', label: 'EN' },
                { value: 'es', label: 'ES' },
                { value: 'zh', label: 'ZH' },
              ] as const).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setPanelsLanguage(opt.value); setPanelsError(null); }}
                  aria-pressed={panelsLanguage === opt.value}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${panelsLanguage === opt.value ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {panelsLanguage !== 'original' && (
              <p className="text-[10px] text-amber-400 font-bold">
                {t('portal.works.panelsLayerFrom')} #{primeiroPainelSemCamada(panelsLanguage) + 1} ·{' '}
                {(panelsModalFor.episode.panels?.length ?? 0) - primeiroPainelSemCamada(panelsLanguage)} {t('portal.works.panelsLayerRemaining')}
              </p>
            )}

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
                {uploadingPanels ? '...' : (panelsLanguage === 'original' ? t('portal.works.addPanels') : t('portal.works.addLayers'))}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalEstudio;
