
import React, { useState, useEffect } from 'react';
import { ViewMode } from '../../types';
import { api } from '../../services/api';
import {
  Users, Layers, LayoutDashboard, LogOut,
  Trash2, ArrowUp, ArrowDown, DollarSign,
  Film, Plus, X
} from 'lucide-react';
import API_URL from '../../config/api';

interface AdminProps {
  onLogout: () => void;
  currentSubView: ViewMode;
  setSubView: (v: ViewMode) => void;
}

const CONTENT_TYPES = [
  { value: 'hqcine', label: 'HQCine' },
  { value: 'vcine', label: 'VCine' },
  { value: 'hiqua', label: 'Hi-Qua' }
];

const AdminDashboard: React.FC<AdminProps> = ({ onLogout, currentSubView, setSubView }) => {
  const [stats, setStats] = useState<any>(null);
  const [contentList, setContentList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Estado do formulário de nova série
  const [newSeries, setNewSeries] = useState({
    title: '', genre: '', description: '',
    cover_image: '', content_type: 'hqcine', isPremium: false
  });
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState('');

  useEffect(() => {
    loadDashboard();
  }, [currentSubView]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      if (currentSubView === ViewMode.ADMIN_DASHBOARD) {
        const s = await api.getAdminStats();
        setStats(s);
      }
      const result = await api.getAdminContent();
      setContentList(result.series ?? []);
    } catch (e) {
      console.error('Admin Load Error', e);
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = async (id: string, direction: 'up' | 'down') => {
    const index = contentList.findIndex(i => (i._id || i.id) === id);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === contentList.length - 1)) return;

    const newList = [...contentList];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    const updated = newList.map((item, idx) => ({ ...item, order_index: idx }));
    setContentList(updated);

    try {
      await fetch(`${API_URL}/admin/management/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updated.map(i => ({ id: i._id || i.id, order_index: i.order_index })) }),
        credentials: 'include'
      });
    } catch (e) { alert('Erro ao salvar nova ordem.'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir permanentemente esta série e todos os episódios?')) return;
    try {
      await api.deleteSeries(id);
      setContentList(prev => prev.filter(i => (i._id || i.id) !== id));
    } catch (e) { alert('Erro ao excluir.'); }
  };

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateMsg('');
    try {
      const created = await api.createSeries({ ...newSeries, isPublished: true });
      setContentList(prev => [created, ...prev]);
      setNewSeries({ title: '', genre: '', description: '', cover_image: '', content_type: 'hqcine', isPremium: false });
      setCreateMsg('Série criada com sucesso!');
      setTimeout(() => { setCreateMsg(''); setShowCreateModal(false); }, 1500);
    } catch (e) {
      setCreateMsg('Erro ao criar série.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-zinc-100 font-inter">
      {/* Sidebar */}
      <aside className="w-64 bg-[#0F0F12] border-r border-white/5 flex flex-col p-6 shrink-0">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center font-black italic text-sm">LF</div>
          <h1 className="text-lg font-black tracking-tighter">Loreflux Studio</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarLink active={currentSubView === ViewMode.ADMIN_DASHBOARD} onClick={() => setSubView(ViewMode.ADMIN_DASHBOARD)} icon={<LayoutDashboard size={18} />} label="Dashboard" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_CONTENT} onClick={() => setSubView(ViewMode.ADMIN_CONTENT)} icon={<Layers size={18} />} label="Gerenciar Conteúdo" />
        </nav>

        <button onClick={onLogout} className="mt-auto flex items-center gap-3 p-4 rounded-2xl text-zinc-500 hover:text-rose-500 font-bold text-sm transition-all">
          <LogOut size={18} /> Sair
        </button>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-12 scrollbar-hide">

        {/* DASHBOARD */}
        {currentSubView === ViewMode.ADMIN_DASHBOARD && (
          <div className="animate-apple">
            <h2 className="text-4xl font-black tracking-tighter mb-12">Visão Geral</h2>
            {loading ? (
              <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                  <StatCard label="Usuários Ativos" value={stats.totalUsers ?? 0} icon={<Users size={20} />} />
                  <StatCard label="Assinantes Premium" value={stats.premiumUsers ?? 0} icon={<DollarSign size={20} />} />
                  <StatCard label="Conteúdos Publicados" value={stats.totalContent ?? 0} icon={<Film size={20} />} />
                  <StatCard label="Receita Estimada" value={`R$ ${(stats.estimatedMonthlyRevenue ?? 0).toFixed(2)}`} icon={<DollarSign size={20} />} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <StatCard label="Séries" value={stats.totalSeries ?? 0} icon={<Layers size={20} />} />
                  <StatCard label="Episódios" value={stats.totalEpisodes ?? 0} icon={<Film size={20} />} />
                  <StatCard label="Anúncios Ativos" value={stats.activeAds ?? 0} icon={<Layers size={20} />} />
                </div>
              </>
            ) : (
              <p className="text-zinc-600 text-sm">Erro ao carregar estatísticas.</p>
            )}
          </div>
        )}

        {/* CONTEÚDO */}
        {currentSubView === ViewMode.ADMIN_CONTENT && (
          <div className="max-w-4xl animate-apple">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-4xl font-black tracking-tighter">Gerenciar Séries</h2>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-rose-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-rose-500 transition-all"
              >
                <Plus size={16} /> Nova Série
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-40"><div className="w-8 h-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" /></div>
            ) : (
              <div className="bg-[#0F0F12] rounded-[2.5rem] border border-white/5 overflow-hidden">
                {contentList.length === 0 ? (
                  <div className="p-16 text-center">
                    <p className="text-zinc-600 text-xs font-black uppercase tracking-widest">Nenhuma série cadastrada</p>
                    <p className="text-zinc-700 text-xs mt-2">Clique em "Nova Série" para começar</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {contentList.map((item, idx) => {
                      const id = item._id || item.id;
                      return (
                        <div key={id} className="flex items-center gap-6 p-6 hover:bg-white/5 transition-all">
                          <div className="w-12 h-20 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-white/10">
                            {item.cover_image && <img src={item.cover_image} className="w-full h-full object-cover" alt={item.title} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-sm mb-1 truncate">{item.title}</h4>
                            <div className="flex gap-3">
                              <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">{item.content_type}</span>
                              <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">#{idx + 1}</span>
                              {item.isPremium && <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">PREMIUM</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => handleReorder(id, 'up')} className="p-2 bg-white/5 rounded-lg text-zinc-500 hover:text-white"><ArrowUp size={16} /></button>
                            <button onClick={() => handleReorder(id, 'down')} className="p-2 bg-white/5 rounded-lg text-zinc-500 hover:text-white"><ArrowDown size={16} /></button>
                            <button onClick={() => handleDelete(id)} className="p-2 bg-rose-600/10 rounded-lg text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={16} /></button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal — Nova Série */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[3000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="bg-[#0F0F12] rounded-[2.5rem] border border-white/10 p-10 w-full max-w-lg">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-2xl font-black tracking-tighter">Nova Série</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-zinc-500 hover:text-white transition-all"><X size={24} /></button>
            </div>

            <form onSubmit={handleCreateSeries} className="space-y-4">
              <FormField label="Título" value={newSeries.title} onChange={v => setNewSeries(s => ({ ...s, title: v }))} required />
              <FormField label="Gênero" value={newSeries.genre} onChange={v => setNewSeries(s => ({ ...s, genre: v }))} required />
              <FormField label="Descrição" value={newSeries.description} onChange={v => setNewSeries(s => ({ ...s, description: v }))} />
              <FormField label="URL da Capa (cover_image)" value={newSeries.cover_image} onChange={v => setNewSeries(s => ({ ...s, cover_image: v }))} />

              <div>
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">Tipo de Conteúdo</label>
                <select
                  value={newSeries.content_type}
                  onChange={e => setNewSeries(s => ({ ...s, content_type: e.target.value }))}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-rose-500"
                >
                  {CONTENT_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
                </select>
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newSeries.isPremium}
                  onChange={e => setNewSeries(s => ({ ...s, isPremium: e.target.checked }))}
                  className="w-4 h-4 accent-rose-500"
                />
                <span className="text-sm font-bold text-zinc-300">Conteúdo Premium</span>
              </label>

              {createMsg && (
                <p className={`text-sm font-bold text-center ${createMsg.includes('Erro') ? 'text-rose-500' : 'text-green-400'}`}>{createMsg}</p>
              )}

              <button
                type="submit"
                disabled={creating || !newSeries.title || !newSeries.genre}
                className="w-full py-4 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creating ? 'Criando...' : 'CRIAR SÉRIE'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const SidebarLink = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-bold text-sm ${active ? 'bg-rose-600 text-white' : 'text-zinc-500 hover:bg-white/5'}`}>
    {icon} {label}
  </button>
);

const StatCard = ({ label, value, icon }: any) => (
  <div className="bg-[#0F0F12] p-8 rounded-[2rem] border border-white/5">
    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center mb-6 text-rose-500">{icon}</div>
    <div className="text-3xl font-black">{value}</div>
    <div className="text-[10px] font-black text-zinc-600 uppercase mt-2 tracking-widest">{label}</div>
  </div>
);

const FormField = ({ label, value, onChange, required = false }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) => (
  <div>
    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest block mb-2">{label}</label>
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      required={required}
      className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm font-bold outline-none focus:border-rose-500 transition-colors"
    />
  </div>
);

export default AdminDashboard;
