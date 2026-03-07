
import React, { useState, useEffect } from 'react';
import { ViewMode, AdminStats, User as UserType, Video, Series } from '../../types';
import { api } from '../../services/api';
import { 
  Users, Layers, LayoutDashboard, LogOut, 
  Trash2, Image as ImageIcon, ArrowUp, ArrowDown,
  Activity, Cloud, DollarSign
} from 'lucide-react';
import API_URL from '../../config/api';

interface AdminProps {
  onLogout: () => void;
  currentSubView: ViewMode;
  setSubView: (v: ViewMode) => void;
}

const AdminDashboard: React.FC<AdminProps> = ({ onLogout, currentSubView, setSubView }) => {
  const [stats, setStats] = useState<any>(null);
  const [contentList, setContentList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Upload State
  const [title, setTitle] = useState('');
  const [section, setSection] = useState<'HQCINE' | 'VCINE' | 'HIQUA'>('HQCINE');
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null);

  useEffect(() => {
    loadDashboard();
  }, [currentSubView]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      if (currentSubView === ViewMode.ADMIN_DASHBOARD) {
        const res = await fetch(`${API_URL}/admin/management/dashboard-stats`, { credentials: 'include' });
        setStats(await res.json());
      }
      const contentRes = await fetch(`${API_URL}/content/series`);
      setContentList(await contentRes.json());
    } catch (e) {
      console.error("Admin Load Error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleReorder = async (id: number, direction: 'up' | 'down') => {
    const index = contentList.findIndex(i => i.id === id);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === contentList.length - 1)) return;

    const newList = [...contentList];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newList[index], newList[targetIndex]] = [newList[targetIndex], newList[index]];
    
    // Atualizar order_index localmente para feedback instantâneo
    const updatedWithIndices = newList.map((item, idx) => ({ ...item, order_index: idx }));
    setContentList(updatedWithIndices);

    try {
      await fetch(`${API_URL}/admin/management/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: updatedWithIndices.map(i => ({ id: i.id, order_index: i.order_index })) }),
        credentials: 'include'
      });
    } catch (e) { alert("Erro ao salvar nova ordem."); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Excluir permanentemente este conteúdo?")) return;
    try {
      await fetch(`${API_URL}/admin/management/content/${id}`, { method: 'DELETE', credentials: 'include' });
      setContentList(prev => prev.filter(i => i.id !== id));
    } catch (e) { alert("Erro ao excluir."); }
  };

  return (
    <div className="flex h-screen bg-[#0A0A0B] text-zinc-100 font-inter">
      <aside className="w-64 bg-[#0F0F12] border-r border-white/5 flex flex-col p-6">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center font-black italic">LL</div>
          <h1 className="text-lg font-black tracking-tighter">Loreflux Studio</h1>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarLink active={currentSubView === ViewMode.ADMIN_DASHBOARD} onClick={() => setSubView(ViewMode.ADMIN_DASHBOARD)} icon={<LayoutDashboard size={18}/>} label="Dashboard" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_CONTENT} onClick={() => setSubView(ViewMode.ADMIN_CONTENT)} icon={<Layers size={18}/>} label="Gerenciar Conteúdo" />
        </nav>

        <button onClick={onLogout} className="mt-auto flex items-center gap-3 p-4 rounded-2xl text-zinc-500 hover:text-rose-500 font-bold text-sm transition-all">
          <LogOut size={18} /> Sair
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-12 scrollbar-hide">
        {currentSubView === ViewMode.ADMIN_DASHBOARD && stats && (
          <div className="animate-apple">
            <h2 className="text-4xl font-black tracking-tighter mb-12">Visão Geral</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <StatCard label="Usuários Ativos" value={stats.totalUsers} icon={<Users size={20}/>} />
              <StatCard label="Assinantes Premium" value={stats.premiumUsers} icon={<DollarSign size={20}/>} />
              <StatCard label="Espaço em Disco" value={stats.serverStorage} icon={<Cloud size={20}/>} />
            </div>
          </div>
        )}

        {currentSubView === ViewMode.ADMIN_CONTENT && (
          <div className="max-w-4xl animate-apple">
            <h2 className="text-4xl font-black tracking-tighter mb-8">Gerenciador de Arquivos</h2>
            
            <div className="bg-[#0F0F12] rounded-[2.5rem] border border-white/5 overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Explorer Vertical</span>
                <button className="px-6 py-2 bg-rose-600 rounded-full text-[10px] font-black uppercase tracking-widest">+ Novo Upload</button>
              </div>

              <div className="divide-y divide-white/5">
                {contentList.map((item, idx) => (
                  <div key={item.id} className="flex items-center gap-6 p-6 hover:bg-white/5 transition-all group">
                    <div className="w-12 h-20 bg-zinc-800 rounded-lg overflow-hidden shrink-0 border border-white/10 relative">
                       <img src={item.cover_image} className="w-full h-full object-cover" />
                       <button className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                         <ImageIcon size={16} className="text-white" />
                       </button>
                    </div>
                    
                    <div className="flex-1">
                      <h4 className="font-bold text-sm mb-1">{item.title}</h4>
                      <div className="flex gap-3">
                        <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest">{item.section}</span>
                        <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Ordem: {idx + 1}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                       <button onClick={() => handleReorder(item.id, 'up')} className="p-2 bg-white/5 rounded-lg text-zinc-500 hover:text-white"><ArrowUp size={16}/></button>
                       <button onClick={() => handleReorder(item.id, 'down')} className="p-2 bg-white/5 rounded-lg text-zinc-500 hover:text-white"><ArrowDown size={16}/></button>
                       <button onClick={() => handleDelete(item.id)} className="p-2 bg-rose-600/10 rounded-lg text-rose-500 hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={16}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
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

export default AdminDashboard;
