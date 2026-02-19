
import React, { useState, useEffect } from 'react';
import { ViewMode, AdminStats, User as UserType } from '../../types';
import { api } from '../../services/api';
import { Users, Video, BookOpen, CreditCard, LayoutDashboard, LogOut, Trash2, ShieldCheck, TrendingUp, Music } from 'lucide-react';
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
  
  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPremium, setIsPremium] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [selectedAudio1, setSelectedAudio1] = useState<File | null>(null);
  const [selectedAudio2, setSelectedAudio2] = useState<File | null>(null);
  const [selectedThumbnail, setSelectedThumbnail] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);

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

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedThumbnail(e.target.files[0]);
      setThumbPreview(URL.createObjectURL(e.target.files[0]));
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVideo || !title) return alert("Vídeo e Título são obrigatórios.");

    setLoading(true);
    const formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('isPremium', String(isPremium));
    formData.append('video', selectedVideo);
    if (selectedAudio1) formData.append('audioTrack1', selectedAudio1);
    if (selectedAudio2) formData.append('audioTrack2', selectedAudio2);
    if (selectedThumbnail) formData.append('thumbnail', selectedThumbnail);

    try {
      const res = await fetch(`${API_URL}/admin/upload-content`, {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!res.ok) throw new Error("Erro no upload");
      
      alert("Conteúdo publicado com sucesso!");
      setTitle('');
      setDescription('');
      setSelectedVideo(null);
      setSelectedAudio1(null);
      setSelectedAudio2(null);
    } catch (err: any) {
      alert(err.message);
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
      {/* SIDEBAR */}
      <aside className="w-72 bg-[#16161A] border-r border-white/5 flex flex-col p-6">
        <div className="flex items-center gap-3 mb-12 px-2">
          <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center font-black italic">LL</div>
          <div>
            <h1 className="text-lg font-black tracking-tighter">LaiLai Studio</h1>
            <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Painel de Controle</span>
          </div>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarLink active={currentSubView === ViewMode.ADMIN_DASHBOARD} onClick={() => setSubView(ViewMode.ADMIN_DASHBOARD)} icon={<LayoutDashboard size={20}/>} label="Dashboard" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_CONTENT} onClick={() => setSubView(ViewMode.ADMIN_CONTENT)} icon={<Video size={20}/>} label="Publicar Conteúdo" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_USERS} onClick={() => setSubView(ViewMode.ADMIN_USERS)} icon={<Users size={20}/>} label="Comunidade" />
          <SidebarLink active={currentSubView === ViewMode.ADMIN_PAYMENTS} onClick={() => setSubView(ViewMode.ADMIN_PAYMENTS)} icon={<CreditCard size={20}/>} label="Financeiro" />
        </nav>

        <button onClick={onLogout} className="mt-auto flex items-center gap-3 p-4 rounded-2xl text-zinc-500 hover:text-rose-500 transition-all font-bold text-sm">
          <LogOut size={20} /> Sair
        </button>
      </aside>

      {/* ÁREA DE CONTEÚDO */}
      <main className="flex-1 overflow-y-auto p-12 scrollbar-hide">
        {currentSubView === ViewMode.ADMIN_DASHBOARD && stats && (
          <div className="animate-apple">
            <h2 className="text-4xl font-black tracking-tighter mb-12">Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
              <StatCard label="Usuários" value={stats.totalUsers} icon={<Users className="text-blue-500"/>} />
              <StatCard label="Premium" value={stats.premiumUsers} icon={<ShieldCheck className="text-amber-500"/>} />
              <StatCard label="Receita" value={`R$ ${stats.estimatedRevenue.toFixed(2)}`} icon={<TrendingUp className="text-emerald-500"/>} />
              <StatCard label="Produções" value={stats.totalVideos} icon={<Video className="text-purple-500"/>} />
            </div>
          </div>
        )}

        {currentSubView === ViewMode.ADMIN_CONTENT && (
          <div className="max-w-2xl mx-auto animate-apple">
            <h2 className="text-4xl font-black tracking-tighter mb-8">Nova Produção</h2>
            <form onSubmit={handleUpload} className="space-y-6">
               <div className="space-y-2">
                 <label className="text-[10px] font-black uppercase text-zinc-500">Informações Básicas</label>
                 <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Título do Vídeo" className="w-full bg-[#16161A] border border-white/5 p-5 rounded-2xl outline-none focus:border-rose-500 transition-all" />
                 <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição" className="w-full bg-[#16161A] border border-white/5 p-5 rounded-2xl outline-none h-32" />
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500">Vídeo Principal (MP4)</label>
                    <input type="file" accept="video/mp4" onChange={e => setSelectedVideo(e.target.files?.[0] || null)} className="w-full text-xs text-zinc-500 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:bg-white/5 file:text-white hover:file:bg-white/10" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-zinc-500">Thumbnail (1080x1920)</label>
                    <input type="file" accept="image/*" onChange={handleThumbnailChange} className="w-full text-xs text-zinc-500 file:mr-4 file:py-3 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:bg-white/5 file:text-white" />
                  </div>
               </div>

               <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-[2rem] space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Music size={16} className="text-rose-500" />
                    <label className="text-[10px] font-black uppercase text-rose-500 tracking-widest">Trilhas de Áudio (Opcional)</label>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="file" accept="audio/*" onChange={e => setSelectedAudio1(e.target.files?.[0] || null)} className="text-xs text-zinc-600 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/5 file:text-zinc-400" />
                    <input type="file" accept="audio/*" onChange={e => setSelectedAudio2(e.target.files?.[0] || null)} className="text-xs text-zinc-600 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white/5 file:text-zinc-400" />
                  </div>
                  <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">Formatos aceitos: MP3, AAC, WAV (Mono ou Estéreo)</p>
               </div>

               <div className="flex items-center gap-3 p-5 bg-[#16161A] rounded-2xl border border-white/5">
                 <input type="checkbox" checked={isPremium} onChange={e => setIsPremium(e.target.checked)} className="w-5 h-5 accent-rose-500" />
                 <span className="text-sm font-bold text-zinc-400">Marcar como Conteúdo Premium</span>
               </div>

               <button disabled={loading} className="w-full py-6 bg-white text-black font-black rounded-3xl hover:bg-zinc-200 transition-all shadow-xl shadow-white/5 flex items-center justify-center">
                 {loading ? <div className="w-6 h-6 border-4 border-black/30 border-t-black rounded-full animate-spin" /> : "PUBLICAR AGORA"}
               </button>
            </form>
          </div>
        )}

        {currentSubView === ViewMode.ADMIN_USERS && (
          <div className="animate-apple">
            <h2 className="text-4xl font-black tracking-tighter mb-8">Usuários</h2>
            <div className="bg-[#16161A] border border-white/5 rounded-[2.5rem] overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-white/5 text-[10px] font-black uppercase text-zinc-500">
                  <tr>
                    <th className="p-6">Nome</th>
                    <th className="p-6">Status</th>
                    <th className="p-6">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map(u => (
                    <tr key={u.id}>
                      <td className="p-6 font-bold">{u.nome}</td>
                      <td className="p-6">
                        <span className={`px-3 py-1 rounded-full text-[9px] font-black ${u.isPremium ? 'bg-amber-500/10 text-amber-500' : 'bg-zinc-800 text-zinc-500'}`}>
                          {u.isPremium ? 'Premium' : 'Free'}
                        </span>
                      </td>
                      <td className="p-6">
                        <button onClick={() => deleteUser(u.id)} className="text-rose-500 hover:text-rose-400"><Trash2 size={18}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

const SidebarLink = ({ active, onClick, icon, label }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all font-bold text-sm ${active ? 'bg-rose-600 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'}`}>
    {icon} {label}
  </button>
);

const StatCard = ({ label, value, icon }: any) => (
  <div className="bg-[#16161A] border border-white/5 p-8 rounded-[2rem]">
    <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center mb-6">{icon}</div>
    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">{label}</div>
    <div className="text-3xl font-black tracking-tighter">{value}</div>
  </div>
);

export default AdminDashboard;
