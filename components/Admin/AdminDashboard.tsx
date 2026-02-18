
import React, { useState, useEffect } from 'react';
import { ViewMode, AdminStats, User as UserType } from '../../types';
import { api } from '../../services/api';
import { Users, Video, BookOpen, CreditCard, LayoutDashboard, LogOut, Trash2, ShieldCheck, TrendingUp } from 'lucide-react';
import API_URL from '../../config/api';

interface AdminProps {
  onLogout: () => void;
  currentSubView: ViewMode;
  setSubView: (v: ViewMode) => void;
}

const AdminDashboard: React.FC<AdminProps> = ({ onLogout, currentSubView, setSubView }) => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [currentSubView]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (currentSubView === ViewMode.ADMIN_DASHBOARD) {
        const res = await fetch(`${API_URL}/admin/dashboard`, { credentials: 'include' });
        setStats(await res.json());
      } else if (currentSubView === ViewMode.ADMIN_USERS) {
        const res = await fetch(`${API_URL}/admin/users`, { credentials: 'include' });
        setUsers(await res.json());
      }
    } catch (e) {
      console.error("Admin Load Error", e);
    } finally {
      setLoading(false);
    }
  };

  const deleteUser = async (id: string) => {
    if (!confirm("Excluir este usuário permanentemente?")) return;
    await fetch(`${API_URL}/admin/users/${id}`, { method: 'DELETE', credentials: 'include' });
    loadData();
  };

  return (
    <div className="flex h-screen bg-[#0F0F12] text-zinc-100 font-inter">
      {/* SIDEBAR PROFISSIONAL */}
      <aside className="w-72 bg-[#16161A] border-r border-white/5 flex flex-col p-6">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center font-black italic shadow-lg shadow-rose-900/20">LL</div>
          <div>
            <h1 className="text-lg font-black tracking-tighter">LaiLai Studio</h1>
            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Painel de Controle</span>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarLink active={currentSubView === ViewMode.ADMIN_DASHBOARD} onClick={() => setSubView(ViewMode.ADMIN_DASHBOARD)} icon={<LayoutDashboard size={20}/>} label="Dashboard" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_CONTENT} onClick={() => setSubView(ViewMode.ADMIN_CONTENT)} icon={<Video size={20}/>} label="Vídeos e Curtas" />
          <SidebarLink active={false} onClick={() => {}} icon={<BookOpen size={20}/>} label="Webtoons" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_USERS} onClick={() => setSubView(ViewMode.ADMIN_USERS)} icon={<Users size={20}/>} label="Comunidade" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_PAYMENTS} onClick={() => setSubView(ViewMode.ADMIN_PAYMENTS)} icon={<CreditCard size={20}/>} label="Pagamentos" />
        </nav>

        <button onClick={onLogout} className="mt-auto flex items-center gap-3 p-4 rounded-2xl text-zinc-500 hover:bg-rose-500/10 hover:text-rose-500 transition-all font-bold text-sm">
          <LogOut size={20} /> Sair do Sistema
        </button>
      </aside>

      {/* ÁREA DE CONTEÚDO */}
      <main className="flex-1 overflow-y-auto p-12 scrollbar-hide">
        {currentSubView === ViewMode.ADMIN_DASHBOARD && stats && (
          <div className="animate-apple">
            <header className="mb-12">
              <h2 className="text-4xl font-black tracking-tighter mb-2">Visão Geral</h2>
              <p className="text-zinc-500 font-medium">Métricas de crescimento da plataforma.</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
              <StatCard label="Usuários Ativos" value={stats.totalUsers} icon={<Users className="text-blue-500"/>} />
              <StatCard label="Assinantes Premium" value={stats.premiumUsers} icon={<ShieldCheck className="text-amber-500"/>} />
              <StatCard label="Receita Mensal" value={`R$ ${stats.estimatedRevenue.toFixed(2)}`} icon={<TrendingUp className="text-emerald-500"/>} />
              <StatCard label="Conteúdos Online" value={stats.totalVideos + stats.totalWebtoons} icon={<Video className="text-purple-500"/>} />
            </div>

            <div className="bg-[#16161A] border border-white/5 rounded-[2.5rem] p-8">
               <h3 className="text-lg font-bold mb-6">Atividade Recente</h3>
               <div className="h-64 flex items-center justify-center text-zinc-600 border border-dashed border-white/5 rounded-3xl uppercase text-[10px] font-black tracking-widest">
                  Gráficos de Engajamento indisponíveis no Mock
               </div>
            </div>
          </div>
        )}

        {currentSubView === ViewMode.ADMIN_USERS && (
          <div className="animate-apple">
            <header className="mb-12 flex justify-between items-end">
              <div>
                <h2 className="text-4xl font-black tracking-tighter mb-2">Usuários</h2>
                <p className="text-zinc-500 font-medium">Gerencie o acesso da comunidade.</p>
              </div>
            </header>

            <div className="bg-[#16161A] border border-white/5 rounded-[2.5rem] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-zinc-500">
                    <th className="p-6">Nome</th>
                    <th className="p-6">Email</th>
                    <th className="p-6">Status</th>
                    <th className="p-6">Data Cadastro</th>
                    <th className="p-6">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="p-6 flex items-center gap-3">
                        <img src={`https://picsum.photos/seed/${u.id}/100`} className="w-8 h-8 rounded-lg" />
                        <span className="font-bold text-sm">{u.nome}</span>
                      </td>
                      <td className="p-6 text-sm text-zinc-400 font-medium">{u.email}</td>
                      <td className="p-6">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${u.isPremium ? 'bg-amber-500/10 text-amber-500' : 'bg-zinc-800 text-zinc-500'}`}>
                          {u.isPremium ? 'Premium' : 'Gratuito'}
                        </span>
                      </td>
                      <td className="p-6 text-xs text-zinc-500 font-bold">{u.criadoEm}</td>
                      <td className="p-6">
                        <button onClick={() => deleteUser(u.id)} className="p-2 text-zinc-600 hover:text-rose-500 transition-colors"><Trash2 size={18}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentSubView === ViewMode.ADMIN_CONTENT && (
           <div className="animate-apple text-center py-20">
              <Video size={48} className="mx-auto mb-6 text-rose-500 opacity-20" />
              <h2 className="text-2xl font-black mb-4">Módulo de Upload</h2>
              <p className="text-zinc-500 max-w-sm mx-auto mb-8">O sistema de processamento FFmpeg requer um servidor Node rodando o backend real para transcodificar vídeos em HLS.</p>
              <button className="px-10 py-4 bg-white text-black font-black rounded-2xl text-sm">ADICIONAR NOVO VÍDEO</button>
           </div>
        )}
      </main>
    </div>
  );
};

const SidebarLink = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-bold text-sm ${active ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/30' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}>
    {icon} {label}
  </button>
);

const StatCard = ({ label, value, icon }: any) => (
  <div className="bg-[#16161A] border border-white/5 p-8 rounded-[2rem] shadow-sm">
    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center mb-6">{icon}</div>
    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{label}</div>
    <div className="text-3xl font-black tracking-tighter">{value}</div>
  </div>
);

export default AdminDashboard;
