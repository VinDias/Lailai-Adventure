import React, { useEffect, useState } from 'react';
import { Users, Mail, Ban, Send } from 'lucide-react';
import { api } from '../../services/api';

/**
 * Gerenciamento de canais (Fase 5 Bloco 1, Task 10) — admin, PT fixo. Duas
 * peças novas do form de canal (spec): campo "E-mail do dono" (PUT
 * ownerEmail — só admin processa essa branch, routes/channels.js) e botão
 * "Desativar canal" (POST /:id/desativar). Mais a aba "Mensagens" por canal
 * (GET/POST /admin/mensagens/:canalId).
 *
 * GET /api/channels (admin) só lista canais ATIVOS (`isActive: true` no
 * filtro do backend) e não devolve `isActive` no shape (`.select('name
 * ownerId')`) — depois de desativar, o canal sumiria de um refetch dessa
 * rota. Por isso o estado "inativo" é mantido só localmente (otimista, sem
 * refetch da lista) assim que a desativação é confirmada: o objetivo é
 * indicar na UI que a ação funcionou, não espelhar um estado que a própria
 * rota de listagem não devolve mais.
 */

interface CanalResumo {
  _id: string;
  name: string;
  isActive?: boolean;
}

const CanaisPanel: React.FC = () => {
  const [channels, setChannels] = useState<CanalResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [savingOwner, setSavingOwner] = useState(false);
  // { texto, erro } em vez de heurística sobre a string: a mensagem de 404 do
  // backend ("Usuário com esse e-mail não encontrado.") não contém "rro" e
  // renderizava verde como se fosse sucesso (achado da revisão da T10).
  const [ownerMsg, setOwnerMsg] = useState<{ texto: string; erro: boolean } | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [aba, setAba] = useState<'detalhes' | 'mensagens'>('detalhes');
  const [threads, setThreads] = useState<any[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [novaMensagem, setNovaMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await api.listChannels();
      setChannels(prev =>
        (list as any[]).map(c => {
          const existente = prev.find(p => p._id === c._id);
          return { ...c, isActive: existente ? existente.isActive : true };
        }),
      );
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const abrirCanal = async (ch: CanalResumo) => {
    setAba('detalhes');
    setOwnerEmail('');
    setOwnerMsg(null);
    setThreads([]);
    setLoadingDetail(true);
    try {
      const full = await api.getChannel(ch._id);
      setSelected({ ...full, isActive: ch.isActive !== false });
    } catch {
      setSelected({ ...ch });
    } finally {
      setLoadingDetail(false);
    }
  };

  const salvarOwnerEmail = async () => {
    if (!selected || !ownerEmail.trim()) return;
    setSavingOwner(true);
    setOwnerMsg(null);
    try {
      const updated = await api.updateChannelAdmin(selected._id, { ownerEmail: ownerEmail.trim() });
      setSelected((s: any) => (s ? { ...s, ownerId: updated.ownerId } : s));
      setOwnerEmail('');
      setOwnerMsg({ texto: 'Dono do canal atualizado!', erro: false });
    } catch (e: any) {
      setOwnerMsg({ texto: e?.message || 'Erro ao transferir o canal.', erro: true });
    } finally {
      setSavingOwner(false);
    }
  };

  const desativar = async () => {
    if (!selected) return;
    if (!confirm(`Desativar o canal "${selected.name}"? O dono poderá pedir a exclusão da conta depois disso.`)) return;
    setDeactivating(true);
    try {
      await api.desativarCanal(selected._id);
      setSelected((s: any) => (s ? { ...s, isActive: false } : s));
      setChannels(prev => prev.map(c => (c._id === selected._id ? { ...c, isActive: false } : c)));
    } catch {
      alert('Erro ao desativar canal.');
    } finally {
      setDeactivating(false);
    }
  };

  const carregarMensagens = async (canalId: string) => {
    setLoadingThreads(true);
    try {
      const { threads: t } = await api.getAdminMensagensCanal(canalId);
      setThreads(t);
    } catch {
      setThreads([]);
    } finally {
      setLoadingThreads(false);
    }
  };

  const abrirAbaMensagens = () => {
    setAba('mensagens');
    if (selected) carregarMensagens(selected._id);
  };

  const enviarMensagem = async () => {
    if (!selected || !novaMensagem.trim()) return;
    setEnviando(true);
    try {
      await api.sendAdminMensagem(selected._id, { texto: novaMensagem.trim() });
      setNovaMensagem('');
      await carregarMensagens(selected._id);
    } catch {
      alert('Erro ao enviar mensagem.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="max-w-5xl animate-apple">
      <h2 className="text-4xl font-black tracking-tighter mb-8 flex items-center gap-3">
        <Users size={32} className="text-rose-500" /> Canais
      </h2>

      <div className="flex gap-8 items-start">
        <div className="w-72 shrink-0 bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-zinc-600 text-xs font-black uppercase tracking-widest">Carregando...</div>
          ) : channels.length === 0 ? (
            <div className="p-8 text-center text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhum canal</div>
          ) : (
            <div className="divide-y divide-white/5">
              {channels.map(ch => (
                <button
                  key={ch._id}
                  onClick={() => abrirCanal(ch)}
                  className={`w-full text-left px-5 py-4 hover:bg-white/5 transition-all ${selected?._id === ch._id ? 'bg-white/5' : ''}`}
                >
                  <p className="font-bold text-sm text-[var(--text-color)]">{ch.name}</p>
                  {ch.isActive === false && <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Inativo</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {!selected ? (
            <p className="text-zinc-600 text-sm font-bold">Selecione um canal na lista.</p>
          ) : loadingDetail ? (
            <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
          ) : (
            <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-3xl p-8">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div>
                  <h3 className="text-2xl font-black tracking-tighter">{selected.name}</h3>
                  {selected.isActive === false && <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">Canal inativo</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAba('detalhes')}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${aba === 'detalhes' ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                  >
                    Detalhes
                  </button>
                  <button
                    onClick={abrirAbaMensagens}
                    className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${aba === 'mensagens' ? 'bg-rose-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                  >
                    Mensagens
                  </button>
                </div>
              </div>

              {aba === 'detalhes' ? (
                <div className="space-y-6">
                  <p className="text-sm text-zinc-400">
                    Dono atual: <span className="font-bold text-[var(--text-color)]">{selected.ownerId?.nome || '—'}</span>
                  </p>

                  <div>
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">
                      E-mail do dono (transferir titularidade)
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="email"
                        value={ownerEmail}
                        onChange={e => setOwnerEmail(e.target.value)}
                        placeholder="E-mail do novo dono"
                        className="flex-1 min-w-[220px] bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
                      />
                      <button
                        onClick={salvarOwnerEmail}
                        disabled={savingOwner || !ownerEmail.trim()}
                        className="flex items-center gap-2 px-5 py-3 bg-rose-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-500 transition-all disabled:opacity-50"
                      >
                        <Mail size={14} /> {savingOwner ? '...' : 'Transferir'}
                      </button>
                    </div>
                    {ownerMsg && <p className={`text-xs font-bold mt-2 ${ownerMsg.erro ? 'text-rose-500' : 'text-emerald-400'}`}>{ownerMsg.texto}</p>}
                  </div>

                  <div className="pt-4 border-t border-[var(--border-color)]">
                    <button
                      onClick={desativar}
                      disabled={deactivating || selected.isActive === false}
                      className="flex items-center gap-2 px-5 py-3 bg-rose-600/10 border border-rose-500/30 text-rose-500 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-600/20 transition-all disabled:opacity-50"
                    >
                      <Ban size={14} /> {selected.isActive === false ? 'Canal desativado' : deactivating ? 'Desativando...' : 'Desativar canal'}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {loadingThreads ? (
                    <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
                  ) : threads.length === 0 ? (
                    <p className="text-zinc-600 text-sm font-bold mb-6">Nenhuma mensagem ainda.</p>
                  ) : (
                    <div className="space-y-6 mb-6 max-h-96 overflow-y-auto pr-2">
                      {threads.map((thread: any, i: number) => (
                        <div key={i} className={`rounded-2xl border p-4 ${thread.vigente ? 'border-[var(--border-color)]' : 'border-white/5 opacity-70'}`}>
                          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3">
                            {thread.vigente ? 'Vigente' : `Arquivada em ${new Date(thread.arquivadaEm).toLocaleDateString('pt-BR')}`}
                          </p>
                          <div className="space-y-2">
                            {thread.mensagens.map((m: any) => (
                              <div key={m._id} className={`text-sm ${m.autorTipo === 'editor' ? 'text-rose-400' : 'text-[var(--text-color)]'}`}>
                                <span className="font-black text-[10px] uppercase tracking-widest">{m.autorTipo === 'editor' ? 'Editor' : 'Ilustrador'}:</span>{' '}
                                {m.texto}
                                {m.refTipo && (
                                  <span className="text-zinc-600 text-[10px] ml-2 font-bold uppercase tracking-widest">
                                    Sobre: {m.refTipo === 'series' ? 'série' : 'capítulo'}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {selected.isActive !== false && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={novaMensagem}
                        onChange={e => setNovaMensagem(e.target.value)}
                        placeholder="Escreva sua mensagem..."
                        className="flex-1 bg-black/5 dark:bg-white/5 border border-[var(--border-color)] rounded-2xl px-4 py-3 text-[var(--text-color)] text-sm font-bold outline-none focus:border-rose-500 transition-colors"
                      />
                      <button
                        onClick={enviarMensagem}
                        disabled={enviando || !novaMensagem.trim()}
                        className="flex items-center gap-2 px-5 py-3 bg-rose-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-rose-500 transition-all disabled:opacity-50"
                      >
                        <Send size={14} /> Enviar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CanaisPanel;
