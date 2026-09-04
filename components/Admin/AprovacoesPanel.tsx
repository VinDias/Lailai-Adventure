import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Check, RotateCcw, X } from 'lucide-react';
import { api } from '../../services/api';
import { TagsChipInput } from './AdminDashboard';
import ImageWithFallback from '../ImageWithFallback';

/**
 * Fila de Aprovação (Fase 5 Bloco 1, Task 10) — admin, sempre em PT (sem
 * i18n, mesmo padrão do resto do AdminDashboard). Consome GET
 * /admin/aprovacoes (shape FLAT — `tipo: 'series'|'episode'`, ver
 * routes/adminPortal.js) e os 3 endpoints de ação. `onCountChange` avisa o
 * AdminDashboard do total atual (badge da aba na sidebar) — chamado no load
 * inicial E depois de qualquer Aprovar/Devolver (spec: "após ação: refetch
 * da fila + badge").
 */

interface ItemAprovacao {
  tipo: 'series' | 'episode';
  id: string;
  title: string;
  description?: string | null;
  cover_image?: string | null;
  thumbnail?: string | null;
  content_rating_sugerida?: string | null;
  content_rating?: string | null;
  genre?: string | null;
  tags?: string[];
  panelCount?: number;
  serie?: { id: string; title: string; isPublished: boolean } | null;
  canal?: { id: string; name: string | null } | null;
  submittedAt: string;
  // Fase 5 Bloco 3, Task 7: obra que a curadoria tirou do ar e o artista
  // reenviou — o Master não pode republicar às cegas. Vem do último caso
  // `decisao:'remover'` da série (routes/adminPortal.js:262); `motivo` é o
  // `motivoDecisao` do caso e pode ser null. Só existe em item de série.
  removidaPelaCuradoria?: { decisaoEm: string; motivo: string | null } | null;
}

const RATING_LABEL: Record<string, string> = { kids: 'Kids', teen: 'Teen', young: 'Young' };

interface AprovacoesPanelProps {
  onCountChange?: (count: number) => void;
  // Fase 5 Bloco 2, Task 6: badge "N não classificadas" do AdminDashboard —
  // GET /admin/aprovacoes devolve `naoClassificadas` ao lado de `itens`;
  // chamado no load inicial E após qualquer Aprovar (uma série publicada sem
  // rating some da fila, mas pode entrar/sair da contagem do badge).
  onNaoClassificadasChange?: (count: number) => void;
}

const AprovacoesPanel: React.FC<AprovacoesPanelProps> = ({ onCountChange, onNaoClassificadasChange }) => {
  const [itens, setItens] = useState<ItemAprovacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [genreDrafts, setGenreDrafts] = useState<Record<string, string>>({});
  const [tagsDrafts, setTagsDrafts] = useState<Record<string, string[]>>({});
  // Classificação etária editada pelo Master (Task 6). Pré-preenchida com
  // content_rating_sugerida QUANDO houver — com sugerida null (obra
  // submetida antes do B2), o seletor abre SEM default (spec, decisão
  // "Classificação oficial"): o Master escolhe ativamente, a sugestão nunca
  // é copiada em silêncio.
  const [ratingDrafts, setRatingDrafts] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [erroPorItem, setErroPorItem] = useState<Record<string, string>>({});
  const [devolverAlvo, setDevolverAlvo] = useState<ItemAprovacao | null>(null);
  const [devolverTexto, setDevolverTexto] = useState('');
  const [devolvendo, setDevolvendo] = useState(false);

  const chave = (it: ItemAprovacao) => `${it.tipo}:${it.id}`;

  // Classificação etária ATUAL do item na tela: o que o Master editou nesta
  // sessão (ratingDrafts) OU o rating já salvo na série OU a sugerida do
  // autor — NUNCA um default arbitrário quando tudo isso for null/ausente
  // (spec, decisão "Classificação oficial": sugerida null → seletor sem
  // default, o Master escolhe ativamente).
  const ratingAtualDe = (it: ItemAprovacao) => {
    const k = chave(it);
    return ratingDrafts[k] ?? it.content_rating ?? it.content_rating_sugerida ?? '';
  };

  const load = async () => {
    setLoading(true);
    try {
      const { itens: lista, naoClassificadas } = await api.getAdminAprovacoes();
      setItens(lista as ItemAprovacao[]);
      onCountChange?.(lista.length);
      onNaoClassificadasChange?.(naoClassificadas ?? 0);
    } catch {
      setItens([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAprovar = async (it: ItemAprovacao) => {
    const k = chave(it);
    setBusyKey(k);
    setErroPorItem(prev => {
      const { [k]: _removido, ...resto } = prev;
      return resto;
    });
    try {
      if (it.tipo === 'series') {
        const genre = (genreDrafts[k] ?? it.genre ?? '').trim();
        const tags = tagsDrafts[k] ?? it.tags ?? [];
        const content_rating = ratingAtualDe(it) as 'kids' | 'teen' | 'young' | '';
        await api.aprovarSerieAdmin(it.id, { genre, tags, content_rating });
      } else {
        await api.aprovarEpisodioAdmin(it.id);
      }
      await load();
    } catch (e: any) {
      setErroPorItem(prev => ({ ...prev, [k]: e?.message || 'Erro ao aprovar.' }));
    } finally {
      setBusyKey(null);
    }
  };

  const abrirDevolver = (it: ItemAprovacao) => {
    setDevolverAlvo(it);
    setDevolverTexto('');
  };

  const confirmarDevolver = async () => {
    if (!devolverAlvo || !devolverTexto.trim()) return;
    setDevolvendo(true);
    try {
      await api.devolverAprovacao(devolverAlvo.tipo, devolverAlvo.id, devolverTexto.trim());
      setDevolverAlvo(null);
      setDevolverTexto('');
      await load();
    } catch (e: any) {
      setErroPorItem(prev => ({ ...prev, [chave(devolverAlvo)]: e?.message || 'Erro ao devolver.' }));
    } finally {
      setDevolvendo(false);
    }
  };

  return (
    <div className="max-w-4xl animate-apple">
      <h2 className="text-4xl font-black tracking-tighter mb-8 flex items-center gap-3">
        <ClipboardCheck size={32} className="text-rose-500" /> Fila de Aprovação
      </h2>

      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
      ) : itens.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-[2.5rem] p-16 text-center">
          <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhum item pendente na fila</p>
        </div>
      ) : (
        <div className="space-y-6">
          {itens.map(it => {
            const k = chave(it);
            const preview = it.tipo === 'series' ? it.cover_image : it.thumbnail;
            const generoAtual = genreDrafts[k] ?? it.genre ?? '';
            const ratingAtual = ratingAtualDe(it);
            // Aprovar exige gênero E classificação etária (Task 6) — os dois
            // ficam obrigatórios antes do POST; o backend também recusa (400
            // "Classificação etária é obrigatória para aprovar"), esta
            // checagem é só UX: evita a viagem de rede previsível.
            const podeAprovarSerie = generoAtual.trim().length > 0 && ratingAtual.trim().length > 0;
            const serieNaoPublicada = it.tipo === 'episode' && it.serie && !it.serie.isPublished;
            const podeAprovar = it.tipo === 'series' ? podeAprovarSerie : !serieNaoPublicada;
            const ocupado = busyKey === k;

            return (
              <div key={k} className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-6 flex gap-6">
                <div className="w-20 h-28 bg-black rounded-2xl overflow-hidden shrink-0">
                  <ImageWithFallback src={preview ?? undefined} className="w-full h-full object-cover" alt={it.title} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-rose-600/15 text-rose-400">
                      {it.tipo === 'series' ? 'Série' : 'Episódio'}
                    </span>
                    {it.canal?.name && <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{it.canal.name}</span>}
                    {it.content_rating_sugerida && (
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                        {RATING_LABEL[it.content_rating_sugerida] ?? it.content_rating_sugerida}
                      </span>
                    )}
                    <span className="text-[10px] text-zinc-600 font-bold ml-auto">{new Date(it.submittedAt).toLocaleDateString('pt-BR')}</span>
                  </div>

                  <h3 className="text-lg font-black text-[var(--text-color)]">{it.title}</h3>
                  {it.removidaPelaCuradoria && (
                    <p className="text-xs text-rose-400 font-bold mt-1">
                      Removida pela curadoria em {new Date(it.removidaPelaCuradoria.decisaoEm).toLocaleDateString('pt-BR')}{it.removidaPelaCuradoria.motivo ? ` — ${it.removidaPelaCuradoria.motivo}` : ''}
                    </p>
                  )}
                  {it.tipo === 'episode' && it.serie && (
                    <p className="text-xs text-zinc-500 font-bold">Série: {it.serie.title} {it.serie.isPublished ? '(publicada)' : '(não publicada)'}</p>
                  )}
                  {it.description && <p className="text-sm text-zinc-500 mt-1 line-clamp-2">{it.description}</p>}
                  {it.tipo === 'episode' && typeof it.panelCount === 'number' && (
                    <p className="text-[10px] text-zinc-600 font-bold mt-1">{it.panelCount} painéis</p>
                  )}

                  {it.tipo === 'series' && (
                    <div className="mt-4 space-y-3">
                      <input
                        type="text"
                        value={generoAtual}
                        onChange={e => setGenreDrafts(prev => ({ ...prev, [k]: e.target.value }))}
                        placeholder="Gênero (obrigatório para aprovar)"
                        className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-2.5 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
                      />
                      <div>
                        <select
                          aria-label="Classificação etária"
                          value={ratingAtual}
                          onChange={e => setRatingDrafts(prev => ({ ...prev, [k]: e.target.value }))}
                          className="w-full bg-black/5 dark:bg-zinc-900 border border-[var(--border-color)] rounded-2xl px-4 py-2.5 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500"
                        >
                          <option value="" className="bg-zinc-900 text-white">— escolha —</option>
                          <option value="kids" className="bg-zinc-900 text-white">Kids</option>
                          <option value="teen" className="bg-zinc-900 text-white">Teen</option>
                          <option value="young" className="bg-zinc-900 text-white">Young</option>
                        </select>
                        {it.content_rating_sugerida && (
                          <p className="text-[10px] text-zinc-500 font-bold mt-1">
                            Autor sugeriu: {RATING_LABEL[it.content_rating_sugerida] ?? it.content_rating_sugerida}
                          </p>
                        )}
                      </div>
                      <TagsChipInput
                        value={tagsDrafts[k] ?? it.tags ?? []}
                        onChange={tags => setTagsDrafts(prev => ({ ...prev, [k]: tags }))}
                      />
                    </div>
                  )}

                  {serieNaoPublicada && (
                    <p className="text-amber-500 text-xs font-bold mt-3">Aprove a série primeiro — este episódio pertence a uma série ainda não publicada.</p>
                  )}
                  {erroPorItem[k] && <p className="text-rose-500 text-xs font-bold mt-3">{erroPorItem[k]}</p>}

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => handleAprovar(it)}
                      disabled={!podeAprovar || ocupado}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-all disabled:opacity-40"
                    >
                      <Check size={14} /> {ocupado ? 'Aprovando...' : 'Aprovar'}
                    </button>
                    <button
                      onClick={() => abrirDevolver(it)}
                      disabled={ocupado}
                      className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-[var(--border-color)] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 transition-all disabled:opacity-40"
                    >
                      <RotateCcw size={14} /> Devolver
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {devolverAlvo && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-10 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-black tracking-tighter">Devolver — {devolverAlvo.title}</h3>
              <button onClick={() => setDevolverAlvo(null)} className="text-zinc-500 hover:text-white transition-all"><X size={24} /></button>
            </div>
            <textarea
              value={devolverTexto}
              onChange={e => setDevolverTexto(e.target.value)}
              placeholder="Motivo da devolução (mensagem para o ilustrador)"
              rows={5}
              className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors resize-none mb-6"
            />
            <button
              onClick={confirmarDevolver}
              disabled={!devolverTexto.trim() || devolvendo}
              className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {devolvendo ? 'Enviando...' : 'Confirmar devolução'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AprovacoesPanel;
