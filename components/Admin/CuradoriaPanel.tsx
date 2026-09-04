import React, { useEffect, useState } from 'react';
import { ShieldAlert, Check, Tag, MessageSquare, EyeOff, X } from 'lucide-react';
import { api } from '../../services/api';
import ImageWithFallback from '../ImageWithFallback';

/**
 * Fila de Revisão da curadoria (Fase 5 Bloco 3, Task 7) — admin, PT fixo
 * (padrão do resto do AdminDashboard, sem i18n). Consome GET /admin/curadoria
 * e as 4 ações de routes/adminCuradoria.js.
 *
 * Regra 8 do Vin: este painel é o ÚNICO lugar onde números aparecem — o
 * curador precisa deles para decidir. Descrições dos leitores chegam
 * anonimizadas (o backend só manda `{motivo, descricao, createdAt}`) e não
 * existe, em lugar nenhum, "quem sinalizou".
 *
 * Regra 1: nada é automático. "Remover" = despublicar (a obra sai do ar, não
 * é apagada) e exige motivo escrito; os textos que vão ao artista trazem o
 * aviso de não colar trechos das sinalizações.
 *
 * `onChange` avisa o AdminDashboard para refazer os badges (mesmo papel do
 * onCountChange do AprovacoesPanel) — o badge "Curadoria N" vem de
 * `curadoria.abertos` em GET /admin/aprovacoes, sem rota nova nem polling.
 */

interface Contagem { S: number; S_grave: number; V: number; limiar: number; semConsumo: number; contasRecentes: number; ipsDistintos: number }
interface ItemCaso {
  casoId: string; status: 'aberto' | 'aguardando_artista' | 'fechado'; prioridade: 'normal' | 'grave'; abertoEm: string;
  obra: { id: string; title: string; cover_image: string | null; content_type: string; content_rating: string | null; tags: string[]; isPublished: boolean } | null;
  canal: { id: string; name: string | null } | null; canalId: string | null;
  gatilho: { tipo: string; S: number; V: number; limiar: number }; resumoMotivos: Record<string, number>; contagem: Contagem;
  descricoes: { motivo: string; descricao: string; createdAt: string }[];
  thread: { autorTipo: 'editor' | 'ilustrador'; texto: string; refId: string | null; createdAt: string }[];
  avisoArtista: 'pendente' | 'enviado' | 'sem_canal' | 'falhou';
  decisao: string | null; motivoDecisao: string | null; observacao: string | null; decididoPor: string | null; decisaoEm: string | null; sinalizacoesAbusivas: boolean;
}

const ROTULO_MOTIVO: Record<string, string> = {
  conteudo_inadequado_faixa: 'Não condiz com a classificação etária', discurso_de_odio: 'Discurso de ódio', spam_ou_enganoso: 'Spam ou conteúdo enganoso',
  direitos_autorais: 'Direitos autorais', conteudo_proibido: 'Conteúdo proibido', outro: 'Outro',
};
const ROTULO_RATING: Record<string, string> = { kids: 'Kids', teen: 'Teen', young: 'Young' };
const ROTULO_DECISAO: Record<string, string> = { aprovar: 'Mantida', reclassificar: 'Reclassificada', solicitar_correcao: 'Correção solicitada', remover: 'Removida (despublicada)' };
const AVISO_TEXTAREA = 'Não cole trechos das sinalizações: o artista não pode identificar quem sinalizou.';

interface CuradoriaPanelProps { onChange?: () => void }

const CuradoriaPanel: React.FC<CuradoriaPanelProps> = ({ onChange }) => {
  const [aba, setAba] = useState<'abertos' | 'fechado'>('abertos');
  const [casos, setCasos] = useState<ItemCaso[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [erroPorCaso, setErroPorCaso] = useState<Record<string, string>>({});
  // Erro de um caso que SUMIU da fila no refetch (409 típico: outro curador
  // decidiu antes). Sem isto a mensagem morreria junto com o card e o Master
  // só veria a fila mudar sozinha.
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [abusoPorCaso, setAbusoPorCaso] = useState<Record<string, boolean>>({});
  const [ratingPorCaso, setRatingPorCaso] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<{ tipo: 'correcao' | 'remover'; caso: ItemCaso } | null>(null);
  const [textoModal, setTextoModal] = useState('');

  const load = async (qual: 'abertos' | 'fechado' = aba): Promise<ItemCaso[]> => {
    setLoading(true);
    try {
      const r = await api.getAdminCuradoria(qual);
      const lista = (r.casos ?? []) as ItemCaso[];
      setCasos(lista);
      return lista;
    } catch {
      setCasos([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setErroGeral(null);
    load(aba);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba]);

  /**
   * Executa uma decisão e SEMPRE recarrega a fila depois — inclusive no erro.
   * O backend reivindica o caso antes de alterar a obra e devolve a
   * reivindicação se a alteração falhar (routes/adminCuradoria.js, fix round
   * 08639a7): depois de qualquer erro o estado na tela pode não ser mais o do
   * servidor. No 409 (outro curador fechou o caso primeiro) o modal fecha —
   * não há mais o que confirmar.
   */
  const executar = async (caso: ItemCaso, fn: () => Promise<any>) => {
    setBusy(caso.casoId);
    setErroGeral(null);
    setErroPorCaso(prev => { const { [caso.casoId]: _x, ...resto } = prev; return resto; });
    try {
      await fn();
      setModal(null); setTextoModal('');
      await load();
      onChange?.();
    } catch (e: any) {
      const mensagem = e?.message || 'Erro ao aplicar a decisão.';
      setErroPorCaso(prev => ({ ...prev, [caso.casoId]: mensagem }));
      if (e?.status === 409) { setModal(null); setTextoModal(''); }
      const restantes = await load();
      if (!restantes.some(c => c.casoId === caso.casoId)) {
        setErroPorCaso(prev => { const { [caso.casoId]: _x, ...resto } = prev; return resto; });
        setErroGeral(mensagem);
      }
      onChange?.();
    } finally {
      setBusy(null);
    }
  };

  const confirmarModal = () => {
    if (!modal) return;
    const texto = textoModal.trim();
    if (!texto) return;
    if (modal.tipo === 'correcao') executar(modal.caso, () => api.curadoriaSolicitarCorrecao(modal.caso.casoId, { texto }));
    else executar(modal.caso, () => api.curadoriaRemover(modal.caso.casoId, { motivo: texto }));
  };

  const abrirModal = (tipo: 'correcao' | 'remover', caso: ItemCaso) => {
    setModal({ tipo, caso });
    setTextoModal('');
  };

  return (
    <div className="max-w-5xl animate-apple">
      <div className="flex items-center gap-4 mb-8 flex-wrap">
        <ShieldAlert size={28} className="text-rose-500" />
        <h2 className="text-3xl font-black tracking-tighter">Curadoria</h2>
        <div className="ml-auto flex gap-2">
          <button onClick={() => setAba('abertos')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${aba === 'abertos' ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400'}`}>Fila</button>
          <button onClick={() => setAba('fechado')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest ${aba === 'fechado' ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400'}`}>Histórico</button>
        </div>
      </div>

      {erroGeral && <p className="text-rose-500 text-xs font-bold mb-4">{erroGeral}</p>}

      {loading && <p className="text-zinc-500 font-bold">Carregando...</p>}
      {!loading && casos.length === 0 && (
        <p className="text-zinc-500 font-bold">{aba === 'abertos' ? 'Nenhum caso aberto. As sinalizações dos leitores só chegam aqui quando atingem o gatilho da obra.' : 'Nenhum caso fechado ainda.'}</p>
      )}

      <div className="space-y-4">
        {casos.map(c => {
          const ocupado = busy === c.casoId;
          const grave = c.prioridade === 'grave';
          const fechado = c.status === 'fechado';
          // A contagem VIVA (semConsumo/contasRecentes/ipsDistintos/S_grave) só
          // existe na fila: no histórico o backend devolve o snapshot do
          // gatilho com esses campos zerados (routes/adminCuradoria.js:92) —
          // mostrá-los ali seria inventar "0 sem consumo".
          const temContagemViva = aba === 'abertos';
          return (
            <div key={c.casoId} data-testid="caso-card" className={`bg-[var(--card-bg)] border rounded-3xl p-6 flex gap-6 ${grave ? 'border-rose-500/60' : 'border-[var(--border-color)]'}`}>
              <div className="w-20 h-28 bg-black rounded-2xl overflow-hidden shrink-0">
                <ImageWithFallback src={c.obra?.cover_image ?? undefined} className="w-full h-full object-cover" alt={c.obra?.title ?? 'Obra removida'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${grave ? 'bg-rose-600 text-white' : 'bg-rose-600/15 text-rose-400'}`}>{grave ? 'GRAVE' : 'Normal'}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{c.status === 'aguardando_artista' ? 'Aguardando artista' : fechado ? 'Fechado' : 'Aberto'}</span>
                  {c.canal?.name && <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{c.canal.name}</span>}
                  {c.obra?.content_rating && <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">{ROTULO_RATING[c.obra.content_rating] ?? c.obra.content_rating}</span>}
                  {c.obra && !c.obra.isPublished && <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Fora do ar</span>}
                  <span className="text-[10px] text-zinc-600 font-bold ml-auto">{new Date(c.abertoEm).toLocaleDateString('pt-BR')}</span>
                </div>
                <h3 className="text-lg font-black text-[var(--text-color)]">{c.obra?.title ?? 'Obra apagada'}</h3>

                <p className="text-xs text-zinc-500 font-bold mt-1">
                  Sinalizações válidas: {c.contagem.S} / {c.contagem.limiar} · {c.contagem.V} visualizações únicas
                  {c.contagem.S_grave > 0 ? ` · ${c.contagem.S_grave} graves` : ''}
                </p>
                {temContagemViva && (
                  <p className="text-[10px] text-zinc-600 font-bold">{c.contagem.semConsumo} sem consumo · {c.contagem.contasRecentes} contas recentes · {c.contagem.ipsDistintos} IPs distintos</p>
                )}
                <p className="text-xs text-zinc-400 mt-2">{Object.entries(c.resumoMotivos || {}).map(([m, q]) => `${ROTULO_MOTIVO[m] ?? m}: ${q}`).join(' · ')}</p>
                {c.avisoArtista !== 'enviado' && <p className="text-[10px] text-amber-500 font-bold mt-1">{c.avisoArtista === 'sem_canal' ? 'Obra sem canal — artista não avisado' : c.avisoArtista === 'falhou' ? 'Aviso ao artista falhou' : 'Aviso pendente'}</p>}

                {c.descricoes.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs font-black text-zinc-400 cursor-pointer">Descrições dos leitores ({c.descricoes.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {c.descricoes.map((d, i) => <li key={i} className="text-xs text-zinc-400"><span className="text-zinc-600">{ROTULO_MOTIVO[d.motivo] ?? d.motivo} — </span>{d.descricao}</li>)}
                    </ul>
                  </details>
                )}

                {c.thread.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs font-black text-zinc-400 cursor-pointer">Conversa com o artista ({c.thread.length})</summary>
                    <ul className="mt-2 space-y-1">
                      {c.thread.map((m, i) => <li key={i} className="text-xs text-zinc-400"><span className="text-zinc-600">{m.autorTipo === 'editor' ? 'Editor' : 'Ilustrador'}: </span>{m.texto}</li>)}
                    </ul>
                  </details>
                )}

                {fechado && (
                  <p className="text-xs text-zinc-400 font-bold mt-3">{ROTULO_DECISAO[c.decisao ?? ''] ?? c.decisao} em {c.decisaoEm ? new Date(c.decisaoEm).toLocaleDateString('pt-BR') : '—'}{c.motivoDecisao ? ` — ${c.motivoDecisao}` : ''}{c.sinalizacoesAbusivas ? ' · sinalizações marcadas como abuso' : ''}</p>
                )}

                {/* Com o modal aberto o erro aparece DENTRO dele (o overlay
                    cobre o card) — nunca nos dois lugares ao mesmo tempo. */}
                {erroPorCaso[c.casoId] && !(modal && modal.caso.casoId === c.casoId) && <p className="text-rose-500 text-xs font-bold mt-3">{erroPorCaso[c.casoId]}</p>}

                {!fechado && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="flex items-center gap-2 text-xs text-zinc-400 font-bold">
                        <input type="checkbox" checked={!!abusoPorCaso[c.casoId]} onChange={e => setAbusoPorCaso(prev => ({ ...prev, [c.casoId]: e.target.checked }))} />
                        Sinalizações abusivas (não contar como revisão de conteúdo)
                      </label>
                      <button onClick={() => executar(c, () => api.curadoriaAprovar(c.casoId, abusoPorCaso[c.casoId] ? { abuso: true } : {}))} disabled={ocupado} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-500 disabled:opacity-40"><Check size={14} /> Aprovar</button>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <select aria-label="Nova classificação" value={ratingPorCaso[c.casoId] ?? ''} onChange={e => setRatingPorCaso(prev => ({ ...prev, [c.casoId]: e.target.value }))} className="bg-black/5 dark:bg-zinc-900 border border-[var(--border-color)] rounded-xl px-3 py-2 text-xs font-bold">
                        <option value="">— nova classificação —</option>
                        <option value="kids">Kids</option><option value="teen">Teen</option><option value="young">Young</option>
                      </select>
                      <button onClick={() => executar(c, () => api.curadoriaReclassificar(c.casoId, { content_rating: ratingPorCaso[c.casoId] as 'kids' | 'teen' | 'young' }))} disabled={ocupado || !ratingPorCaso[c.casoId]} className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-[var(--border-color)] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-40"><Tag size={14} /> Reclassificar</button>
                      {/* Sem canal não há artista a quem pedir correção — o
                          backend responde 400 e nada muda no caso. */}
                      <button onClick={() => abrirModal('correcao', c)} disabled={ocupado || !c.canalId} className="flex items-center gap-2 px-5 py-2.5 bg-white/5 border border-[var(--border-color)] rounded-xl text-xs font-black uppercase tracking-widest hover:bg-white/10 disabled:opacity-40"><MessageSquare size={14} /> Solicitar correção</button>
                      <button onClick={() => abrirModal('remover', c)} disabled={ocupado} className="flex items-center gap-2 px-5 py-2.5 bg-rose-600/20 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-rose-600/30 disabled:opacity-40"><EyeOff size={14} /> Remover</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-10 w-full max-w-lg">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-2xl font-black tracking-tighter">{modal.tipo === 'correcao' ? 'Solicitar correção' : 'Remover (tirar do ar)'} — {modal.caso.obra?.title ?? 'Obra'}</h3>
              <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-white"><X size={24} /></button>
            </div>
            <p className="text-xs text-amber-500 font-bold mb-4">{AVISO_TEXTAREA}</p>
            {modal.tipo === 'remover' && <p className="text-xs text-zinc-400 mb-4">A obra sai do ar, mas não é apagada: episódios e favoritos ficam; o artista pode corrigir e reenviar para aprovação.</p>}
            <textarea
              value={textoModal}
              onChange={e => setTextoModal(e.target.value)}
              maxLength={1500}
              placeholder={modal.tipo === 'correcao' ? 'Descreva o ajuste pedido (o editor aplica alterações em obra publicada)' : 'Motivo da remoção (vai ao artista)'}
              rows={5}
              className="w-full bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 resize-none mb-6"
            />
            {erroPorCaso[modal.caso.casoId] && <p className="text-rose-500 text-xs font-bold mb-4">{erroPorCaso[modal.caso.casoId]}</p>}
            <button onClick={confirmarModal} disabled={!textoModal.trim() || busy === modal.caso.casoId} className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed">
              {modal.tipo === 'correcao' ? 'Enviar pedido' : 'Confirmar remoção'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CuradoriaPanel;
