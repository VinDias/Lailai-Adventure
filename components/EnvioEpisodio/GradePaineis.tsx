import React, { useState } from 'react';
import { Trash2, ImagePlus, Upload, X } from 'lucide-react';
import { api } from '../../services/api';
import { useT } from '../../contexts/I18nContext';

/**
 * Grade dos painéis de um episódio (Fase 7, frente A, item 6). UM componente
 * só para o Meu Estúdio (autor) e o Gerenciar Conteúdo (admin); saiu de dentro
 * do AdminDashboard, que tinha a única grade do site.
 *
 * O que dá para fazer: apagar um painel ou vários de uma vez; trocar a imagem
 * de um painel no lugar (posição e balões ficam); trocar ou remover o balão de
 * um idioma. Cada ação é um pedido às rotas de /api/edicao-paineis, que gravam
 * só o painel mexido, achado pelo `_id` (nunca a lista inteira nem o índice:
 * ver services/edicaoPaineisService.js). O arquivo que sai é apagado do Bunny
 * pelo servidor.
 *
 * `onMudar` recebe uma FUNÇÃO (painéis atuais -> painéis novos), não a lista:
 * duas ações que terminam juntas não podem uma apagar o resultado da outra na
 * tela.
 *
 * `permitirUrl` (só admin): além do arquivo, o balão pode ser um link colado,
 * como o painel do Master sempre permitiu (rota antiga, por índice).
 */
export type Painel = {
  _id?: string;
  image_url: string;
  order?: number;
  translationLayers?: Array<{ language: string; imageUrl: string }>;
};

interface GradePaineisProps {
  episodeId: string;
  panels: Painel[];
  onMudar: (atualizar: (paineis: Painel[]) => Painel[]) => void;
  permitirUrl?: boolean;
  /** Episódio que o autor só pode ver (em análise): sem nenhum botão de ação. */
  somenteLeitura?: boolean;
}

const IDIOMAS = ['pt', 'en', 'es', 'zh'] as const;
type Idioma = typeof IDIOMAS[number];

const GradePaineis: React.FC<GradePaineisProps> = ({ episodeId, panels, onMudar, permitirUrl = false, somenteLeitura = false }) => {
  const t = useT();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  // Chave do que está em andamento: "apagar", "img:<id>", "balao:<id>:<idioma>".
  const [ocupado, setOcupado] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [balaoAberto, setBalaoAberto] = useState<{ indice: number; idioma: Idioma } | null>(null);
  const [urlBalao, setUrlBalao] = useState('');

  // Seleção por posição enquanto o painel não tem _id (episódio antigo); a
  // ação busca os _id no servidor antes de agir.
  const chave = (p: Painel, i: number) => (p._id ? String(p._id) : `#${i}`);
  const marcar = (k: string, ligado: boolean) => setOcupado(prev => {
    const n = new Set(prev);
    if (ligado) n.add(k); else n.delete(k);
    return n;
  });

  /**
   * Devolve os painéis com _id. Painel antigo gravado fora do sistema pode não
   * ter; o GET da edição dá um _id a cada um e devolve a lista.
   */
  const comIds = async (): Promise<Painel[]> => {
    if (panels.every(p => p._id)) return panels;
    const r = await api.getPaineisEdicao(episodeId);
    onMudar(() => r.panels);
    return r.panels;
  };

  const executar = async (k: string, acao: () => Promise<void>) => {
    marcar(k, true);
    setErro(null);
    try {
      await acao();
    } catch (e: any) {
      setErro(e?.message || t('grade.erro'));
    } finally {
      marcar(k, false);
    }
  };

  const apagar = (indices: number[]) => {
    if (indices.length === 0) return;
    if (!confirm(t('grade.confirmarExcluir').replace('{n}', String(indices.length)))) return;
    executar('apagar', async () => {
      const atuais = await comIds();
      const ids = indices.map(i => atuais[i]?._id).filter(Boolean) as string[];
      const r = await api.apagarPaineisEdicao(episodeId, ids);
      const fora = new Set(r.removidos);
      onMudar(lista => lista.filter(p => !fora.has(String(p._id))));
      setSelecionados(new Set());
    });
  };

  const trocarImagem = (indice: number, arquivo: File | undefined) => {
    if (!arquivo) return;
    executar(`img:${indice}`, async () => {
      const id = (await comIds())[indice]?._id as string;
      const r = await api.trocarImagemPainel(episodeId, id, arquivo);
      onMudar(lista => lista.map(p => (String(p._id) === id ? r.panel : p)));
    });
  };

  const trocarBalao = (indice: number, idioma: Idioma, arquivo: File | undefined) => {
    if (!arquivo) return;
    executar(`balao:${indice}:${idioma}`, async () => {
      const id = (await comIds())[indice]?._id as string;
      const r = await api.trocarBalaoPainel(episodeId, id, idioma, arquivo);
      onMudar(lista => lista.map(p => (String(p._id) === id ? r.panel : p)));
    });
  };

  const removerBalao = (indice: number, idioma: Idioma) => {
    if (!confirm(t('grade.confirmarRemoverBalao').replace('{idioma}', idioma.toUpperCase()).replace('{n}', String(indice + 1)))) return;
    executar(`balao:${indice}:${idioma}`, async () => {
      const id = (await comIds())[indice]?._id as string;
      const r = await api.removerBalaoPainel(episodeId, id, idioma);
      onMudar(lista => lista.map(p => (String(p._id) === id ? r.panel : p)));
    });
  };

  // Só admin: balão por link colado (rota antiga do painel do Master, por índice).
  const salvarUrl = (indice: number, idioma: Idioma) => {
    const url = urlBalao.trim();
    if (!url) return;
    executar(`balao:${indice}:${idioma}`, async () => {
      const r = await api.updatePanelTranslation(episodeId, indice, idioma, url);
      onMudar(lista => lista.map((p, i) => {
        if (i !== indice) return p;
        if (r?.panel) return r.panel;
        const outros = (p.translationLayers ?? []).filter(c => c.language !== idioma);
        return { ...p, translationLayers: [...outros, { language: idioma, imageUrl: url }] };
      }));
      setUrlBalao('');
    });
  };

  if (panels.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border-color)] p-16 text-center">
        <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">{t('grade.vazio')}</p>
      </div>
    );
  }

  const todasAsChaves = panels.map(chave);
  const todosSelecionados = selecionados.size === panels.length;
  const indicesSelecionados = panels.map((p, i) => (selecionados.has(chave(p, i)) ? i : -1)).filter(i => i >= 0);
  const apagando = ocupado.has('apagar');
  const painelDoBalao = balaoAberto ? panels[balaoAberto.indice] : null;
  const balaoAtual = balaoAberto && painelDoBalao
    ? (painelDoBalao.translationLayers ?? []).find(c => c.language === balaoAberto.idioma) ?? null
    : null;
  const balaoOcupado = balaoAberto ? ocupado.has(`balao:${balaoAberto.indice}:${balaoAberto.idioma}`) : false;

  return (
    <div data-testid="grade-paineis">
      {erro && <p role="alert" className="mb-3 text-xs font-bold text-rose-400">{erro}</p>}

      {!somenteLeitura && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelecionados(todosSelecionados ? new Set() : new Set(todasAsChaves))}
              className="text-[10px] font-black text-zinc-500 hover:text-white uppercase tracking-widest transition-colors"
            >
              {todosSelecionados ? t('grade.desselecionarTodos') : t('grade.selecionarTodos')}
            </button>
            {selecionados.size > 0 && (
              <span className="text-[10px] font-black text-zinc-400">{selecionados.size} {t('grade.selecionados')}</span>
            )}
          </div>
          {selecionados.size > 0 && (
            <button
              type="button"
              onClick={() => apagar(indicesSelecionados)}
              disabled={apagando}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600/20 border border-rose-500/30 rounded-xl text-rose-400 text-[11px] font-black uppercase tracking-widest hover:bg-rose-600/40 transition-all disabled:opacity-50"
            >
              {apagando ? <div className="w-3 h-3 border-2 border-rose-400/30 border-t-rose-400 rounded-full animate-spin" /> : <Trash2 size={13} />}
              {t('grade.excluir')} {selecionados.size}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {panels.map((panel, idx) => {
          const k = chave(panel, idx);
          const marcado = selecionados.has(k);
          const idiomasDoPainel = (panel.translationLayers ?? []).map(c => c.language);
          const trocando = ocupado.has(`img:${idx}`);
          return (
            <div
              key={k}
              data-testid="grade-painel"
              className={`relative group rounded-2xl overflow-hidden border bg-zinc-900 flex flex-col transition-all ${marcado ? 'border-rose-500 ring-1 ring-rose-500' : 'border-[var(--border-color)]'}`}
            >
              {/* No celular (sem `sm:`) os botões são maiores: o dedo precisa de
                  pelo menos 24 px de alvo (WCAG 2.2); medido no Chromium em
                  27/11/2026, o selo de idioma tinha 18 px de altura. */}
              <div className="relative">
                <img src={panel.image_url} alt={`${t('grade.painel')} ${idx + 1}`} className="w-full object-cover" loading="lazy" />
                {trocando && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
                {!somenteLeitura && (
                  <button
                    type="button"
                    aria-label={`${t('grade.selecionarPainel')} #${idx + 1}`}
                    aria-pressed={marcado}
                    onClick={() => setSelecionados(prev => {
                      const n = new Set(prev);
                      if (n.has(k)) n.delete(k); else n.add(k);
                      return n;
                    })}
                    className={`absolute top-2 left-2 w-7 h-7 sm:w-6 sm:h-6 rounded-lg border-2 flex items-center justify-center transition-all ${marcado ? 'bg-rose-600 border-rose-500' : 'bg-black/60 border-white/20 opacity-70 sm:opacity-0 group-hover:opacity-100'}`}
                  >
                    {marcado && <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                )}
                <div className={`absolute top-2 ${somenteLeitura ? 'left-2' : 'left-10 sm:left-9'} bg-black/60 rounded-lg px-2 py-1 text-[10px] font-black text-zinc-300`}>
                  #{idx + 1}
                </div>
                {!somenteLeitura && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-all">
                    <label
                      title={t('grade.trocarImagem')}
                      className="p-2 sm:p-1.5 bg-black/70 rounded-lg text-white cursor-pointer hover:bg-sky-600"
                    >
                      <ImagePlus size={13} />
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        aria-label={`${t('grade.trocarImagem')} #${idx + 1}`}
                        disabled={trocando}
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; trocarImagem(idx, f); }}
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`${t('grade.apagarPainel')} #${idx + 1}`}
                      onClick={() => apagar([idx])}
                      disabled={apagando}
                      className="p-2 sm:p-1.5 bg-rose-600/80 rounded-lg text-white hover:bg-rose-600 disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
              <div className="p-2 flex flex-wrap gap-1 bg-zinc-900">
                {IDIOMAS.map(lang => (
                  <button
                    key={lang}
                    type="button"
                    aria-label={`${t('grade.balao')} ${lang.toUpperCase()} #${idx + 1}`}
                    aria-pressed={idiomasDoPainel.includes(lang)}
                    onClick={() => { setUrlBalao(''); setErro(null); setBalaoAberto({ indice: idx, idioma: lang }); }}
                    className={`px-2 py-2 sm:py-0.5 rounded text-[9px] font-black uppercase tracking-widest transition-all ${idiomasDoPainel.includes(lang) ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-500 hover:bg-white/10'}`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {balaoAberto && painelDoBalao && (
        <div role="dialog" aria-modal="true" aria-label={`${t('grade.balao')} ${balaoAberto.idioma.toUpperCase()} #${balaoAberto.indice + 1}`} className="fixed inset-0 z-[2000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[#1C1C1E] rounded-[2.5rem] border border-white/10 p-8 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-black text-white">{t('grade.painel')} #{balaoAberto.indice + 1} · {t('grade.balao')}</h3>
              <button type="button" aria-label={t('envio.fechar')} onClick={() => setBalaoAberto(null)} className="p-2 rounded-full hover:bg-white/10 text-white"><X size={18} /></button>
            </div>

            <div className="flex gap-2 mb-4">
              {IDIOMAS.map(lang => {
                const tem = (painelDoBalao.translationLayers ?? []).some(c => c.language === lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => { setUrlBalao(''); setBalaoAberto({ indice: balaoAberto.indice, idioma: lang }); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${balaoAberto.idioma === lang ? 'bg-rose-600 text-white' : tem ? 'bg-white/10 text-white' : 'bg-white/5 text-zinc-500'}`}
                  >
                    {lang}{tem ? ' ✓' : ''}
                  </button>
                );
              })}
            </div>

            {/* O balão por cima do painel, como o leitor mostra. */}
            <div className="relative w-full mb-4 rounded-xl overflow-hidden bg-black max-h-64 overflow-y-auto">
              <img src={painelDoBalao.image_url} alt="" className="w-full h-auto block" />
              {balaoAtual && <img data-testid="grade-balao-atual" src={balaoAtual.imageUrl} alt="" className="absolute top-0 left-0 w-full h-auto" />}
            </div>
            {!balaoAtual && <p className="text-xs text-zinc-500 font-bold mb-4">{t('grade.semBalao')}</p>}

            {erro && <p role="alert" className="mb-3 text-xs font-bold text-rose-400">{erro}</p>}

            {!somenteLeitura && (
              <>
                <label className={`flex items-center justify-center gap-2 w-full py-3 mb-3 rounded-2xl border border-dashed border-white/15 bg-white/5 text-xs font-black uppercase tracking-widest text-zinc-200 transition-all ${balaoOcupado ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-white/10 hover:border-rose-500/40'}`}>
                  {balaoOcupado
                    ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('grade.enviando')}</>
                    : <><Upload size={14} /> {balaoAtual ? t('grade.trocarBalao') : t('grade.enviarBalao')}</>}
                  <input
                    type="file"
                    accept="image/png"
                    className="hidden"
                    aria-label={balaoAtual ? t('grade.trocarBalao') : t('grade.enviarBalao')}
                    disabled={balaoOcupado}
                    onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; trocarBalao(balaoAberto.indice, balaoAberto.idioma, f); }}
                  />
                </label>

                {permitirUrl && (
                  <div className="mb-3">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600 mb-2">{t('grade.ouUrl')}</div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={urlBalao}
                        onChange={e => setUrlBalao(e.target.value)}
                        placeholder="https://..."
                        aria-label={t('grade.ouUrl')}
                        className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => salvarUrl(balaoAberto.indice, balaoAberto.idioma)}
                        disabled={balaoOcupado || !urlBalao.trim()}
                        className="px-4 py-3 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest disabled:opacity-50"
                      >
                        {t('grade.salvarUrl')}
                      </button>
                    </div>
                  </div>
                )}

                {balaoAtual && (
                  <button
                    type="button"
                    onClick={() => removerBalao(balaoAberto.indice, balaoAberto.idioma)}
                    disabled={balaoOcupado}
                    className="w-full py-3 bg-white/5 border border-white/10 text-zinc-400 rounded-2xl font-black text-sm hover:bg-rose-600/20 hover:text-rose-400 hover:border-rose-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> {t('grade.removerBalao')}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GradePaineis;
